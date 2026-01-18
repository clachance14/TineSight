/**
 * Structured Logger for Bulk Upload Debugging
 *
 * Provides structured logging for bulk upload operations with:
 * - Timestamped entries for all log events
 * - Phase tracking with nested events
 * - Metrics collection (throughput, memory, timing)
 * - JSON export for support tickets
 * - Console output in development mode
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Upload phases for structured tracking
 */
export type UploadPhase =
  | 'init'      // Session initialization
  | 'hash'      // Hashing for deduplication
  | 'upload'    // File uploads in progress
  | 'process'   // Backend processing
  | 'complete'  // Successfully completed
  | 'error'     // Error state

/**
 * Log entry types for categorization
 */
export type LogEntryType = 'PHASE' | 'EVENT' | 'METRIC' | 'ERROR'

/**
 * A single log entry
 */
export interface LogEntry {
  timestamp: string
  type: LogEntryType
  phase?: UploadPhase | undefined
  message: string
  data?: Record<string, unknown> | undefined
}

/**
 * Logger options
 */
export interface UploadLoggerOptions {
  /** Enable console output (default: true in development) */
  consoleOutput?: boolean
  /** Maximum entries to keep in memory (default: 10000) */
  maxEntries?: number
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format a number with unit suffix for readability
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
}

/**
 * Format duration in milliseconds to readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

/**
 * Get current timestamp in ISO format
 */
function getTimestamp(): string {
  return new Date().toISOString()
}

// =============================================================================
// UploadLogger Class
// =============================================================================

/**
 * Structured logger for bulk upload debugging.
 *
 * @example
 * ```typescript
 * const logger = new UploadLogger('session-123')
 *
 * logger.phase('init', { totalFiles: 500 })
 * logger.event('files_validated', { count: 495, skipped: 5 })
 *
 * logger.phase('upload')
 * logger.metric('throughput', 2.5, 'MB/s')
 *
 * // On error
 * logger.error('Network timeout', new Error('timeout'), { fileId: 'abc123' })
 *
 * // Export for support
 * const logs = logger.export()
 * ```
 */
export class UploadLogger {
  private readonly sessionId: string
  private readonly consoleOutput: boolean
  private readonly maxEntries: number
  private entries: LogEntry[] = []
  private currentPhase: UploadPhase | null = null
  private phaseStartTime: number | null = null

  constructor(sessionId: string, options?: UploadLoggerOptions) {
    this.sessionId = sessionId
    this.consoleOutput = options?.consoleOutput ?? process.env.NODE_ENV === 'development'
    this.maxEntries = options?.maxEntries ?? 10000
  }

  /**
   * Get the session ID for this logger
   */
  getSessionId(): string {
    return this.sessionId
  }

  /**
   * Get the current phase
   */
  getCurrentPhase(): UploadPhase | null {
    return this.currentPhase
  }

  /**
   * Log a phase transition.
   * Automatically tracks timing between phases.
   */
  phase(phase: UploadPhase, data?: Record<string, unknown>): void {
    const timestamp = getTimestamp()
    const now = Date.now()

    // Log phase duration if transitioning
    if (this.currentPhase && this.phaseStartTime) {
      const duration = now - this.phaseStartTime
      this.addEntry({
        timestamp,
        type: 'EVENT',
        phase: this.currentPhase,
        message: `Phase ${this.currentPhase} completed`,
        data: { duration: formatDuration(duration), durationMs: duration },
      })
    }

    this.currentPhase = phase
    this.phaseStartTime = now

    const entry: LogEntry = {
      timestamp,
      type: 'PHASE',
      phase,
      message: `Phase: ${phase}`,
      data: { sessionId: this.sessionId, startTime: now, ...data },
    }

    this.addEntry(entry)
    this.logToConsole(entry)
  }

  /**
   * Log a specific event within the current phase.
   */
  event(event: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: getTimestamp(),
      type: 'EVENT',
      phase: this.currentPhase ?? undefined,
      message: event,
      data,
    }

    this.addEntry(entry)
    this.logToConsole(entry)
  }

  /**
   * Log an error with optional Error object and context data.
   */
  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: getTimestamp(),
      type: 'ERROR',
      phase: this.currentPhase ?? 'error',
      message,
      data: {
        ...data,
        error: error?.message,
        stack: error?.stack?.split('\n').slice(0, 5).join('\n'),
      },
    }

    this.addEntry(entry)
    this.logToConsole(entry, true)
  }

  /**
   * Log a metric value with optional unit.
   */
  metric(name: string, value: number, unit?: string): void {
    const formattedValue = unit ? `${value} ${unit}` : value.toString()

    const entry: LogEntry = {
      timestamp: getTimestamp(),
      type: 'METRIC',
      phase: this.currentPhase ?? undefined,
      message: `${name}: ${formattedValue}`,
      data: { name, value, unit },
    }

    this.addEntry(entry)
    this.logToConsole(entry)
  }

  /**
   * Log file upload start
   */
  fileStart(fileId: string, filename: string, size: number): void {
    this.event('file_start', {
      fileId,
      filename,
      size,
      sizeFormatted: formatBytes(size),
    })
  }

  /**
   * Log file upload completion
   */
  fileComplete(fileId: string, durationMs: number, bytes: number): void {
    const throughput = bytes / (durationMs / 1000) // bytes per second
    this.event('file_complete', {
      fileId,
      duration: formatDuration(durationMs),
      durationMs,
      bytes,
      throughput: formatBytes(throughput) + '/s',
    })
  }

  /**
   * Log file upload failure
   */
  fileFailed(fileId: string, error: string, retryCount?: number): void {
    this.event('file_failed', {
      fileId,
      error,
      retryCount,
    })
  }

  /**
   * Log chunk/batch start
   */
  chunkStart(chunkIndex: number, fileCount: number): void {
    this.event('chunk_start', {
      chunk: chunkIndex,
      files: fileCount,
      startTime: Date.now(),
    })
  }

  /**
   * Log chunk/batch completion
   */
  chunkComplete(
    chunkIndex: number,
    successful: number,
    failed: number,
    durationMs: number
  ): void {
    this.event('chunk_complete', {
      chunk: chunkIndex,
      successful,
      failed,
      duration: formatDuration(durationMs),
      durationMs,
    })
  }

  /**
   * Get all log entries
   */
  getEntries(): LogEntry[] {
    return [...this.entries]
  }

  /**
   * Get entry count
   */
  getEntryCount(): number {
    return this.entries.length
  }

  /**
   * Export all logs as a formatted string for support tickets.
   * Format is human-readable with JSON data for parsing.
   */
  export(): string {
    const header = [
      '='.repeat(80),
      `TineSight Upload Log - Session: ${this.sessionId}`,
      `Exported: ${getTimestamp()}`,
      `Total Entries: ${this.entries.length}`,
      '='.repeat(80),
      '',
    ].join('\n')

    const body = this.entries
      .map((entry) => {
        const dataStr = entry.data
          ? ` ${JSON.stringify(entry.data)}`
          : ''
        return `[${entry.timestamp}] [${entry.type}${entry.phase ? `:${entry.phase}` : ''}] ${entry.message}${dataStr}`
      })
      .join('\n')

    return header + body
  }

  /**
   * Export as JSON for programmatic processing
   */
  exportJSON(): string {
    return JSON.stringify(
      {
        sessionId: this.sessionId,
        exportedAt: getTimestamp(),
        entryCount: this.entries.length,
        entries: this.entries,
      },
      null,
      2
    )
  }

  /**
   * Clear all log entries
   */
  clear(): void {
    this.entries = []
    this.currentPhase = null
    this.phaseStartTime = null
  }

  /**
   * Add entry with max entries enforcement
   */
  private addEntry(entry: LogEntry): void {
    this.entries.push(entry)

    // Trim oldest entries if over limit
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries)
    }
  }

  /**
   * Log to console if enabled
   */
  private logToConsole(entry: LogEntry, isError = false): void {
    if (!this.consoleOutput) return

    const prefix = `[Upload:${this.sessionId.slice(0, 8)}]`
    const typeTag = `[${entry.type}${entry.phase ? `:${entry.phase}` : ''}]`
    const message = `${prefix} ${typeTag} ${entry.message}`

    if (isError) {
      console.error(message, entry.data ?? '')
    } else if (entry.type === 'METRIC') {
      console.log(`%c${message}`, 'color: #C4895A', entry.data ?? '')
    } else if (entry.type === 'PHASE') {
      console.log(`%c${message}`, 'color: #4ade80; font-weight: bold', entry.data ?? '')
    } else {
      console.log(message, entry.data ?? '')
    }
  }
}

// =============================================================================
// Factory and Singleton Management
// =============================================================================

/**
 * Active logger instances by session ID
 */
const loggerInstances = new Map<string, UploadLogger>()

/**
 * Create a new upload logger for a session
 */
export function createUploadLogger(
  sessionId: string,
  options?: UploadLoggerOptions
): UploadLogger {
  const logger = new UploadLogger(sessionId, options)
  loggerInstances.set(sessionId, logger)
  return logger
}

/**
 * Get an existing logger by session ID
 */
export function getUploadLogger(sessionId: string): UploadLogger | undefined {
  return loggerInstances.get(sessionId)
}

/**
 * Remove a logger instance (for cleanup)
 */
export function removeUploadLogger(sessionId: string): void {
  loggerInstances.delete(sessionId)
}

/**
 * Get all active logger session IDs
 */
export function getActiveLoggerSessions(): string[] {
  return Array.from(loggerInstances.keys())
}
