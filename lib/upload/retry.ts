/**
 * Retry Utilities for Bulk Upload
 *
 * Provides exponential backoff retry logic with jitter for resilient uploads.
 * Handles transient errors (network, 5xx, 429, 408) while failing fast on
 * permanent errors (4xx except 408/429).
 */

import { UPLOAD_CONFIG, calculateRetryDelay } from './config'
import type { RetryOptions, UploadError, ErrorType } from './types'

// Re-export calculateRetryDelay from config for backward compatibility
export { calculateRetryDelay }

/**
 * Calculate exponential backoff delay with custom options
 *
 * This is an extended version that accepts custom options.
 * For the default implementation, use calculateRetryDelay from config.
 *
 * @param attempt - Current attempt number (1-based)
 * @param options - Optional override for delay configuration
 * @returns Delay in milliseconds before next retry
 */
export function calculateRetryDelayWithOptions(
  attempt: number,
  options?: Pick<RetryOptions, 'baseDelayMs' | 'maxDelayMs' | 'jitterPercent'>
): number {
  const baseDelay = options?.baseDelayMs ?? UPLOAD_CONFIG.RETRY_BASE_DELAY_MS
  const maxDelay = options?.maxDelayMs ?? UPLOAD_CONFIG.RETRY_MAX_DELAY_MS
  const jitterPercent = options?.jitterPercent ?? UPLOAD_CONFIG.RETRY_JITTER_PERCENT

  // Exponential backoff: baseDelay * 2^(attempt-1)
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1)

  // Add random jitter to prevent thundering herd
  const jitter = Math.random() * exponentialDelay * jitterPercent

  // Cap at maximum delay
  return Math.min(exponentialDelay + jitter, maxDelay)
}

/**
 * Check if an error is transient and should be retried
 *
 * Transient errors (retryable):
 * - 'network' - Network connectivity issues
 * - 'timeout' - Request timeout
 * - 408 - Request Timeout
 * - 429 - Too Many Requests
 * - 5xx - Server errors (500-599)
 *
 * Permanent errors (not retryable):
 * - 4xx (except 408, 429) - Client errors
 *
 * @param status - HTTP status code or error type ('network' | 'timeout')
 * @returns true if the error is transient and should be retried
 */
export function isTransientError(status: number | 'network' | 'timeout'): boolean {
  // Network and timeout errors are always transient
  if (status === 'network' || status === 'timeout') {
    return true
  }

  // 408 Request Timeout and 429 Too Many Requests are transient
  if (status === 408 || status === 429) {
    return true
  }

  // 5xx Server errors are transient
  if (status >= 500 && status < 600) {
    return true
  }

  // All other statuses (including 4xx client errors) are not transient
  return false
}

/**
 * Check if a status/type combination is transient (internal helper)
 */
function isTransientStatusOrType(status: number | undefined, type: ErrorType): boolean {
  // If we have a status code, check it
  if (status !== undefined) {
    return isTransientError(status)
  }
  // Network and timeout types are transient
  if (type === 'network' || type === 'timeout') {
    return isTransientError(type)
  }
  // HTTP type without status, or unknown type - not transient
  return false
}

/**
 * Create a structured upload error with metadata
 */
export function createUploadError(
  message: string,
  type: ErrorType,
  status: number | undefined,
  cause: Error | undefined
): UploadError {
  const error = new Error(message) as UploadError
  error.name = 'UploadError'
  error.type = type
  if (status !== undefined) {
    error.status = status
  }
  error.isTransient = isTransientStatusOrType(status, type)
  if (cause !== undefined) {
    error.cause = cause
  }
  return error
}

/**
 * Categorize an error into an error type
 */
export function categorizeError(error: unknown): { type: ErrorType; status?: number } {
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return { type: 'network' }
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return { type: 'timeout' }
  }

  if (error instanceof Response) {
    return { type: 'http', status: error.status }
  }

  // Check for response-like objects
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    typeof (error as { status: unknown }).status === 'number'
  ) {
    return { type: 'http', status: (error as { status: number }).status }
  }

  return { type: 'unknown' }
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Execute a function with retry logic and exponential backoff
 *
 * Retries on transient errors (network, timeout, 5xx, 429, 408).
 * Fails immediately on permanent errors (4xx except 408/429).
 *
 * @param fn - Async function to execute
 * @param options - Retry configuration
 * @returns Promise resolving to the function result
 * @throws UploadError if all retries are exhausted or permanent error occurs
 *
 * @example
 * const result = await withRetry(
 *   () => fetch('https://api.example.com/upload'),
 *   {
 *     maxRetries: 3,
 *     onRetry: (attempt, error, delay) => {
 *       console.log(`Retry ${attempt} after ${delay}ms: ${error.message}`)
 *     }
 *   }
 * )
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const maxRetries = options?.maxRetries ?? UPLOAD_CONFIG.MAX_RETRIES
  const onRetry = options?.onRetry

  let lastError: UploadError | undefined

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const { type, status } = categorizeError(error)

      lastError = createUploadError(
        error instanceof Error ? error.message : 'Unknown error',
        type,
        status,
        error instanceof Error ? error : undefined
      )

      // Use the isTransient flag from the created error
      const isTransient = lastError.isTransient

      // Don't retry permanent errors
      if (!isTransient) {
        throw lastError
      }

      // Don't retry if we've exhausted attempts
      if (attempt > maxRetries) {
        throw lastError
      }

      // Calculate delay and wait before retry
      const delay = calculateRetryDelayWithOptions(attempt, options)

      // Notify caller of retry
      if (onRetry) {
        onRetry(attempt, lastError, delay)
      }

      await sleep(delay)
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError ?? new Error('Retry exhausted without error')
}

/**
 * Options for the retry-enabled fetch wrapper
 */
export interface RetryFetchOptions extends RetryOptions {
  /** Timeout in milliseconds (default: 120000) */
  timeout?: number
}

/**
 * Create a retry-enabled fetch wrapper
 *
 * Wraps the native fetch with:
 * - Automatic retries on transient errors
 * - Exponential backoff with jitter
 * - Request timeout support
 * - Response status checking
 *
 * @param options - Retry and timeout configuration
 * @returns A fetch-compatible function with retry behavior
 *
 * @example
 * const retryFetch = createRetryFetch({ maxRetries: 3, timeout: 30000 })
 *
 * const response = await retryFetch('/api/upload', {
 *   method: 'POST',
 *   body: formData
 * })
 */
export function createRetryFetch(
  options?: RetryFetchOptions
): typeof fetch {
  const timeout = options?.timeout ?? UPLOAD_CONFIG.DEFAULT_UPLOAD_TIMEOUT_MS

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    return withRetry(
      async () => {
        // Create abort controller for timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        try {
          const response = await fetch(input, {
            ...init,
            signal: controller.signal,
          })

          // Throw on non-2xx responses to trigger retry logic
          if (!response.ok) {
            const error = new Error(`HTTP ${response.status}: ${response.statusText}`)
            ;(error as UploadError).status = response.status
            throw error
          }

          return response
        } finally {
          clearTimeout(timeoutId)
        }
      },
      options
    )
  }
}

/**
 * Retry a specific file upload with fresh signed URL
 *
 * Calls the refresh-url endpoint to get a new signed URL,
 * then retries the upload. Used for manual retry of failed uploads.
 *
 * @param imageId - The pre-created image record ID
 * @param file - The File to upload
 * @param options - Optional retry configuration
 * @returns Promise resolving when upload succeeds
 * @throws UploadError if retry fails after all attempts
 */
export async function retryUploadWithFreshUrl(
  imageId: string,
  file: File,
  options?: RetryOptions & { timeout?: number }
): Promise<void> {
  const retryFetch = createRetryFetch(options)

  // Get fresh signed URL
  const refreshResponse = await retryFetch(`/api/photos/${imageId}/refresh-url`, {
    method: 'POST',
  })

  const { signedUrl } = await refreshResponse.json() as { signedUrl: string }

  // Upload with fresh URL
  await retryFetch(signedUrl, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type,
    },
  })
}
