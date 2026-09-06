/**
 * useAdaptiveThrottle Hook
 *
 * React hook wrapper for AdaptiveThrottler.
 * Uses a singleton pattern to share throttler instances across all components
 * using the same context.
 *
 * @example
 * const throttle = useAdaptiveThrottle('upload')
 * const concurrency = throttle.getConcurrency()
 * throttle.recordSuccess(1500)
 */

'use client'

import { useMemo } from 'react'
import {
  AdaptiveThrottler,
  UPLOAD_PRESET,
  EXIF_PRESET,
  type ThrottleConfig,
  type ThrottleMetrics,
  type ProceedResult,
  type ErrorType,
} from '@/lib/throttle'

// =============================================================================
// Module-level singleton map - shared across ALL component instances
// =============================================================================
const throttlerInstances = new Map<string, AdaptiveThrottler>()

/**
 * Get or create a singleton throttler for the given context
 */
function getOrCreateThrottler(
  context: string,
  config: Partial<ThrottleConfig>
): AdaptiveThrottler {
  if (!throttlerInstances.has(context)) {
    throttlerInstances.set(context, new AdaptiveThrottler(config))
  }
  return throttlerInstances.get(context)!
}

/**
 * Hook return interface
 */
interface UseAdaptiveThrottleReturn {
  /** Get current concurrency level */
  getConcurrency: () => number

  /** Get current chunk/batch size */
  getChunkSize: () => number

  /** Check if a request should proceed */
  shouldProceed: () => ProceedResult

  /** Start the session timer */
  startSession: () => void

  /** Stop the session timer */
  stopSession: () => void

  /** Record a successful operation */
  recordSuccess: (durationMs: number, itemCount?: number) => void

  /** Record a failed operation */
  recordFailure: (errorType: ErrorType) => void

  /** Wait for circuit recovery (returns promise) */
  waitForRecovery: () => Promise<void>

  /** Get metrics for debug panel */
  getMetrics: () => ThrottleMetrics

  /** Reset throttler to initial state */
  reset: () => void
}

/**
 * React hook for adaptive throttling
 *
 * @param context - Context identifier ('upload', 'exif', 'api', etc.)
 * @param configOverrides - Optional configuration overrides
 * @returns Throttle control interface
 */
export function useAdaptiveThrottle(
  context: string,
  configOverrides: Partial<ThrottleConfig> = {}
): UseAdaptiveThrottleReturn {
  // Select preset based on context
  const preset = useMemo(() => {
    switch (context) {
      case 'upload':
        return UPLOAD_PRESET
      case 'exif':
        return EXIF_PRESET
      default:
        return {}
    }
  }, [context])

  // Merge preset with overrides
  const config = useMemo(
    () => ({ ...preset, ...configOverrides }),
    [preset, configOverrides]
  )

  // Get or create singleton throttler for this context
  // This ensures all components using the same context share the same throttler
  const throttler = useMemo(
    () => getOrCreateThrottler(context, config),
    [context, config]
  )

  // Return stable interface
  return useMemo(
    () => ({
      getConcurrency: () => throttler.getConcurrency(),
      getChunkSize: () => throttler.getChunkSize(),
      shouldProceed: () => throttler.shouldProceed(),
      startSession: () => throttler.startSession(),
      stopSession: () => throttler.stopSession(),
      recordSuccess: (durationMs: number, itemCount?: number) => throttler.recordSuccess(durationMs, itemCount),
      recordFailure: (errorType: ErrorType) => throttler.recordFailure(errorType),
      waitForRecovery: () => throttler.waitForRecovery(),
      getMetrics: () => throttler.getMetrics(),
      reset: () => throttler.reset(),
    }),
    [throttler]
  )
}

/**
 * Reset all throttler instances (useful for testing)
 */
export function resetAllThrottlers(): void {
  throttlerInstances.forEach((throttler) => throttler.reset())
}

/**
 * Clear all throttler instances (useful for testing)
 */
export function clearAllThrottlers(): void {
  throttlerInstances.clear()
}
