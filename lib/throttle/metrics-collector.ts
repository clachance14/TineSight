/**
 * Metrics Collector
 *
 * Rolling window metrics collection for adaptive throttling decisions.
 * Tracks success rate, latency percentiles, and error types.
 */

import type { ErrorType, MetricEntry, MetricsSnapshot } from './types'

/**
 * Collects and analyzes metrics within a rolling time window
 */
export class MetricsCollector {
  private entries: MetricEntry[] = []
  private windowMs: number

  constructor(windowMs: number = 120_000) {
    this.windowMs = windowMs
  }

  /**
   * Record a successful request
   */
  recordSuccess(durationMs: number): void {
    this.addEntry({
      timestamp: Date.now(),
      success: true,
      durationMs,
    })
  }

  /**
   * Record a failed request
   */
  recordFailure(durationMs: number, errorType: ErrorType): void {
    this.addEntry({
      timestamp: Date.now(),
      success: false,
      durationMs,
      errorType,
    })
  }

  /**
   * Get current metrics snapshot
   */
  getSnapshot(): MetricsSnapshot {
    this.pruneOldEntries()

    const total = this.entries.length
    const successes = this.entries.filter((e) => e.success).length
    const failures = total - successes

    // Calculate success rate
    const successRate = total > 0 ? successes / total : 1

    // Extract latencies for percentile calculations
    const latencies = this.entries.map((e) => e.durationMs).sort((a, b) => a - b)

    // Calculate percentiles
    const p50 = this.percentile(latencies, 50)
    const p95 = this.percentile(latencies, 95)
    const p99 = this.percentile(latencies, 99)

    // Count error types
    const rateLimitErrors = this.entries.filter(
      (e) => !e.success && e.errorType === 'rate_limit'
    ).length
    const networkErrors = this.entries.filter(
      (e) => !e.success && e.errorType === 'network'
    ).length
    const serverErrors = this.entries.filter(
      (e) => !e.success && e.errorType === 'server'
    ).length

    return {
      totalAttempts: total,
      successfulAttempts: successes,
      failedAttempts: failures,
      successRate,
      latencies,
      p50Latency: p50,
      p95Latency: p95,
      p99Latency: p99,
      rateLimitErrors,
      networkErrors,
      serverErrors,
    }
  }

  /**
   * Check if we're seeing rate limit errors
   */
  hasRateLimitErrors(): boolean {
    this.pruneOldEntries()
    return this.entries.some((e) => e.errorType === 'rate_limit')
  }

  /**
   * Get the count of recent failures
   */
  getRecentFailureCount(windowMs: number = 10_000): number {
    const cutoff = Date.now() - windowMs
    return this.entries.filter((e) => !e.success && e.timestamp >= cutoff).length
  }

  /**
   * Get success rate over a specific window
   */
  getSuccessRate(windowMs?: number): number {
    const cutoff = Date.now() - (windowMs ?? this.windowMs)
    const relevant = this.entries.filter((e) => e.timestamp >= cutoff)

    if (relevant.length === 0) return 1

    const successes = relevant.filter((e) => e.success).length
    return successes / relevant.length
  }

  /**
   * Get average latency
   */
  getAverageLatency(): number {
    this.pruneOldEntries()

    if (this.entries.length === 0) return 0

    const sum = this.entries.reduce((acc, e) => acc + e.durationMs, 0)
    return sum / this.entries.length
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.entries = []
  }

  /**
   * Get entry count (for debugging)
   */
  getEntryCount(): number {
    this.pruneOldEntries()
    return this.entries.length
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  private addEntry(entry: MetricEntry): void {
    this.entries.push(entry)
    // Prune occasionally to prevent unbounded growth
    if (this.entries.length > 1000) {
      this.pruneOldEntries()
    }
  }

  private pruneOldEntries(): void {
    const cutoff = Date.now() - this.windowMs
    this.entries = this.entries.filter((e) => e.timestamp >= cutoff)
  }

  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0
    if (sortedValues.length === 1) return sortedValues[0] ?? 0

    const index = Math.ceil((p / 100) * sortedValues.length) - 1
    return sortedValues[Math.max(0, index)] ?? 0
  }
}
