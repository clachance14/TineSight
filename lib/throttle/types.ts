/**
 * Adaptive Throttle Types
 *
 * TypeScript interfaces for the AIMD-based adaptive throttling system.
 * Based on patterns from TCP congestion control and Google SRE.
 */

/**
 * Error types for classifying failures
 */
export type ErrorType =
  | 'rate_limit'   // 429 responses
  | 'network'      // Connection failures, timeouts
  | 'server'       // 5xx responses
  | 'unknown'      // Unclassified errors

/**
 * Circuit breaker states
 */
export type CircuitState =
  | 'CLOSED'     // Normal operation
  | 'OPEN'       // Blocking requests
  | 'HALF_OPEN'  // Testing recovery

/**
 * Throttle configuration options
 */
export interface ThrottleConfig {
  /** Minimum allowed concurrency (default: 1) */
  minConcurrency: number

  /** Maximum allowed concurrency (default: 6 for browser limit) */
  maxConcurrency: number

  /** Starting concurrency (default: 2) */
  initialConcurrency: number

  /** How much to increase on success (default: 1) */
  additiveIncrease: number

  /** Multiplier for decrease on failure (default: 0.5) */
  multiplicativeDecrease: number

  /** Safety margin below discovered limit (default: 0.85 = 15% backoff) */
  safetyMargin: number

  /** Rolling window duration in ms (default: 120000 = 2 minutes) */
  metricsWindowMs: number

  /** Target success rate to maintain (default: 0.95 = 95%) */
  targetSuccessRate: number

  /** Max P95 latency threshold in ms (default: 30000) */
  maxP95LatencyMs: number

  /** Consecutive failures to open circuit (default: 5) */
  failureThreshold: number

  /** Time to wait before testing recovery in ms (default: 30000) */
  recoveryTimeMs: number

  /** Number of test requests in half-open state (default: 1) */
  halfOpenRequests: number

  /** LocalStorage key for persistence (default: 'tinesight-throttle-state') */
  persistenceKey: string

  /** Whether to persist state (default: true) */
  persistState: boolean

  /** Minimum chunk size for batching (default: 5) */
  minChunkSize: number

  /** Maximum chunk size for batching (default: 50) */
  maxChunkSize: number
}

/**
 * Metrics tracked within a rolling window
 */
export interface MetricsSnapshot {
  /** Total request attempts */
  totalAttempts: number

  /** Successful requests */
  successfulAttempts: number

  /** Failed requests */
  failedAttempts: number

  /** Success rate (0-1) */
  successRate: number

  /** Latency measurements in ms */
  latencies: number[]

  /** P50 latency */
  p50Latency: number

  /** P95 latency */
  p95Latency: number

  /** P99 latency */
  p99Latency: number

  /** Rate limit errors (429) */
  rateLimitErrors: number

  /** Network errors */
  networkErrors: number

  /** Server errors (5xx) */
  serverErrors: number
}

/**
 * Current throttler state
 */
export interface ThrottlerState {
  /** Current concurrency level */
  currentConcurrency: number

  /** Current chunk/batch size */
  currentChunkSize: number

  /** Whether in slow start phase */
  inSlowStart: boolean

  /** Discovered maximum stable concurrency (null if not yet discovered) */
  discoveredLimit: number | null

  /** Circuit breaker state */
  circuitState: CircuitState

  /** Consecutive failure count */
  consecutiveFailures: number

  /** Timestamp of last failure */
  lastFailureTime: number | null

  /** Total requests attempted (for Google-style throttling) */
  totalRequests: number

  /** Total requests accepted (for Google-style throttling) */
  totalAccepts: number

  /** Session start time for timing metrics */
  sessionStartTime: number | null

  /** Session end time (null if still running) */
  sessionEndTime: number | null

  /** Total items processed in current session */
  itemsProcessed: number
}

/**
 * State persisted to localStorage
 */
export interface PersistedState {
  /** Schema version for migrations */
  version: number

  /** ISO timestamp of last update */
  lastUpdated: string

  /** Discovered maximum stable concurrency */
  discoveredMaxConcurrency: number | null

  /** Discovered safe chunk size */
  discoveredSafeChunkSize: number | null

  /** Historical average success rate */
  avgSuccessRate: number

  /** Historical average P95 latency */
  avgP95Latency: number

  /** Last configuration that worked well */
  lastSuccessfulConfig: {
    concurrency: number
    chunkSize: number
  } | null
}

/**
 * Metrics exposed to UI (debug panel)
 */
export interface ThrottleMetrics {
  currentConcurrency: number
  currentChunkSize: number
  successRate: number
  p95Latency: number
  circuitState: CircuitState
  inSlowStart: boolean
  discoveredLimit: number | null
  consecutiveFailures: number
  totalRequests: number
  totalAccepts: number
  rateLimitErrors: number
  // Timing metrics
  sessionStartTime: number | null
  sessionEndTime: number | null
  isRunning: boolean
  elapsedMs: number
  itemsProcessed: number
  itemsPerSecond: number
}

/**
 * Individual metric entry with timestamp
 */
export interface MetricEntry {
  timestamp: number
  success: boolean
  durationMs: number
  errorType?: ErrorType
}

/**
 * Result of shouldProceed check
 */
export interface ProceedResult {
  /** Whether the request should proceed */
  allowed: boolean

  /** Reason if not allowed */
  reason?: 'circuit_open' | 'rate_limited' | 'probabilistic_reject'

  /** Suggested wait time in ms if not allowed */
  waitMs?: number
}
