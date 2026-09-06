import { createHash } from 'node:crypto'
/** Stable slots within a persisted detection result make retried inserts idempotent. */
export function detectionIdentity(imageId: string, kind: string, index: number): string {
  const hex = createHash('sha256').update(`${imageId}:${kind}:${index}`).digest('hex').slice(0, 32)
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}
