/**
 * Bulk Upload Module
 *
 * Exports for 10K photo bulk upload feature.
 */

// Config - base configuration and calculateRetryDelay
export * from './config'

// Types - all type definitions
export * from './types'

// Chunker - file chunking utilities
export * from './chunker'

// Dedup - duplicate detection
export * from './dedup'

// Retry - retry utilities (re-exports calculateRetryDelay for backward compat)
export {
  isTransientError,
  createUploadError,
  categorizeError,
  withRetry,
  createRetryFetch,
  retryUploadWithFreshUrl,
  calculateRetryDelayWithOptions,
  type RetryFetchOptions,
} from './retry'

// ExifWorkerPool - Web Worker pool for EXIF extraction
export * from './ExifWorkerPool'

// Logger - Structured logging for debug and support
export * from './logger'

// Metrics - Performance metrics collection
export * from './metrics'
