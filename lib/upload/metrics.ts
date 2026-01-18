/**
 * Upload Metrics Collector
 *
 * Collects performance metrics during bulk upload operations including:
 * - Per-file upload timing and throughput
 * - Aggregate throughput calculations
 * - Error tracking by type
 * - Memory usage monitoring (when available)
 * - Summary statistics for analysis
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Individual file upload record
 */
interface FileUploadRecord {
  fileId: string
  bytes: number
  durationMs: number
  startTime: number
  endTime: number
}

/**
 * Error record for tracking
 */
interface ErrorRecord {
  fileId: string
  type: string
  timestamp: number
  message?: string | undefined
}

/**
 * Summary statistics for upload session
 */
export interface UploadMetricsSummary {
  /** Total number of files tracked */
  totalFiles: number
  /** Number of files successfully uploaded */
  successfulFiles: number
  /** Number of files that failed */
  failedFiles: number
  /** Total bytes uploaded */
  totalBytes: number
  /** Total time spent uploading (ms) */
  totalDurationMs: number
  /** Average throughput across all uploads (bytes/second) */
  averageThroughputBps: number
  /** Peak throughput observed (bytes/second) */
  peakThroughputBps: number
  /** Peak memory usage in MB (null if unavailable) */
  peakMemoryMB: number | null
  /** Errors grouped by type */
  errorsByType: Record<string, number>
  /** Average file size in bytes */
  averageFileSizeBytes: number
  /** Average upload duration in ms */
  averageDurationMs: number
  /** Files per second processing rate */
  filesPerSecond: number
  /** Session start time */
  sessionStartTime: number | null
  /** Session end time */
  sessionEndTime: number | null
}

/**
 * Current throughput snapshot
 */
export interface ThroughputSnapshot {
  /** Current throughput in bytes/second */
  bytesPerSecond: number
  /** Formatted throughput string (e.g., "2.5 MB/s") */
  formatted: string
  /** Number of samples used for calculation */
  sampleCount: number
}

/**
 * Metrics options
 */
export interface UploadMetricsOptions {
  /** Time window for throughput calculation in ms (default: 5000) */
  throughputWindowMs?: number
  /** Enable memory tracking (default: true) */
  trackMemory?: boolean
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/**
 * Get current memory usage in MB (if available)
 */
function getMemoryUsageMB(): number | null {
  // Browser environment - check for performance.memory
  if (typeof window !== 'undefined' && 'performance' in window) {
    const perf = window.performance as Performance & {
      memory?: {
        usedJSHeapSize: number
        totalJSHeapSize: number
        jsHeapSizeLimit: number
      }
    }
    if (perf.memory) {
      return perf.memory.usedJSHeapSize / (1024 * 1024)
    }
  }
  return null
}

// =============================================================================
// UploadMetrics Class
// =============================================================================

/**
 * Collects performance metrics during bulk upload.
 *
 * @example
 * ```typescript
 * const metrics = new UploadMetrics()
 *
 * // Track uploads
 * metrics.recordUpload('file-1', 1024000, 1500)
 * metrics.recordUpload('file-2', 2048000, 2200)
 *
 * // Track errors
 * metrics.recordError('file-3', 'network')
 *
 * // Get current throughput
 * const throughput = metrics.getThroughput()
 * console.log(`Current: ${throughput.formatted}`)
 *
 * // Get summary
 * const summary = metrics.getSummary()
 * console.log(`Uploaded ${summary.totalFiles} files`)
 * ```
 */
export class UploadMetrics {
  private readonly throughputWindowMs: number
  private readonly trackMemory: boolean

  private uploadRecords: FileUploadRecord[] = []
  private processedFiles: Set<string> = new Set()
  private errors: ErrorRecord[] = []
  private peakMemoryMB: number = 0
  private peakThroughputBps: number = 0
  private sessionStartTime: number | null = null
  private sessionEndTime: number | null = null

  constructor(options?: UploadMetricsOptions) {
    this.throughputWindowMs = options?.throughputWindowMs ?? 5000
    this.trackMemory = options?.trackMemory ?? true
  }

  /**
   * Start tracking a session
   */
  startSession(): void {
    this.sessionStartTime = Date.now()
    this.sessionEndTime = null
    this.updateMemoryPeak()
  }

  /**
   * End the session tracking
   */
  endSession(): void {
    this.sessionEndTime = Date.now()
    this.updateMemoryPeak()
  }

  /**
   * Record a completed file upload
   */
  recordUpload(fileId: string, bytes: number, durationMs: number): void {
    const now = Date.now()

    const record: FileUploadRecord = {
      fileId,
      bytes,
      durationMs,
      startTime: now - durationMs,
      endTime: now,
    }

    this.uploadRecords.push(record)

    // Calculate instantaneous throughput and update peak
    const throughputBps = durationMs > 0 ? (bytes / durationMs) * 1000 : 0
    if (throughputBps > this.peakThroughputBps) {
      this.peakThroughputBps = throughputBps
    }

    // Update memory peak
    this.updateMemoryPeak()
  }

  /**
   * Record a file as processed (AI pipeline complete)
   */
  recordProcessed(fileId: string): void {
    this.processedFiles.add(fileId)
  }

  /**
   * Record an error
   */
  recordError(fileId: string, type: string, message?: string): void {
    this.errors.push({
      fileId,
      type,
      timestamp: Date.now(),
      message,
    })
  }

  /**
   * Get current throughput based on recent uploads
   */
  getThroughput(): number {
    const now = Date.now()
    const windowStart = now - this.throughputWindowMs

    // Get uploads within the window
    const recentUploads = this.uploadRecords.filter(
      (r) => r.endTime >= windowStart
    )

    if (recentUploads.length === 0) {
      return 0
    }

    // Calculate total bytes and time span
    const totalBytes = recentUploads.reduce((sum, r) => sum + r.bytes, 0)
    const earliestStart = Math.max(
      windowStart,
      Math.min(...recentUploads.map((r) => r.startTime))
    )
    const latestEnd = Math.max(...recentUploads.map((r) => r.endTime))
    const timeSpanMs = latestEnd - earliestStart

    if (timeSpanMs <= 0) {
      return 0
    }

    return (totalBytes / timeSpanMs) * 1000 // bytes per second
  }

  /**
   * Get throughput with formatted string
   */
  getThroughputSnapshot(): ThroughputSnapshot {
    const now = Date.now()
    const windowStart = now - this.throughputWindowMs

    const recentUploads = this.uploadRecords.filter(
      (r) => r.endTime >= windowStart
    )

    const bytesPerSecond = this.getThroughput()

    return {
      bytesPerSecond,
      formatted: formatBytes(bytesPerSecond) + '/s',
      sampleCount: recentUploads.length,
    }
  }

  /**
   * Get peak memory usage in MB (null if unavailable)
   */
  getPeakMemory(): number | null {
    if (!this.trackMemory || this.peakMemoryMB === 0) {
      return null
    }
    return Math.round(this.peakMemoryMB * 100) / 100
  }

  /**
   * Get current memory usage in MB (null if unavailable)
   */
  getCurrentMemory(): number | null {
    if (!this.trackMemory) {
      return null
    }
    const current = getMemoryUsageMB()
    return current !== null ? Math.round(current * 100) / 100 : null
  }

  /**
   * Get summary statistics
   */
  getSummary(): UploadMetricsSummary {
    const successfulFiles = this.uploadRecords.length
    const failedFiles = new Set(this.errors.map((e) => e.fileId)).size
    const totalFiles = successfulFiles + failedFiles

    const totalBytes = this.uploadRecords.reduce((sum, r) => sum + r.bytes, 0)
    const totalDurationMs = this.uploadRecords.reduce(
      (sum, r) => sum + r.durationMs,
      0
    )

    // Calculate average throughput
    const averageThroughputBps =
      totalDurationMs > 0 ? (totalBytes / totalDurationMs) * 1000 : 0

    // Group errors by type
    const errorsByType: Record<string, number> = {}
    for (const error of this.errors) {
      errorsByType[error.type] = (errorsByType[error.type] ?? 0) + 1
    }

    // Calculate session duration
    const sessionDurationMs =
      this.sessionStartTime && this.sessionEndTime
        ? this.sessionEndTime - this.sessionStartTime
        : this.sessionStartTime
          ? Date.now() - this.sessionStartTime
          : 0

    const filesPerSecond =
      sessionDurationMs > 0 ? (totalFiles / sessionDurationMs) * 1000 : 0

    return {
      totalFiles,
      successfulFiles,
      failedFiles,
      totalBytes,
      totalDurationMs,
      averageThroughputBps,
      peakThroughputBps: this.peakThroughputBps,
      peakMemoryMB: this.getPeakMemory(),
      errorsByType,
      averageFileSizeBytes: successfulFiles > 0 ? totalBytes / successfulFiles : 0,
      averageDurationMs: successfulFiles > 0 ? totalDurationMs / successfulFiles : 0,
      filesPerSecond,
      sessionStartTime: this.sessionStartTime,
      sessionEndTime: this.sessionEndTime,
    }
  }

  /**
   * Get upload count
   */
  getUploadCount(): number {
    return this.uploadRecords.length
  }

  /**
   * Get error count
   */
  getErrorCount(): number {
    return this.errors.length
  }

  /**
   * Get processed count
   */
  getProcessedCount(): number {
    return this.processedFiles.size
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.uploadRecords = []
    this.processedFiles.clear()
    this.errors = []
    this.peakMemoryMB = 0
    this.peakThroughputBps = 0
    this.sessionStartTime = null
    this.sessionEndTime = null
  }

  /**
   * Update peak memory if current is higher
   */
  private updateMemoryPeak(): void {
    if (!this.trackMemory) return

    const current = getMemoryUsageMB()
    if (current !== null && current > this.peakMemoryMB) {
      this.peakMemoryMB = current
    }
  }
}

// =============================================================================
// Factory and Singleton Management
// =============================================================================

/**
 * Active metrics instances by session ID
 */
const metricsInstances = new Map<string, UploadMetrics>()

/**
 * Create a new metrics collector for a session
 */
export function createUploadMetrics(
  sessionId: string,
  options?: UploadMetricsOptions
): UploadMetrics {
  const metrics = new UploadMetrics(options)
  metricsInstances.set(sessionId, metrics)
  return metrics
}

/**
 * Get an existing metrics collector by session ID
 */
export function getUploadMetrics(sessionId: string): UploadMetrics | undefined {
  return metricsInstances.get(sessionId)
}

/**
 * Remove a metrics instance (for cleanup)
 */
export function removeUploadMetrics(sessionId: string): void {
  metricsInstances.delete(sessionId)
}

/**
 * Get all active metrics session IDs
 */
export function getActiveMetricsSessions(): string[] {
  return Array.from(metricsInstances.keys())
}
