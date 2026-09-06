/**
 * Client-side close for an upload session that never produced a batch.
 *
 * The database trigger that maintains upload_sessions.status only fires on
 * processing_batches rows, so a session whose every batch-init call failed would
 * otherwise sit at 'uploading' forever. Best-effort: a failure here is logged, not
 * thrown, because the user-facing error has already been decided by the caller.
 */
export async function markUploadSessionFailed(sessionId: string): Promise<void> {
  try {
    const res = await fetch(`/api/photos/upload-session/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'failed' }),
    })
    if (!res.ok) {
      console.error(`[Upload] Could not mark session ${sessionId} failed: ${res.status}`)
    }
  } catch (err) {
    console.error(`[Upload] Could not mark session ${sessionId} failed:`, err)
  }
}
