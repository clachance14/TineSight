/**
 * One upload run, shared by "Upload a folder" (BulkUploader) and "Choose photos"
 * (the simple uploader on the upload page).
 *
 * Owns everything between "these pending store files are ready" and "the upload
 * session is finished": session creation, chunking, batch initialization, the
 * pipelined transfer rounds, the processing handoff, the session close,
 * cancellation teardown, and every store transition in between. Preparation
 * (EXIF, hashing, duplicates) and presentation (stages, failure lists, logging)
 * stay with the callers, which observe the run through the optional callbacks.
 *
 * Retrying failed photos is a separate coordinator (retry-failed.ts): it reuses
 * existing reservations, which a fresh run must never do.
 */
import { useUploadStore, type LocationData, type UploadFile, type UploadInitData } from '../stores/upload'
import { UPLOAD_CONFIG, resolveUploadContentType } from './config'
import { chunkArray } from './chunker'
import { acknowledgedFetch, createUploadLimiter, transferBatch, type UploadTransfer } from './transfer'
import { observe } from './observe'
import type { AdaptiveThrottler } from '../throttle'
import { summarizeBatchInits, type BatchInitResult } from './run-outcome'
import { markUploadSessionFailed } from './session-status'
import { registerUploadRun, releaseUploadRun, isUserUploadCancellation } from './active-run'

/** The part of the adaptive throttler a run needs. Optional as a whole, never partial. */
export type UploadRunThrottle = Pick<AdaptiveThrottler, 'startSession' | 'stopSession' | 'shouldProceed' | 'waitForRecovery'>

/**
 * Throttle admission shared by fresh runs and reservation retries: honor a
 * recovery wait, and let cancellation end the wait.
 */
export async function awaitThrottleAdmission(throttle: UploadRunThrottle | undefined, signal: AbortSignal): Promise<void> {
  if (throttle === undefined) return
  const proceed = throttle.shouldProceed()
  if (!proceed.allowed && (proceed.waitMs ?? 0) > 0) {
    await Promise.race([throttle.waitForRecovery(), abortRejection(signal)])
  }
  signal.throwIfAborted()
}

/** Batch-level location: the store's shape, which the picker and saved locations already produce. */
export type UploadRunLocation = LocationData

export interface UploadRunOptions {
  /** Pending store files owned by this run (already added to the upload store). */
  files: UploadFile[]
  transfer: UploadTransfer
  /** Location recorded on the batch created for a chunk; null for none. */
  location?: (chunk: UploadFile[]) => UploadRunLocation | null
  /** Files with different keys never share a transport chunk (e.g. per-folder locations). */
  groupKey?: (file: UploadFile) => string
  throttle?: UploadRunThrottle | undefined
  /** A run the caller already registered (so cancellation covers preparation too). */
  runId?: string
  controller?: AbortController
  chunkSize?: number
  parallelChunks?: number
  parallelUploads?: number
  onSession?: (sessionId: string) => void
  onBatchInitFailed?: (chunk: UploadFile[], message: string) => void
  onChunkStart?: (index: number, chunk: UploadFile[]) => void
  onChunkComplete?: (index: number, chunk: UploadFile[], durationMs: number) => void
  onFileFailed?: (file: UploadFile, error: string) => void
}

/** `handedOff`: at least one photo reached processing, so galleries should refresh whatever the status. */
interface RunCounts { completed: number; failed: number; handedOff: boolean }
export type UploadRunResult =
  | ({ status: 'completed'; sessionId: string | null } & RunCounts)
  | ({ status: 'failed'; reason: 'initialization' | 'finalization' | 'error'; sessionId: string | null; message: string } & RunCounts)
  | ({ status: 'cancelled'; byUser: boolean; sessionId: string | null } & RunCounts)

/** One serializer for POST /api/photos/upload, so both uploaders describe a file identically. */
export interface UploadFileRequest {
  id: string
  filename: string
  contentType: string
  size: number
  contentSha256?: string
  cameraId?: string
  capturedAt?: string
  make?: string
  model?: string
  deviceIdentifier?: string
  exifSignature?: string
  exifData?: Record<string, unknown>
}
export function serializeUploadFile(file: UploadFile): UploadFileRequest {
  const exifData = file.sourceFolder !== undefined ? { ...file.exifData, source_folder: file.sourceFolder } : file.exifData
  return {
    id: file.id,
    filename: file.filename,
    contentType: resolveUploadContentType(file.filename, file.file?.type),
    size: file.file?.size ?? 0,
    ...(file.contentSha256 !== undefined && { contentSha256: file.contentSha256 }),
    ...(file.cameraId != null && { cameraId: file.cameraId }),
    ...(file.capturedAt != null && { capturedAt: file.capturedAt.toISOString() }),
    ...(file.make != null && { make: file.make }),
    ...(file.model != null && { model: file.model }),
    ...(file.deviceIdentifier != null && { deviceIdentifier: file.deviceIdentifier }),
    ...(file.exifSignature != null && { exifSignature: file.exifSignature }),
    ...(exifData !== undefined && { exifData }),
  }
}

/** Batch-level fields of POST /api/photos/upload. */
interface BatchLocationFields {
  locationId?: string
  locationLat?: number
  locationLng?: number
  areaName?: string
  directionCompass?: number
  directionNotes?: string
}
function locationFields(location: UploadRunLocation | null): BatchLocationFields {
  if (location === null) return {}
  return {
    ...(location.locationId !== undefined && { locationId: location.locationId }),
    locationLat: location.lat,
    locationLng: location.lng,
    areaName: location.areaName,
    ...(location.directionCompass !== undefined && { directionCompass: location.directionCompass }),
    ...(location.directionNotes !== undefined && { directionNotes: location.directionNotes }),
  }
}

function abortRejection(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) { reject(signal.reason); return }
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
}

interface BatchData { chunk: UploadFile[]; batchId: string; uploads: UploadInitData[] }

export async function runUploadSession(options: UploadRunOptions): Promise<UploadRunResult> {
  const store = useUploadStore
  const runFileIds = new Set(options.files.map(file => file.id))
  const counts = (): RunCounts => {
    const mine = store.getState().uploadQueue.filter(file => runFileIds.has(file.id))
    const completed = mine.filter(f => f.status === 'completed').length
    return { completed, failed: mine.filter(f => f.status === 'failed').length, handedOff: completed > 0 }
  }
  if (options.files.length === 0) return { status: 'completed', sessionId: null, ...counts() }

  const runId = options.runId ?? crypto.randomUUID()
  const controller = registerUploadRun(runId, options.controller)
  const { signal } = controller
  const throttle = options.throttle
  let sessionId: string | null = null

  try {
    store.getState().setIsPreparing(true)

    // The adaptive throttler may ask for a recovery wait first; cancelling during
    // the wait must still settle the run.
    await awaitThrottleAdmission(throttle, signal)

    // A session groups the batches for the status bar and the gallery. Its absence
    // is tolerated: the batches still upload and process.
    try {
      const sessionRes = await fetch('/api/upload-sessions', { signal, method: 'POST', headers: { 'Content-Type': 'application/json' } })
      signal.throwIfAborted()
      if (sessionRes.ok) {
        const sessionData = await sessionRes.json() as { sessionId: string }
        signal.throwIfAborted()
        sessionId = sessionData.sessionId
        registerUploadRun(sessionId, controller)
        observe(options.onSession, sessionId)
      }
    } catch (error) {
      if (signal.aborted) throw error
      console.error('Failed to create upload session:', error)
    }
    signal.throwIfAborted()

    const chunkSize = options.chunkSize ?? UPLOAD_CONFIG.CHUNK_SIZE
    const parallelChunks = options.parallelChunks ?? 2
    const limit = createUploadLimiter(options.parallelUploads ?? UPLOAD_CONFIG.PARALLEL_UPLOADS)

    // Transport chunks never mix groups (a chunk becomes one batch with one location).
    const groups = new Map<string, UploadFile[]>()
    for (const file of options.files) {
      const key = options.groupKey?.(file) ?? ''
      const group = groups.get(key) ?? []
      group.push(file)
      groups.set(key, group)
    }
    const chunks = [...groups.values()].flatMap(group => chunkArray(group, chunkSize))

    // One entry per chunk: did POST /api/photos/upload produce a batch?
    const batchInitResults: BatchInitResult[] = []

    const initializeBatch = async (chunk: UploadFile[]): Promise<BatchData> => {
      const location = options.location?.(chunk) ?? null
      const response = await fetch('/api/photos/upload', {
        signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadSessionId: sessionId, ...locationFields(location), files: chunk.map(serializeUploadFile) }),
      })
      if (!response.ok) {
        const error = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(error.error ?? `Failed to initialize upload (${response.status})`)
      }
      const { batchId, uploads } = await response.json() as Omit<BatchData, 'chunk'>
      signal.throwIfAborted()
      return { chunk, batchId, uploads }
    }

    // A rejected chunk is recorded and its files carry the server's reason, so the
    // run can never report itself complete while files sit at 'pending'.
    const initializeBatchOrFail = async (chunk: UploadFile[]): Promise<BatchData | null> => {
      try {
        signal.throwIfAborted()
        const data = await initializeBatch(chunk)
        signal.throwIfAborted()
        batchInitResults.push({ ok: true })
        return data
      } catch (error) {
        if (signal.aborted) throw error
        const message = error instanceof Error ? error.message : 'Failed to initialize upload'
        console.error('Batch init failed:', error)
        batchInitResults.push({ ok: false, error: message })
        for (const file of chunk) store.getState().markFileFailed(file.id, message)
        observe(options.onBatchInitFailed, chunk, message)
        return null
      }
    }

    const uploadBatch = async (data: BatchData, index: number): Promise<void> => {
      const startedAt = Date.now()
      observe(options.onChunkStart, index, data.chunk)
      store.getState().startUpload(data.batchId, data.uploads)
      await transferBatch({
        batchId: data.batchId, files: data.chunk, uploads: data.uploads, limit, signal,
        transfer: (file, url) => options.transfer(file, url, signal),
        transferred: id => store.getState().markFileTransferred(id),
        completed: id => store.getState().markFileCompleted(id),
        failed: (id, error) => {
          store.getState().markFileFailed(id, error)
          const file = data.chunk.find(item => item.id === id)
          if (file !== undefined) observe(options.onFileFailed, file, error)
        },
      })
      observe(options.onChunkComplete, index, data.chunk, Date.now() - startedAt)
    }

    throttle?.startSession()

    // Pipeline: initialize the next round (signed URLs) while the current round transfers.
    const rounds = chunkArray(chunks, parallelChunks)
    let pendingInits = rounds[0]?.map(chunk => initializeBatchOrFail(chunk)) ?? []
    let chunkIndex = 0
    for (let round = 0; round < rounds.length; round++) {
      const ready = await Promise.all(pendingInits)
      if (round + 1 < rounds.length) pendingInits = rounds[round + 1]?.map(chunk => initializeBatchOrFail(chunk)) ?? []
      await Promise.all(ready.filter((data): data is BatchData => data !== null).map(data => uploadBatch(data, chunkIndex++)))
    }
    signal.throwIfAborted()

    // A run in which no chunk produced a batch has nothing for the database trigger
    // to close (it only fires on batch rows): close the session here and fail the run.
    const initSummary = summarizeBatchInits(batchInitResults)
    if (initSummary.allFailed) {
      if (sessionId !== null) await markUploadSessionFailed(sessionId)
      return { status: 'failed', reason: 'initialization', sessionId, message: initSummary.message ?? 'Upload could not start', ...counts() }
    }

    // The session only leaves 'uploading' once finish_upload_session records
    // upload_finished_at, so an unacknowledged close is a failed run: the photos are
    // safe and processing, but the session needs finishing.
    if (sessionId !== null) {
      try {
        await finishUploadSession(sessionId, signal)
      } catch (error) {
        if (signal.aborted) throw error
        const detail = error instanceof Error ? error.message : 'please retry'
        return { status: 'failed', reason: 'finalization', sessionId, message: `Photos uploaded, but the upload session could not be finished: ${detail}`, ...counts() }
      }
    }
    signal.throwIfAborted()
    return { status: 'completed', sessionId, ...counts() }
  } catch (error) {
    if (signal.aborted) {
      const byUser = isUserUploadCancellation(signal)
      if (byUser) store.getState().cancelFiles([...runFileIds])
      return { status: 'cancelled', byUser, sessionId, ...counts() }
    }
    const message = error instanceof Error ? error.message : 'Upload failed'
    console.error('Upload run failed:', error)
    // Abort so any straggling request settles as cancelled, then leave nothing of this run pending.
    controller.abort(message)
    for (const file of store.getState().uploadQueue) if (runFileIds.has(file.id)) store.getState().markFileFailed(file.id, message)
    return { status: 'failed', reason: 'error', sessionId, message, ...counts() }
  } finally {
    releaseUploadRun(runId)
    if (sessionId !== null) releaseUploadRun(sessionId)
    throttle?.stopSession()
    // After a user cancellation the store has already settled; only a run whose
    // files are still in the queue owns the preparing flag.
    if (!signal.aborted || store.getState().uploadQueue.some(file => runFileIds.has(file.id))) store.getState().setIsPreparing(false)
  }
}

/** Close-only retry for a finalization failure: the photos are already processing. */
export async function finishUploadSession(sessionId: string, signal?: AbortSignal): Promise<void> {
  await acknowledgedFetch(`/api/upload-sessions/${sessionId}/complete`, { method: 'POST', ...(signal && { signal }) })
}
