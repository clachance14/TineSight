import { useUploadStore, type UploadFile } from '../stores/upload'
import { createUploadLimiter, transferBatch, type UploadTransfer } from './transfer'
import { registerUploadRun, releaseUploadRun, isUserUploadCancellation } from './active-run'
import { awaitThrottleAdmission, type UploadRunThrottle } from './run'

/** Retry existing reservations in place; return files whose initialization must be retried. */
export async function retryFailedUploads(transfer: UploadTransfer, sessionId?: string, throttle?: UploadRunThrottle): Promise<UploadFile[]> {
  const store = useUploadStore.getState()
  const retryable = store.uploadQueue.filter(file => file.status === 'failed' && file.file !== undefined)
  store.retryFailedFiles()
  const runId = sessionId ?? crypto.randomUUID()
  const controller = registerUploadRun(runId)
  const limit = createUploadLimiter(5)
  const groups = new Map<string, UploadFile[]>()
  const uninitialized: UploadFile[] = []
  for (const file of retryable) {
    if ((file.batchId == null) || (file.imageId == null) || (file.uploadUrl == null)) { uninitialized.push(file); continue }
    if (!groups.has(file.batchId)) groups.set(file.batchId, [])
    const group = groups.get(file.batchId) ?? []
    group.push(file)
    groups.set(file.batchId, group)
  }
  try {
    // Retries re-enter storage transfer through the same admission gate as a fresh run.
    await awaitThrottleAdmission(throttle, controller.signal)
    for (const [batchId, files] of groups) {
      const uploads = files.map(file => ({fileId:file.id,imageId:file.imageId ?? '',uploadUrl:file.uploadUrl ?? ''}))
      store.startUpload(batchId, uploads)
      await transferBatch({batchId,files,uploads,limit,signal:controller.signal,
        transfer: (file,url)=>(file.uploadedToStorage ?? false) ? Promise.resolve({success:true}) : transfer(file,url,controller.signal),
        transferred: store.markFileTransferred,completed:store.markFileCompleted,failed:store.markFileFailed,
      })
    }
    controller.signal.throwIfAborted()
    return uninitialized
  } catch (error) {
    if (isUserUploadCancellation(controller.signal)) store.cancelFiles(retryable.map(file => file.id))
    throw error
  } finally {
    releaseUploadRun(runId)
    if (!controller.signal.aborted || useUploadStore.getState().uploadQueue.some(file => retryable.some(previous => previous.id === file.id))) store.setIsPreparing(false)
  }
}
