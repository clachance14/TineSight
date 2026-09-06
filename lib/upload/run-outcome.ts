/**
 * Pure helpers for interpreting the batch-initialization phase of an upload run.
 *
 * Both uploaders create an upload session, then call POST /api/photos/upload once
 * per chunk to create a batch and mint signed URLs. A session only ever leaves
 * 'uploading' through the database trigger that fires on batch rows
 * (migration 025), so a run in which NO chunk produced a batch must be closed by
 * the client and explained to the user. This module decides when that is the case.
 */

export type BatchInitResult = { ok: true } | { ok: false; error: string }

export interface BatchInitSummary {
  attempted: number
  failed: number
  /** At least one chunk was attempted and none of them produced a batch. */
  allFailed: boolean
  /** User-facing explanation, or null when every chunk initialized. */
  message: string | null
}

export function summarizeBatchInits(results: readonly BatchInitResult[]): BatchInitSummary {
  const attempted = results.length
  const failures = results.filter((r): r is { ok: false; error: string } => !r.ok)
  const failed = failures.length
  const firstError = failures[0]?.error ?? 'Failed to initialize upload'

  if (attempted > 0 && failed === attempted) {
    return {
      attempted,
      failed,
      allFailed: true,
      message: `Upload could not start: ${firstError}`,
    }
  }

  if (failed > 0) {
    return {
      attempted,
      failed,
      allFailed: false,
      message: `${failed} of ${attempted} upload batches could not start: ${firstError}`,
    }
  }

  return { attempted, failed: 0, allFailed: false, message: null }
}
