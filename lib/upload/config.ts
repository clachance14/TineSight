/**
 * Bulk Upload Configuration
 *
 * Central configuration for 10K photo bulk upload feature.
 * Values tuned based on research.md findings and spec requirements.
 */

// Batch processing configuration
export const UPLOAD_CONFIG = {
  /**
   * Number of files per chunk for batch processing.
   * Each chunk gets a batch of signed URLs and is uploaded together.
   */
  CHUNK_SIZE: 25,

  /**
   * Maximum concurrent uploads to Supabase Storage.
   * Browser limit is ~6-8 per domain; we stay conservative.
   */
  PARALLEL_UPLOADS: 5,

  /**
   * Maximum retry attempts for failed uploads.
   * Uses exponential backoff between retries.
   */
  MAX_RETRIES: 3,

  /**
   * Base delay for retry exponential backoff (ms).
   * Actual delay: baseDelay * 2^(attempt-1) + jitter
   */
  RETRY_BASE_DELAY_MS: 1000,

  /**
   * Maximum retry delay cap (ms).
   */
  RETRY_MAX_DELAY_MS: 30000,

  /**
   * Jitter percentage for retry delays.
   * Prevents thundering herd on retries.
   */
  RETRY_JITTER_PERCENT: 0.1,

  /**
   * Size of binary slice for EXIF extraction (bytes).
   * 128KB covers EXIF + IPTC metadata for all trail camera photos.
   */
  EXIF_SLICE_SIZE: 128 * 1024,

  /**
   * Signed URL validity (seconds).
   * Supabase default is 2 hours, we request 1 hour for safety.
   */
  SIGNED_URL_EXPIRY_SECONDS: 3600,

  /**
   * Progress update throttle interval (ms).
   * Prevents UI flooding with progress updates.
   */
  PROGRESS_THROTTLE_MS: 100,

  /**
   * Minimum upload timeout (ms).
   * Ensures slow connections have adequate time.
   */
  MIN_UPLOAD_TIMEOUT_MS: 120_000,

  /**
   * Default upload timeout (ms).
   * Extended for large files on slow connections.
   */
  DEFAULT_UPLOAD_TIMEOUT_MS: 120000,

  /**
   * Timeout scaling factor (ms per MB).
   * Adds extra time based on file size.
   */
  TIMEOUT_PER_MB_MS: 60_000,
} as const

// Supported image MIME types for bulk upload
export const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
] as const

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number]

// File extensions mapped to MIME types
export const MIME_TYPE_MAP: Record<string, SupportedMimeType> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.heic': 'image/heic',
  '.webp': 'image/webp',
}

/**
 * Check if a MIME type is supported for upload
 */
export function isSupportedMimeType(mimeType: string): mimeType is SupportedMimeType {
  return SUPPORTED_MIME_TYPES.includes(mimeType as SupportedMimeType)
}

/**
 * Content type to declare for a file when initiating an upload.
 *
 * Browsers report an empty `File.type` for some pickers (SD-card and USB folder
 * pickers on Android, some Files-app paths on iOS). The uploaders accept those
 * files by extension, so the server must be told the type by extension too —
 * POST /api/photos/upload rejects the WHOLE chunk on an unsupported content type,
 * and an empty string is unsupported. Unknown extensions resolve to '' so the
 * server still rejects them with a clear message rather than being lied to.
 */
export function resolveUploadContentType(
  filename: string,
  mimeType: string | null | undefined
): string {
  if (mimeType !== null && mimeType !== undefined && mimeType !== '') return mimeType
  const dot = filename.lastIndexOf('.')
  const ext = dot === -1 ? '' : filename.slice(dot).toLowerCase()
  return MIME_TYPE_MAP[ext] ?? ''
}

/**
 * Size-scaled transfer deadline: generous, because SD-card-to-cellular transfers of
 * large originals must not time out. Used by the shared XHR transfer.
 */
export function calculateUploadTimeout(fileSizeBytes: number): number {
  const fileSizeMB = fileSizeBytes / (1024 * 1024)
  const dynamicTimeout = Math.ceil(fileSizeMB * UPLOAD_CONFIG.TIMEOUT_PER_MB_MS)
  return Math.max(UPLOAD_CONFIG.MIN_UPLOAD_TIMEOUT_MS, dynamicTimeout)
}

/**
 * Calculate exponential backoff delay with jitter
 */
export function calculateRetryDelay(attempt: number): number {
  const exponentialDelay =
    UPLOAD_CONFIG.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1)
  const jitter = Math.random() * exponentialDelay * UPLOAD_CONFIG.RETRY_JITTER_PERCENT
  return Math.min(exponentialDelay + jitter, UPLOAD_CONFIG.RETRY_MAX_DELAY_MS)
}
