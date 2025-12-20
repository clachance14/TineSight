/**
 * Throttle Constants
 *
 * Hard limits and default configuration for the adaptive throttling system.
 */

import type { ThrottleConfig } from './types'

// =============================================================================
// HARD LIMITS (cannot be overridden)
// =============================================================================

/** Browser enforced limit: max connections per domain */
export const BROWSER_MAX_CONNECTIONS_PER_DOMAIN = 6

/** Absolute minimum concurrency - never go below 1 */
export const ABSOLUTE_MIN_CONCURRENCY = 1

/** Absolute maximum concurrency - safety cap */
export const ABSOLUTE_MAX_CONCURRENCY = 20

/** Absolute minimum chunk/batch size */
export const ABSOLUTE_MIN_CHUNK_SIZE = 1

/** Absolute maximum chunk/batch size */
export const ABSOLUTE_MAX_CHUNK_SIZE = 500

/** Persistence schema version for migrations */
export const PERSISTENCE_VERSION = 1

/** Max age for persisted state (7 days in ms) */
export const PERSISTENCE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

// =============================================================================
// GOOGLE-STYLE THROTTLING CONSTANTS
// =============================================================================

/**
 * K multiplier for adaptive throttling
 * When requests >= K × accepts, start self-throttling
 * Google recommends K=2 for balanced propagation
 */
export const GOOGLE_K_MULTIPLIER = 2

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

export const DEFAULT_CONFIG: ThrottleConfig = {
  // Concurrency bounds
  minConcurrency: 1,
  maxConcurrency: BROWSER_MAX_CONNECTIONS_PER_DOMAIN,
  initialConcurrency: 2,

  // AIMD parameters
  additiveIncrease: 1,
  multiplicativeDecrease: 0.5,

  // Safety margin: operate at 85% of discovered limit (15% backoff)
  safetyMargin: 0.85,

  // Metrics collection
  metricsWindowMs: 120_000, // 2 minutes
  targetSuccessRate: 0.95,
  maxP95LatencyMs: 30_000, // 30 seconds

  // Circuit breaker
  failureThreshold: 5,
  recoveryTimeMs: 30_000, // 30 seconds
  halfOpenRequests: 1,

  // Persistence
  persistenceKey: 'tinesight-throttle-state',
  persistState: true,

  // Chunk size bounds
  minChunkSize: 5,
  maxChunkSize: 50,
}

// =============================================================================
// PRESETS FOR DIFFERENT CONTEXTS
// =============================================================================

/** Preset for file upload operations */
export const UPLOAD_PRESET: Partial<ThrottleConfig> = {
  maxConcurrency: BROWSER_MAX_CONNECTIONS_PER_DOMAIN,
  initialConcurrency: 2,
  minChunkSize: 10,
  maxChunkSize: 50,
  persistenceKey: 'tinesight-throttle-upload',
}

/** Preset for EXIF/metadata processing (CPU-bound) */
export const EXIF_PRESET: Partial<ThrottleConfig> = {
  maxConcurrency: 16, // Allow adaptive probing - throttler will find real limit
  initialConcurrency: 2,
  minChunkSize: 5,
  maxChunkSize: 500, // Allow larger batches - throttler will back off if too slow
  persistenceKey: 'tinesight-throttle-exif',
}

/** Preset for API calls */
export const API_PRESET: Partial<ThrottleConfig> = {
  maxConcurrency: 10,
  initialConcurrency: 3,
  failureThreshold: 3, // More sensitive to failures
  recoveryTimeMs: 60_000, // Longer recovery for APIs
  persistenceKey: 'tinesight-throttle-api',
}
