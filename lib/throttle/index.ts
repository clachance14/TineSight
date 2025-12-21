/**
 * Adaptive Throttle - Public API
 *
 * Exports all public interfaces for the adaptive throttling system.
 * Use this as the single entry point for importing throttle functionality.
 *
 * @example
 * import { AdaptiveThrottler, UPLOAD_PRESET } from '@/lib/throttle'
 *
 * const throttler = new AdaptiveThrottler(UPLOAD_PRESET)
 * const concurrency = throttler.getConcurrency()
 */

// Core throttler
export { AdaptiveThrottler, classifyXHRError, classifyError } from './adaptive-throttler'

// Supporting components
export { MetricsCollector } from './metrics-collector'
export { CircuitBreaker } from './circuit-breaker'

// Persistence utilities
export {
  saveState,
  loadState,
  clearState,
  updateState,
  recordSuccessfulConfig,
  recordDiscoveredLimit,
  getAllThrottleKeys,
  clearAllThrottleState,
} from './persistence'

// Constants and presets
export {
  DEFAULT_CONFIG,
  UPLOAD_PRESET,
  EXIF_PRESET,
  API_PRESET,
  BROWSER_MAX_CONNECTIONS_PER_DOMAIN,
  ABSOLUTE_MIN_CONCURRENCY,
  ABSOLUTE_MAX_CONCURRENCY,
  ABSOLUTE_MIN_CHUNK_SIZE,
  ABSOLUTE_MAX_CHUNK_SIZE,
  PERSISTENCE_VERSION,
  PERSISTENCE_MAX_AGE_MS,
  GOOGLE_K_MULTIPLIER,
} from './constants'

// Types
export type {
  ThrottleConfig,
  ThrottlerState,
  ThrottleMetrics,
  MetricsSnapshot,
  PersistedState,
  ProceedResult,
  ErrorType,
  CircuitState,
  MetricEntry,
} from './types'

// Re-export circuit breaker config type
export type { CircuitBreakerConfig } from './circuit-breaker'
