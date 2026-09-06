import { hashPhotoContent } from './content-hash'
import { useUploadStore } from '../stores/upload'

export interface PreparationFailure { file: File; error: string }
export async function readOriginalHash(file: File): Promise<{ hash: string; failure?: never } | { hash?: never; failure: PreparationFailure }> {
  try { return { hash: await hashPhotoContent(file) } }
  catch { return { failure: { file, error: 'Original file could not be read. Reconnect the source and retry.' } } }
}
/** Keep unreadable originals visible/retryable without admitting them to transfer. */
export function recordPreparationFailures(failures: PreparationFailure[]): void {
  const store = useUploadStore.getState()
  store.addFiles(failures.map(({ file }) => ({ file })))
  for (const failure of failures) {
    for (const item of useUploadStore.getState().uploadQueue) {
      if (item.file === failure.file) store.markFileFailed(item.id, failure.error)
    }
  }
}
