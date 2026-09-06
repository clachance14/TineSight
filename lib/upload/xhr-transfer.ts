/**
 * Storage transfer for one original, shared by both uploaders. Reports progress
 * to the upload store, success/failure to the adaptive throttler, and optional
 * per-attempt hooks (the simple uploader's debug logger and metrics).
 */
import { batchedUpdateProgress, type UploadFile } from '../stores/upload'
import { UPLOAD_CONFIG, calculateUploadTimeout, resolveUploadContentType } from './config'
import { classifyXHRError, type ErrorType } from '../throttle'
import type { AdaptiveThrottler } from '../throttle'
import type { TransferResult, UploadTransfer } from './transfer'
import { observe } from './observe'

export interface XhrTransferHooks {
  onStart?: (file: UploadFile, bytes: number) => void
  onComplete?: (file: UploadFile, durationMs: number, bytes: number) => void
  onFailed?: (file: UploadFile, error: string, failure: { event: 'http' | 'network' | 'timeout'; kind: ErrorType; durationMs: number }) => void
}

export interface XhrTransferOptions {
  /** Optional as a whole, never partial (see UploadRunThrottle). */
  throttle?: Pick<AdaptiveThrottler, 'recordSuccess' | 'recordFailure'> | undefined
  hooks?: XhrTransferHooks | undefined
  /** Progress is reported at most this often per file, plus the first and final update. */
  progressThrottleMs?: number
}

export function createXhrTransfer(options: XhrTransferOptions = {}): UploadTransfer {
  const throttleMs = options.progressThrottleMs ?? UPLOAD_CONFIG.PROGRESS_THROTTLE_MS
  return (file, uploadUrl, signal) => new Promise<TransferResult>((resolve) => {
    const source = file.file
    if (source === undefined) { resolve({ success: false, error: 'Original file is unavailable; select it again' }); return }
    if (signal.aborted) { resolve({ success: false, error: 'Upload cancelled' }); return }

    const xhr = new XMLHttpRequest()
    const abort = (): void => xhr.abort()
    signal.addEventListener('abort', abort, { once: true })
    const startedAt = Date.now()
    let lastProgressAt = 0
    const finish = (result: TransferResult): void => {
      signal.removeEventListener('abort', abort)
      resolve(result)
    }
    const fail = (event: 'http' | 'network' | 'timeout', kind: ErrorType, error: string, detail: Record<string, unknown>): void => {
      const durationMs = Date.now() - startedAt
      console.error(`[Upload ${event}] ${file.filename}`, detail)
      options.throttle?.recordFailure(kind)
      observe(options.hooks?.onFailed, file, error, { event, kind, durationMs })
      finish({ success: false, error })
    }
    observe(options.hooks?.onStart, file, source.size)

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      const now = Date.now()
      const progress = Math.round((event.loaded / event.total) * 100)
      if (lastProgressAt === 0 || progress === 100 || now - lastProgressAt > throttleMs) {
        lastProgressAt = now
        batchedUpdateProgress(file.id, progress)
      }
    }
    xhr.onabort = () => finish({ success: false, error: 'Upload cancelled' })
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const duration = Date.now() - startedAt
        options.throttle?.recordSuccess(duration)
        observe(options.hooks?.onComplete, file, duration, source.size)
        finish({ success: true })
        return
      }
      fail('http', classifyXHRError(xhr), `Upload failed: ${xhr.status} ${xhr.statusText}`, { status: xhr.status, statusText: xhr.statusText, response: xhr.responseText?.slice(0, 500) })
    }
    xhr.onerror = () => fail('network', 'network', 'Network error - browser connection failed', { readyState: xhr.readyState })
    xhr.ontimeout = () => fail('timeout', 'network', 'Upload timeout', { timeoutMs: xhr.timeout })

    xhr.timeout = calculateUploadTimeout(source.size)
    xhr.open('PUT', uploadUrl)
    // The same resolver the batch initialization used, so storage and the
    // reservation agree on the type even when the browser reports none.
    const contentType = resolveUploadContentType(file.filename, source.type)
    xhr.setRequestHeader('Content-Type', contentType !== '' ? contentType : 'application/octet-stream')
    xhr.send(source)
  })
}
