/**
 * Parallel Upload Manager for Bulk File Uploads
 *
 * Features:
 * - Concurrent uploads (5 parallel by default)
 * - XHR-based progress tracking per file
 * - Throttled progress callbacks to prevent UI flooding
 * - Retry support with URL refresh
 * - Transient error detection
 */

import pLimit from 'p-limit'
import { UPLOAD_CONFIG, calculateUploadTimeout } from './config'

// ============================================================================
// Types
// ============================================================================

/**
 * Error types for upload failures
 */
export type UploadErrorType =
  | 'network' // Connection failed, timeout
  | 'server' // 5xx errors, server unavailable
  | 'client' // 4xx errors, bad request
  | 'timeout' // Upload timeout
  | 'aborted' // User cancelled
  | 'unknown' // Unclassified error

/**
 * Result of a single file upload
 */
export interface UploadResult {
  fileId: string
  success: boolean
  error?: string
  errorType?: UploadErrorType
  durationMs: number
  bytesUploaded: number
}

/**
 * Result of a batch upload operation
 */
export interface BatchUploadResult {
  successful: UploadResult[]
  failed: UploadResult[]
  totalDurationMs: number
}

/**
 * Parameters for a single file upload
 */
export interface FileUploadParams {
  fileId: string
  file: File
  signedUrl: string
  imageId?: string // For URL refresh on retry
  onProgress?: (percent: number) => void
}

/**
 * Options for the UploadManager
 */
export interface UploadManagerOptions {
  /** Maximum concurrent uploads (default: 5) */
  concurrency?: number
  /** Progress update throttle interval in ms (default: 100) */
  progressThrottleMs?: number
  /** Enable verbose logging (default: false) */
  debug?: boolean
}

// ============================================================================
// Error Classification
// ============================================================================

/**
 * Classify XHR error into an UploadErrorType
 */
function classifyXHRError(xhr: XMLHttpRequest): UploadErrorType {
  if (xhr.status === 0) {
    // Network error or CORS issue
    return 'network'
  }
  if (xhr.status >= 500) {
    return 'server'
  }
  if (xhr.status >= 400) {
    return 'client'
  }
  return 'unknown'
}

/**
 * Check if an upload error type is transient and worth retrying
 *
 * Note: This function works with UploadErrorType from the uploader.
 * For HTTP status codes, use isTransientError from ./retry.ts instead.
 */
export function isTransientUploadError(errorType: UploadErrorType): boolean {
  return errorType === 'network' || errorType === 'server' || errorType === 'timeout'
}

// ============================================================================
// Upload Manager
// ============================================================================

/**
 * Parallel upload manager for bulk file uploads
 *
 * @example
 * ```typescript
 * const manager = new UploadManager({ concurrency: 5 })
 *
 * // Single file upload
 * const result = await manager.uploadFile({
 *   fileId: 'file-1',
 *   file: fileObject,
 *   signedUrl: 'https://...',
 *   onProgress: (percent) => console.log(`${percent}%`)
 * })
 *
 * // Batch upload
 * const batchResult = await manager.uploadBatch(files)
 *
 * // Abort all pending uploads
 * manager.abort()
 * ```
 */
export class UploadManager {
  private readonly concurrency: number
  private readonly progressThrottleMs: number
  private readonly debug: boolean
  private readonly limiter: ReturnType<typeof pLimit>
  private readonly activeXhrs: Map<string, XMLHttpRequest>
  private aborted: boolean

  constructor(options?: UploadManagerOptions) {
    this.concurrency = options?.concurrency ?? UPLOAD_CONFIG.PARALLEL_UPLOADS
    this.progressThrottleMs = options?.progressThrottleMs ?? UPLOAD_CONFIG.PROGRESS_THROTTLE_MS
    this.debug = options?.debug ?? false
    this.limiter = pLimit(this.concurrency)
    this.activeXhrs = new Map()
    this.aborted = false
  }

  /**
   * Log debug message if debug mode is enabled
   */
  private log(message: string, data?: unknown): void {
    if (this.debug) {
      if (data !== undefined) {
        console.log(`[UploadManager] ${message}`, data)
      } else {
        console.log(`[UploadManager] ${message}`)
      }
    }
  }

  /**
   * Upload a single file to a signed URL
   *
   * Uses XMLHttpRequest for progress events since Fetch API
   * doesn't support upload progress tracking.
   *
   * @returns Upload result with timing metrics
   */
  uploadFile(params: {
    fileId: string
    file: File
    signedUrl: string
    onProgress?: (percent: number) => void
  }): Promise<UploadResult> {
    const { fileId, file, signedUrl, onProgress } = params

    return new Promise((resolve) => {
      // Check if already aborted
      if (this.aborted) {
        resolve({
          fileId,
          success: false,
          error: 'Upload aborted',
          errorType: 'aborted',
          durationMs: 0,
          bytesUploaded: 0,
        })
        return
      }

      const xhr = new XMLHttpRequest()
      const startTime = Date.now()
      let lastProgressUpdate = 0
      let bytesUploaded = 0

      // Track active XHR for abort support
      this.activeXhrs.set(fileId, xhr)

      // Calculate adaptive timeout based on file size
      const timeout = calculateUploadTimeout(file.size)

      this.log(`Starting upload: ${fileId}`, {
        fileName: file.name,
        fileSize: file.size,
        timeout,
      })

      // Progress handler with throttling
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const now = Date.now()
          const progress = Math.round((event.loaded / event.total) * 100)
          bytesUploaded = event.loaded

          // Always report: first update, 100%, or if throttle interval passed
          if (
            lastProgressUpdate === 0 ||
            progress === 100 ||
            now - lastProgressUpdate >= this.progressThrottleMs
          ) {
            lastProgressUpdate = now
            onProgress?.(progress)
          }
        }
      }

      // Success/error handler
      xhr.onload = () => {
        const durationMs = Date.now() - startTime
        this.activeXhrs.delete(fileId)

        if (xhr.status >= 200 && xhr.status < 300) {
          this.log(`Upload complete: ${fileId}`, { durationMs, bytesUploaded })
          resolve({
            fileId,
            success: true,
            durationMs,
            bytesUploaded: file.size,
          })
        } else {
          const errorType = classifyXHRError(xhr)
          const error = `Upload failed: ${xhr.status} ${xhr.statusText}`
          this.log(`Upload failed: ${fileId}`, { status: xhr.status, errorType })
          resolve({
            fileId,
            success: false,
            error,
            errorType,
            durationMs,
            bytesUploaded,
          })
        }
      }

      // Network error handler
      xhr.onerror = () => {
        const durationMs = Date.now() - startTime
        this.activeXhrs.delete(fileId)
        this.log(`Network error: ${fileId}`, { readyState: xhr.readyState })
        resolve({
          fileId,
          success: false,
          error: 'Network error - browser connection failed',
          errorType: 'network',
          durationMs,
          bytesUploaded,
        })
      }

      // Timeout handler
      xhr.ontimeout = () => {
        const durationMs = Date.now() - startTime
        this.activeXhrs.delete(fileId)
        this.log(`Timeout: ${fileId}`, { timeout, durationMs })
        resolve({
          fileId,
          success: false,
          error: `Upload timeout after ${timeout}ms`,
          errorType: 'timeout',
          durationMs,
          bytesUploaded,
        })
      }

      // Abort handler
      xhr.onabort = () => {
        const durationMs = Date.now() - startTime
        this.activeXhrs.delete(fileId)
        this.log(`Upload aborted: ${fileId}`)
        resolve({
          fileId,
          success: false,
          error: 'Upload aborted',
          errorType: 'aborted',
          durationMs,
          bytesUploaded,
        })
      }

      // Configure and send request
      xhr.timeout = timeout
      xhr.open('PUT', signedUrl)
      const contentType = file.type !== '' ? file.type : 'application/octet-stream'
      xhr.setRequestHeader('Content-Type', contentType)
      xhr.send(file)
    })
  }

  /**
   * Upload a batch of files with parallel execution
   *
   * Respects concurrency limit from config. Failed uploads are
   * collected in the result for retry handling.
   *
   * @returns Batch result with successful and failed uploads
   */
  async uploadBatch(files: FileUploadParams[]): Promise<BatchUploadResult> {
    const batchStartTime = Date.now()
    this.aborted = false

    this.log(`Starting batch upload: ${files.length} files`, { concurrency: this.concurrency })

    // Execute uploads with concurrency limit
    const results = await Promise.all(
      files.map((file) =>
        this.limiter(() => {
          const uploadParams: {
            fileId: string
            file: File
            signedUrl: string
            onProgress?: (percent: number) => void
          } = {
            fileId: file.fileId,
            file: file.file,
            signedUrl: file.signedUrl,
          }
          // Only add onProgress if defined (exactOptionalPropertyTypes compliance)
          if (file.onProgress !== undefined) {
            uploadParams.onProgress = file.onProgress
          }
          return this.uploadFile(uploadParams)
        })
      )
    )

    // Separate successful and failed uploads
    const successful: UploadResult[] = []
    const failed: UploadResult[] = []

    for (const result of results) {
      if (result.success) {
        successful.push(result)
      } else {
        failed.push(result)
      }
    }

    const totalDurationMs = Date.now() - batchStartTime

    this.log(`Batch complete`, {
      successful: successful.length,
      failed: failed.length,
      totalDurationMs,
    })

    return {
      successful,
      failed,
      totalDurationMs,
    }
  }

  /**
   * Refresh signed URL for retry
   *
   * Calls the /api/photos/{imageId}/refresh-url endpoint to get
   * a fresh signed URL when the original has expired.
   *
   * @param imageId - The database image ID
   * @returns Fresh signed upload URL
   * @throws Error if refresh fails
   */
  async refreshSignedUrl(imageId: string): Promise<string> {
    this.log(`Refreshing signed URL for: ${imageId}`)

    const response = await fetch(`/api/photos/${imageId}/refresh-url`, {
      method: 'POST',
    })

    if (!response.ok) {
      let errorMessage = `Failed to refresh URL: ${response.status}`
      try {
        const errorData = (await response.json()) as { error?: string }
        if (typeof errorData.error === 'string' && errorData.error !== '') {
          errorMessage = errorData.error
        }
      } catch {
        // Use default error message if JSON parsing fails
      }
      throw new Error(errorMessage)
    }

    const data = (await response.json()) as { uploadUrl: string }
    this.log(`URL refreshed successfully for: ${imageId}`)
    return data.uploadUrl
  }

  /**
   * Abort all pending uploads
   *
   * Cancels all in-flight XHR requests and prevents new uploads
   * from starting until the next batch upload call.
   */
  abort(): void {
    this.log(`Aborting ${this.activeXhrs.size} active uploads`)
    this.aborted = true

    for (const [fileId, xhr] of this.activeXhrs) {
      this.log(`Aborting upload: ${fileId}`)
      xhr.abort()
    }

    this.activeXhrs.clear()
    this.limiter.clearQueue()
  }

  /**
   * Get the number of currently active uploads
   */
  get activeCount(): number {
    return this.activeXhrs.size
  }

  /**
   * Get the number of pending uploads in the queue
   */
  get pendingCount(): number {
    return this.limiter.pendingCount
  }

  /**
   * Check if uploads have been aborted
   */
  get isAborted(): boolean {
    return this.aborted
  }
}

/**
 * Create a default upload manager instance
 */
export function createUploadManager(options?: UploadManagerOptions): UploadManager {
  return new UploadManager(options)
}
