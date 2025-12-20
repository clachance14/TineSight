/**
 * Adaptive Throttler
 *
 * AIMD-based adaptive throttling for photo uploads.
 * Uses the same proven algorithm as TCP congestion control.
 *
 * Key behaviors:
 * - Slow start: Exponential increase until first failure
 * - AIMD: Additive increase on success, multiplicative decrease on failure
 * - Safety margin: Operate at 85% of discovered limit
 * - Circuit breaker: Block requests on cascading failures
 * - Persistence: Remember discovered limits across sessions
 */

import type {
  ThrottleConfig,
  ThrottlerState,
  ErrorType,
  ThrottleMetrics,
  ProceedResult,
} from './types'
import {
  DEFAULT_CONFIG,
  ABSOLUTE_MIN_CONCURRENCY,
  ABSOLUTE_MAX_CONCURRENCY,
  ABSOLUTE_MIN_CHUNK_SIZE,
  ABSOLUTE_MAX_CHUNK_SIZE,
  GOOGLE_K_MULTIPLIER,
} from './constants'
import { MetricsCollector } from './metrics-collector'
import { CircuitBreaker } from './circuit-breaker'
import { loadState, saveState } from './persistence'

export class AdaptiveThrottler {
  private config: ThrottleConfig
  private state: ThrottlerState
  private metrics: MetricsCollector
  private circuitBreaker: CircuitBreaker

  constructor(config: Partial<ThrottleConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }

    // Enforce hard limits
    this.config.minConcurrency = Math.max(
      ABSOLUTE_MIN_CONCURRENCY,
      this.config.minConcurrency
    )
    this.config.maxConcurrency = Math.min(
      ABSOLUTE_MAX_CONCURRENCY,
      this.config.maxConcurrency
    )
    this.config.minChunkSize = Math.max(
      ABSOLUTE_MIN_CHUNK_SIZE,
      this.config.minChunkSize
    )
    this.config.maxChunkSize = Math.min(
      ABSOLUTE_MAX_CHUNK_SIZE,
      this.config.maxChunkSize
    )

    // Initialize components
    this.metrics = new MetricsCollector(this.config.metricsWindowMs)
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: this.config.failureThreshold,
      recoveryTimeMs: this.config.recoveryTimeMs,
      halfOpenRequests: this.config.halfOpenRequests,
    })

    // Initialize state - start with higher chunk size to find limits faster
    const initialChunk = Math.min(
      this.config.maxChunkSize,
      Math.max(this.config.minChunkSize, 50) // Start at 50 for faster probing
    )
    this.state = {
      currentConcurrency: this.config.initialConcurrency,
      currentChunkSize: initialChunk,
      inSlowStart: true,
      discoveredLimit: null,
      circuitState: 'CLOSED',
      consecutiveFailures: 0,
      lastFailureTime: null,
      totalRequests: 0,
      totalAccepts: 0,
      sessionStartTime: null,
      sessionEndTime: null,
      itemsProcessed: 0,
    }

    // Load persisted state if available
    if (this.config.persistState) {
      this.loadPersistedState()
    }
  }

  // ===========================================================================
  // Public API - Recording outcomes
  // ===========================================================================

  /**
   * Start the session timer (call when processing begins)
   */
  startSession(): void {
    this.state.sessionStartTime = Date.now()
    this.state.sessionEndTime = null
    this.state.itemsProcessed = 0
  }

  /**
   * Stop the session timer (call when processing completes)
   */
  stopSession(): void {
    if (this.state.sessionStartTime !== null) {
      this.state.sessionEndTime = Date.now()
    }
  }

  /**
   * Record a successful operation
   * @param durationMs - Duration of the operation
   * @param itemCount - Number of items processed in this batch (default: 1)
   */
  recordSuccess(durationMs: number, itemCount: number = 1): void {
    this.metrics.recordSuccess(durationMs)
    this.circuitBreaker.recordSuccess()

    this.state.totalRequests++
    this.state.totalAccepts++
    this.state.consecutiveFailures = 0
    this.state.itemsProcessed += itemCount

    // Increase concurrency
    if (this.state.inSlowStart) {
      // Slow start: exponential increase (double)
      this.state.currentConcurrency = Math.min(
        this.state.currentConcurrency * 2,
        this.getEffectiveMaxConcurrency()
      )
    } else {
      // AIMD: additive increase
      this.state.currentConcurrency = Math.min(
        this.state.currentConcurrency + this.config.additiveIncrease,
        this.getEffectiveMaxConcurrency()
      )
    }

    // Also increase chunk size proportionally
    this.adjustChunkSize(true)

    // Persist successful config
    if (this.config.persistState) {
      this.persistState()
    }
  }

  /**
   * Record a failed operation
   */
  recordFailure(errorType: ErrorType): void {
    const durationMs = 0 // Duration not meaningful for failures
    this.metrics.recordFailure(durationMs, errorType)
    this.circuitBreaker.recordFailure()

    this.state.totalRequests++
    this.state.consecutiveFailures++
    this.state.lastFailureTime = Date.now()

    // Exit slow start on first failure
    if (this.state.inSlowStart) {
      this.state.inSlowStart = false
    }

    // Discover limit: if we hit rate limit, record current concurrency as limit
    if (
      errorType === 'rate_limit' &&
      (this.state.discoveredLimit === null ||
        this.state.currentConcurrency < this.state.discoveredLimit)
    ) {
      this.state.discoveredLimit = this.state.currentConcurrency
    }

    // AIMD: multiplicative decrease
    this.state.currentConcurrency = Math.max(
      Math.floor(this.state.currentConcurrency * this.config.multiplicativeDecrease),
      this.config.minConcurrency
    )

    // Also decrease chunk size
    this.adjustChunkSize(false)

    // Update circuit state
    this.state.circuitState = this.circuitBreaker.getState()

    // Persist state
    if (this.config.persistState) {
      this.persistState()
    }
  }

  // ===========================================================================
  // Public API - Getting values
  // ===========================================================================

  /**
   * Get current concurrency level
   */
  getConcurrency(): number {
    return this.state.currentConcurrency
  }

  /**
   * Get current chunk/batch size
   */
  getChunkSize(): number {
    return this.state.currentChunkSize
  }

  /**
   * Check if a request should proceed
   */
  shouldProceed(): ProceedResult {
    // Check circuit breaker first
    if (!this.circuitBreaker.shouldAllow()) {
      return {
        allowed: false,
        reason: 'circuit_open',
        waitMs: this.circuitBreaker.getTimeUntilRecovery(),
      }
    }

    // Google-style adaptive throttling
    const K = GOOGLE_K_MULTIPLIER
    if (this.state.totalRequests >= K * this.state.totalAccepts) {
      // Calculate rejection probability
      const rejectionProb =
        (this.state.totalRequests - K * this.state.totalAccepts) /
        (this.state.totalRequests + 1)

      if (Math.random() < rejectionProb) {
        return {
          allowed: false,
          reason: 'probabilistic_reject',
          waitMs: 1000, // Suggest 1 second wait
        }
      }
    }

    return { allowed: true }
  }

  /**
   * Wait for circuit recovery (returns promise that resolves when safe to proceed)
   */
  async waitForRecovery(): Promise<void> {
    const waitMs = this.circuitBreaker.getTimeUntilRecovery()
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs))
    }
  }

  /**
   * Get metrics for debug panel
   */
  getMetrics(): ThrottleMetrics {
    const snapshot = this.metrics.getSnapshot()
    const isRunning = this.state.sessionStartTime !== null && this.state.sessionEndTime === null

    // Calculate elapsed time - use end time if stopped, current time if running
    let elapsedMs = 0
    if (this.state.sessionStartTime !== null) {
      const endTime = this.state.sessionEndTime ?? Date.now()
      elapsedMs = endTime - this.state.sessionStartTime
    }

    const elapsedSeconds = elapsedMs / 1000
    const itemsPerSecond = elapsedSeconds > 0
      ? this.state.itemsProcessed / elapsedSeconds
      : 0

    return {
      currentConcurrency: this.state.currentConcurrency,
      currentChunkSize: this.state.currentChunkSize,
      successRate: snapshot.successRate,
      p95Latency: snapshot.p95Latency,
      circuitState: this.circuitBreaker.getState(),
      inSlowStart: this.state.inSlowStart,
      discoveredLimit: this.state.discoveredLimit,
      consecutiveFailures: this.state.consecutiveFailures,
      totalRequests: this.state.totalRequests,
      totalAccepts: this.state.totalAccepts,
      rateLimitErrors: snapshot.rateLimitErrors,
      sessionStartTime: this.state.sessionStartTime,
      sessionEndTime: this.state.sessionEndTime,
      isRunning,
      elapsedMs,
      itemsProcessed: this.state.itemsProcessed,
      itemsPerSecond,
    }
  }

  /**
   * Reset throttler to initial state
   */
  reset(): void {
    const initialChunk = Math.min(
      this.config.maxChunkSize,
      Math.max(this.config.minChunkSize, 50) // Start at 50 for faster probing
    )
    this.state = {
      currentConcurrency: this.config.initialConcurrency,
      currentChunkSize: initialChunk,
      inSlowStart: true,
      discoveredLimit: null,
      circuitState: 'CLOSED',
      consecutiveFailures: 0,
      lastFailureTime: null,
      totalRequests: 0,
      totalAccepts: 0,
      sessionStartTime: null,
      sessionEndTime: null,
      itemsProcessed: 0,
    }
    this.metrics.reset()
    this.circuitBreaker.reset()
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /**
   * Get effective max concurrency (considering discovered limit and safety margin)
   */
  private getEffectiveMaxConcurrency(): number {
    if (this.state.discoveredLimit !== null) {
      // Apply safety margin to discovered limit
      const safeLimit = Math.floor(
        this.state.discoveredLimit * this.config.safetyMargin
      )
      return Math.min(safeLimit, this.config.maxConcurrency)
    }
    return this.config.maxConcurrency
  }

  /**
   * Adjust chunk size based on success/failure
   */
  private adjustChunkSize(success: boolean): void {
    if (success) {
      if (this.state.inSlowStart) {
        // Slow start: exponential increase (1.5x) to find limits fast
        this.state.currentChunkSize = Math.min(
          Math.ceil(this.state.currentChunkSize * 1.5),
          this.config.maxChunkSize
        )
      } else {
        // AIMD: linear increase (+5) after discovering limit
        this.state.currentChunkSize = Math.min(
          this.state.currentChunkSize + 5,
          this.config.maxChunkSize
        )
      }
    } else {
      // Decrease chunk size by half on failure
      this.state.currentChunkSize = Math.max(
        Math.floor(this.state.currentChunkSize * 0.5),
        this.config.minChunkSize
      )
    }
  }

  /**
   * Load state from localStorage
   */
  private loadPersistedState(): void {
    const persisted = loadState(this.config.persistenceKey)
    if (!persisted) return

    // Apply discovered limits
    if (persisted.discoveredMaxConcurrency !== null) {
      this.state.discoveredLimit = persisted.discoveredMaxConcurrency
      // Start at safe level below discovered limit
      const safeStart = Math.floor(
        persisted.discoveredMaxConcurrency * this.config.safetyMargin
      )
      this.state.currentConcurrency = Math.min(
        safeStart,
        this.config.maxConcurrency
      )
      this.state.inSlowStart = false // Skip slow start if we know the limit
    }

    if (persisted.discoveredSafeChunkSize !== null) {
      this.state.currentChunkSize = persisted.discoveredSafeChunkSize
    }

    // Use last successful config if available
    if (persisted.lastSuccessfulConfig) {
      this.state.currentConcurrency = Math.min(
        persisted.lastSuccessfulConfig.concurrency,
        this.getEffectiveMaxConcurrency()
      )
      this.state.currentChunkSize = persisted.lastSuccessfulConfig.chunkSize
    }
  }

  /**
   * Save state to localStorage
   */
  private persistState(): void {
    const metricsSnapshot = this.metrics.getSnapshot()

    saveState(this.config.persistenceKey, {
      discoveredMaxConcurrency: this.state.discoveredLimit,
      discoveredSafeChunkSize: this.state.currentChunkSize,
      avgSuccessRate: metricsSnapshot.successRate,
      avgP95Latency: metricsSnapshot.p95Latency,
      lastSuccessfulConfig:
        this.state.consecutiveFailures === 0
          ? {
              concurrency: this.state.currentConcurrency,
              chunkSize: this.state.currentChunkSize,
            }
          : null,
    })
  }
}

// ===========================================================================
// Utility functions
// ===========================================================================

/**
 * Classify an XHR error into error type
 */
export function classifyXHRError(xhr: XMLHttpRequest): ErrorType {
  if (xhr.status === 429) return 'rate_limit'
  if (xhr.status >= 500) return 'server'
  if (xhr.status === 0 || xhr.readyState !== 4) return 'network'
  return 'unknown'
}

/**
 * Classify a generic error into error type
 */
export function classifyError(error: unknown): ErrorType {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    if (message.includes('rate') || message.includes('429')) return 'rate_limit'
    if (message.includes('network') || message.includes('fetch')) return 'network'
    if (message.includes('500') || message.includes('server')) return 'server'
  }
  return 'unknown'
}
