export const USER_UPLOAD_CANCELLED = 'Upload cancelled by user'
export function isUserUploadCancellation(signal: AbortSignal): boolean { return signal.aborted && signal.reason === USER_UPLOAD_CANCELLED }

/** Own cancellation outside a mounted page so in-app navigation preserves uploads. */
const activeRuns = new Map<string, AbortController>()
function cancelAllRuns(): void {
  for (const controller of activeRuns.values()) controller.abort()
  activeRuns.clear()
  if (typeof window !== 'undefined') {
    window.removeEventListener('beforeunload', warnBeforeUnload)
    window.removeEventListener('tinesight:account-changed', cancelAllRuns)
  }
}
function warnBeforeUnload(event: BeforeUnloadEvent): void {
  if (activeRuns.size > 0) { event.preventDefault(); event.returnValue = '' }
}
export function registerUploadRun(id: string, controller = new AbortController()): AbortController {
  if (typeof window !== 'undefined' && activeRuns.size === 0) {
    window.addEventListener('beforeunload', warnBeforeUnload)
    window.addEventListener('tinesight:account-changed', cancelAllRuns)
  }
  activeRuns.set(id, controller)
  return controller
}
export function releaseUploadRun(id: string): void {
  activeRuns.delete(id)
  if (typeof window !== 'undefined' && activeRuns.size === 0) {
    window.removeEventListener('beforeunload', warnBeforeUnload)
    window.removeEventListener('tinesight:account-changed', cancelAllRuns)
  }
}
export function cancelUploadRun(id: string): void { activeRuns.get(id)?.abort(USER_UPLOAD_CANCELLED) }
