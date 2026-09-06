import type { UploadFile, UploadInitData } from '../stores/upload'

export type TransferResult = { success: boolean; error?: string }
/** One storage transfer of one original; the signal is the run's cancellation. */
export type UploadTransfer = (file: UploadFile, uploadUrl: string, signal: AbortSignal) => Promise<TransferResult>

/** Shared across chunks, so the cap is files rather than chunks × files. */
export function createUploadLimiter(concurrency = 5) {
  let active = 0
  const queue: Array<() => void> = []
  return async <T>(work: () => Promise<T>): Promise<T> => {
    await new Promise<void>((resolve) => {
      const start = (): void => { active++; resolve() }
      if (active < concurrency) start()
      else queue.push(start)
    })
    try { return await work() }
    finally { active--; queue.shift()?.() }
  }
}

export async function acknowledgedFetch(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      init.signal?.throwIfAborted()
      const deadline = AbortSignal.timeout(60000)
      const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline
      const response = await fetch(url, { ...init, signal })
      init.signal?.throwIfAborted()
      if (response.ok) return response
      const data = await response.json().catch(() => ({})) as { error?: string }
      const error = new Error(data.error ?? `Request failed (${response.status})`)
      if (response.status < 500 && response.status !== 429 && response.status !== 408) throw Object.assign(error, { permanent: true })
      lastError = error
    } catch (error) {
      if (((init.signal?.aborted) ?? false) || ((error as { permanent?: boolean }).permanent ?? false)) throw error
      lastError = error
    }
    if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt))
  }
  throw lastError
}

export interface TransferBatchOptions {
  batchId: string
  files: UploadFile[]
  uploads: UploadInitData[]
  limit: ReturnType<typeof createUploadLimiter>
  transfer: (file: UploadFile, uploadUrl: string) => Promise<TransferResult>
  transferred?: (id: string) => void
  completed: (id: string) => void
  failed: (id: string, error: string) => void
  signal?: AbortSignal
}

/** Retry every transfer before handing its batch to analysis. Success includes enqueue acknowledgement. */
export async function transferBatch(options: TransferBatchOptions): Promise<void> {
  const uploaded: Array<{ id: string; imageId: string }> = []
  const failedImageIds: string[] = []
  await Promise.all(options.files.map(file => options.limit(async () => {
    const info = options.uploads.find(upload => upload.fileId === file.id)
    if (!info || !file.file) {
      options.failed(file.id, 'File data or upload URL unavailable')
      if (info) failedImageIds.push(info.imageId)
      return
    }
    let url = info.uploadUrl
    let reason = 'Upload failed'
    for (let attempt = 0; attempt < 3; attempt++) {
      if ((options.signal?.aborted) ?? false) { reason = 'Upload cancelled'; break }
      try {
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** (attempt - 1)))
          options.signal?.throwIfAborted()
          const response = await acknowledgedFetch(`/api/photos/${info.imageId}/refresh-url`, { method: 'POST', ...(options.signal && { signal: options.signal }) })
          const refreshed = await response.json() as { uploadUrl: string }
          url = refreshed.uploadUrl
        }
        const result = await options.transfer(file, url)
        if (result.success) { options.transferred?.(file.id); uploaded.push({ id: file.id, imageId: info.imageId }); return }
        reason = result.error ?? reason
      } catch (error) { reason = error instanceof Error ? error.message : 'Upload failed' }
    }
    failedImageIds.push(info.imageId)
    options.failed(file.id, reason)
  })))
  if ((options.signal?.aborted) ?? false) {
    uploaded.forEach(file => options.failed(file.id, 'Upload cancelled'))
    return
  }
  try {
    await acknowledgedFetch('/api/photos/upload/complete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: options.batchId, uploadedImageIds: uploaded.map(file => file.imageId), failedImageIds }),
      ...(options.signal && { signal: options.signal }),
    })
    uploaded.forEach(file => options.completed(file.id))
  } catch (error) {
    const message = `Photos transferred, but processing could not start: ${error instanceof Error ? error.message : 'please retry'}`
    uploaded.forEach(file => options.failed(file.id, message))
    return
  }
}

export function requireUploadFile(file: UploadFile): File {
  if (file.file === undefined) throw new Error('Original file is unavailable; select it again')
  return file.file
}
