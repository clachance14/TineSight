/**
 * Bulk Upload Types
 *
 * TypeScript types for the 10K photo bulk upload feature.
 * Matches the contracts/upload-api.yaml specification.
 */

import type { SupportedMimeType } from './config'

// =============================================================================
// Re-exports from upload store (for convenience)
// =============================================================================

export type { UploadFile, UploadInitData, LocationData } from '../stores/upload'

// =============================================================================
// Upload Session Types
// =============================================================================

/**
 * Status of an upload session.
 * Matches UploadSession schema in upload-api.yaml.
 */
export type UploadSessionStatus =
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'partial_error'
  | 'failed'

/**
 * Upload session for tracking batch uploads.
 * Groups multiple file chunks into a single session.
 */
export interface UploadSession {
  /** Unique session identifier */
  id: string
  /** User who initiated the upload */
  userId: string
  /** Total number of files in the session */
  totalImages: number
  /** Number of files successfully uploaded to storage */
  uploadedCount: number
  /** Number of files processed by AI pipeline */
  processedCount: number
  /** Number of files that failed to upload or process */
  failedCount: number
  /** Number of duplicate files skipped */
  skippedCount: number
  /** Current session status */
  status: UploadSessionStatus
  /** When the session was created */
  createdAt: string
  /** When the session completed (null if still active) */
  completedAt: string | null
}

// =============================================================================
// File Status Types
// =============================================================================

/**
 * State of an individual file during upload.
 */
export type FileStatusState =
  | 'pending'     // Waiting to be processed
  | 'hashing'     // Computing hash for deduplication
  | 'uploading'   // Currently uploading to storage
  | 'processing'  // Uploaded, being processed by AI
  | 'completed'   // Successfully uploaded and processed
  | 'failed'      // Failed to upload or process
  | 'skipped'     // Skipped (duplicate or invalid)

/**
 * Legacy file status type (simple string union).
 * @deprecated Use FileStatusState instead for more detailed tracking.
 */
export type FileStatus = 'pending' | 'uploading' | 'completed' | 'failed' | 'skipped'

/**
 * Tracks the status of an individual file during upload.
 */
export interface FileStatusInfo {
  /** Client-generated ID for tracking (not DB ID) */
  clientId: string
  /** Original filename */
  filename: string
  /** File size in bytes */
  size: number
  /** MIME type of the file */
  mimeType: SupportedMimeType
  /** Current state of the file */
  state: FileStatusState
  /** Upload progress percentage (0-100) */
  progress: number
  /** Error message if state is 'failed' */
  errorMessage?: string
  /** Number of retry attempts */
  retryCount: number
  /** Pre-created image record ID from signed URL response */
  imageId?: string
  /** Signed upload URL (valid for limited time) */
  signedUrl?: string
  /** Full storage path in Supabase Storage */
  storagePath?: string
  /** Extracted EXIF metadata */
  exifData?: ExifMetadata | null
}

// =============================================================================
// Chunk Status Types
// =============================================================================

/**
 * State of a chunk (batch) during upload.
 */
export type ChunkStatusState =
  | 'pending'     // Waiting to be processed
  | 'uploading'   // Files in chunk are being uploaded
  | 'completed'   // All files in chunk completed
  | 'failed'      // Some or all files failed
  | 'partial'     // Some files succeeded, some failed

/**
 * Tracks the status of a chunk (batch of files).
 */
export interface ChunkStatus {
  /** Index of this chunk (0-based) */
  index: number
  /** Total number of files in the chunk */
  totalFiles: number
  /** Number of files completed successfully */
  completedFiles: number
  /** Number of files that failed */
  failedFiles: number
  /** Number of files skipped (duplicates) */
  skippedFiles: number
  /** Current state of the chunk */
  state: ChunkStatusState
  /** Timestamp when chunk started processing */
  startedAt?: string
  /** Timestamp when chunk finished processing */
  completedAt?: string
}

// =============================================================================
// Progress Tracking Types
// =============================================================================

/**
 * Real-time progress tracking for upload UI.
 */
export interface UploadProgress {
  /** Total number of files to upload */
  totalFiles: number
  /** Number of files successfully uploaded */
  uploadedFiles: number
  /** Number of files currently uploading */
  uploadingFiles: number
  /** Number of files that failed */
  failedFiles: number
  /** Number of files skipped (duplicates) */
  skippedFiles: number
  /** Overall progress percentage (0-100) */
  overallProgress: number
  /** Total bytes to upload */
  totalBytes: number
  /** Bytes uploaded so far */
  uploadedBytes: number
  /** Current upload speed in bytes/second */
  bytesPerSecond: number
  /** Estimated time remaining in seconds */
  estimatedSecondsRemaining: number | null
  /** Current chunk being processed */
  currentChunk: number
  /** Total number of chunks */
  totalChunks: number
  /** Whether upload is paused */
  isPaused: boolean
  /** Whether upload has been cancelled */
  isCancelled: boolean
}

// =============================================================================
// EXIF Metadata Types
// =============================================================================

/**
 * GPS coordinates extracted from EXIF data.
 */
export interface GpsCoordinates {
  /** Latitude in decimal degrees */
  latitude: number
  /** Longitude in decimal degrees */
  longitude: number
  /** Altitude in meters (if available) */
  altitude?: number
}

/**
 * EXIF metadata extracted from trail camera photos.
 * Extracted by Web Worker to avoid blocking main thread.
 */
export interface ExifMetadata {
  /** Camera manufacturer (e.g., "MUDDY", "BUSHNELL") */
  make?: string
  /** Camera model (e.g., "MUD_MTC16") */
  model?: string
  /** Date and time photo was taken (ISO 8601 format) */
  dateTime?: string
  /** Original date/time from camera (may differ from dateTime) */
  dateTimeOriginal?: string
  /** GPS coordinates (if available) */
  gps?: GpsCoordinates
  /** Image width in pixels */
  imageWidth?: number
  /** Image height in pixels */
  imageHeight?: number
  /** Camera orientation (1-8 EXIF standard) */
  orientation?: number
  /** Software/firmware version */
  software?: string
}

// =============================================================================
// API Request/Response Types
// =============================================================================

/**
 * Single file info for signed URL request.
 */
export interface SignedUrlFileInfo {
  /** Original filename */
  filename: string
  /** File size in bytes */
  size: number
  /** MIME type */
  mimeType: SupportedMimeType
  /** EXIF metadata extracted by Web Worker */
  exifData?: ExifMetadata | null
}

/**
 * Legacy signed URL file type.
 * @deprecated Use SignedUrlFileInfo instead.
 */
export interface SignedUrlFile {
  filename: string
  size: number
  mimeType: string
  exifData?: {
    make?: string
    model?: string
    dateTime?: string
  } | null
}

/**
 * Request to generate batch signed URLs.
 * POST /api/photos/signed-urls
 */
export interface SignedUrlRequest {
  /** Parent upload session ID */
  sessionId: string
  /** Files to generate URLs for (max 25) */
  files: SignedUrlFileInfo[]
}

/**
 * Single signed URL response info.
 */
export interface SignedUrlInfo {
  /** Original filename */
  filename: string
  /** Pre-created image record ID */
  imageId: string
  /** Supabase Storage signed upload URL */
  signedUrl: string
  /** Full storage path */
  storagePath: string
}

/**
 * Response from batch signed URL generation.
 */
export interface SignedUrlResponse {
  /** Array of signed URL info for each file */
  urls: SignedUrlInfo[]
}

/**
 * Single file info for duplicate check.
 */
export interface DuplicateCheckFile {
  /** Original filename */
  filename: string
  /** File size in bytes */
  size: number
}

/**
 * Request to check for duplicate files.
 * POST /api/photos/check-duplicates
 */
export interface DuplicateCheckRequest {
  /** Files to check (max 1000) */
  files: DuplicateCheckFile[]
}

/**
 * Response from duplicate check.
 */
export interface DuplicateCheckResponse {
  /** Filenames that already exist (skip these) */
  existing: string[]
  /** Filenames to upload (not duplicates) */
  toUpload: string[]
  /** Total files checked */
  totalChecked: number
  /** Number of duplicates found */
  duplicateCount: number
}

/**
 * Response from URL refresh for failed upload.
 * POST /api/photos/{imageId}/refresh-url
 */
export interface RefreshUrlResponse {
  /** Fresh signed URL */
  signedUrl: string
  /** URL expiration time */
  expiresAt: string
}

// =============================================================================
// Upload Chunk Types (for chunker utility)
// =============================================================================

/**
 * File with extracted metadata ready for chunking.
 */
export interface FileWithMetadata {
  /** The actual File object */
  file: File
  /** Client-generated ID for tracking */
  clientId: string
  /** Extracted EXIF metadata (null if extraction failed) */
  exifData: ExifMetadata | null
  /** Computed file hash for deduplication (optional) */
  hash?: string
}

/**
 * A chunk of files ready for batch upload.
 */
export interface UploadChunk {
  /** Index of this chunk (0-based) */
  index: number
  /** Files in this chunk */
  files: FileWithMetadata[]
  /** Number of files in the chunk */
  count: number
}

/**
 * Extended file metadata for internal processing.
 */
export interface FileWithMetadataExtended {
  /** Unique file identifier */
  id: string
  /** Original File object */
  file: File
  /** Original filename */
  filename: string
  /** File size in bytes */
  size: number
  /** MIME type */
  mimeType: string
  /** File status */
  status: FileStatus
  /** EXIF capture timestamp */
  capturedAt?: Date | null
  /** Camera make from EXIF */
  make?: string | null
  /** Camera model from EXIF */
  model?: string | null
  /** Device identifier (combined make+model) */
  deviceIdentifier?: string | null
  /** EXIF signature hash */
  exifSignature?: string | null
  /** Full EXIF data */
  exifData?: Record<string, unknown>
  /** Pre-created image record ID (after signed URL) */
  imageId?: string
  /** Signed upload URL */
  uploadUrl?: string
  /** Storage path */
  storagePath?: string
  /** Error message if failed */
  error?: string
  /** Retry attempt count */
  retryCount?: number
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Upload error with context.
 */
export interface UploadErrorInfo {
  /** Error code for categorization */
  code: UploadErrorCode
  /** Human-readable error message */
  message: string
  /** File that caused the error (if applicable) */
  filename?: string
  /** Original error (for debugging) */
  originalError?: unknown
  /** Whether the error is retryable */
  retryable: boolean
}

/**
 * Error codes for upload failures.
 */
export type UploadErrorCode =
  | 'NETWORK_ERROR'       // Network connection failed
  | 'TIMEOUT'             // Upload timed out
  | 'RATE_LIMITED'        // Too many requests (429)
  | 'UNAUTHORIZED'        // Authentication failed (401)
  | 'FORBIDDEN'           // Access denied (403)
  | 'NOT_FOUND'           // Resource not found (404)
  | 'STORAGE_ERROR'       // Supabase Storage error
  | 'INVALID_FILE'        // File validation failed
  | 'FILE_TOO_LARGE'      // File exceeds size limit
  | 'UNSUPPORTED_TYPE'    // Unsupported MIME type
  | 'QUOTA_EXCEEDED'      // Storage quota exceeded
  | 'SESSION_EXPIRED'     // Upload session expired
  | 'URL_EXPIRED'         // Signed URL expired
  | 'CANCELLED'           // Upload was cancelled
  | 'UNKNOWN'             // Unknown error

/**
 * Legacy error type for categorization.
 */
export type ErrorType = 'network' | 'timeout' | 'http' | 'unknown'

/**
 * Structured upload error (extends Error).
 */
export interface UploadError extends Error {
  /** Error type for retry logic */
  type: ErrorType
  /** HTTP status code if applicable */
  status?: number
  /** Whether this error is transient (retryable) */
  isTransient: boolean
  /** Original error if wrapped */
  cause?: Error
}

// =============================================================================
// Retry Options
// =============================================================================

/**
 * Retry options for upload operations.
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number
  /** Base delay for exponential backoff in ms (default: 1000) */
  baseDelayMs?: number
  /** Maximum delay cap in ms (default: 30000) */
  maxDelayMs?: number
  /** Jitter percentage 0-1 (default: 0.1) */
  jitterPercent?: number
  /** Callback fired before each retry attempt */
  onRetry?: (attempt: number, error: Error, delayMs: number) => void
}
