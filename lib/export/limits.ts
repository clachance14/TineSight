// Matches the exports bucket hard limit in migration 036.
export const MAX_EXPORT_BYTES = 500 * 1024 * 1024
export const EXPORT_TOO_LARGE = 'Selected photos exceed the 500 MB export limit. Split them into smaller exports.'
export class ExportSizeError extends Error {
  constructor() { super(EXPORT_TOO_LARGE); this.name = 'ExportSizeError' }
}
/** ZIP/deflate overhead allowance; unknown metadata is checked on streamed bytes. */
export function assertExportSize(photos: Array<{ file_size_bytes?: number | null }>): void {
  const known = photos.reduce((sum, photo) => {
    const size = photo.file_size_bytes
    return sum + (typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : 0)
  }, 0)
  if (known + Math.ceil(known / 1000) + photos.length * 1024 > MAX_EXPORT_BYTES) throw new ExportSizeError()
}
