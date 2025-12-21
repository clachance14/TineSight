/**
 * Persistence Layer
 *
 * Saves and loads throttler state to/from localStorage.
 * Discovered optimal settings persist across sessions.
 */

import type { PersistedState } from './types'
import { PERSISTENCE_VERSION, PERSISTENCE_MAX_AGE_MS } from './constants'

/**
 * Save throttler state to localStorage
 */
export function saveState(key: string, state: Partial<PersistedState>): void {
  if (typeof window === 'undefined') return

  try {
    const fullState: PersistedState = {
      version: PERSISTENCE_VERSION,
      lastUpdated: new Date().toISOString(),
      discoveredMaxConcurrency: state.discoveredMaxConcurrency ?? null,
      discoveredSafeChunkSize: state.discoveredSafeChunkSize ?? null,
      avgSuccessRate: state.avgSuccessRate ?? 1,
      avgP95Latency: state.avgP95Latency ?? 0,
      lastSuccessfulConfig: state.lastSuccessfulConfig ?? null,
    }

    localStorage.setItem(key, JSON.stringify(fullState))
  } catch (error) {
    // localStorage might be unavailable (private browsing, quota exceeded)
    console.warn('[Throttle] Failed to save state:', error)
  }
}

/**
 * Load throttler state from localStorage
 * Returns null if state doesn't exist or is expired
 */
export function loadState(key: string): PersistedState | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null

    const parsed = JSON.parse(raw) as PersistedState

    // Version check for future migrations
    if (parsed.version !== PERSISTENCE_VERSION) {
      console.info('[Throttle] State version mismatch, discarding')
      localStorage.removeItem(key)
      return null
    }

    // Expiry check
    const age = Date.now() - new Date(parsed.lastUpdated).getTime()
    if (age > PERSISTENCE_MAX_AGE_MS) {
      console.info('[Throttle] State expired, discarding')
      localStorage.removeItem(key)
      return null
    }

    return parsed
  } catch (error) {
    console.warn('[Throttle] Failed to load state:', error)
    return null
  }
}

/**
 * Clear persisted state
 */
export function clearState(key: string): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.removeItem(key)
  } catch {
    // Ignore errors
  }
}

/**
 * Update specific fields in persisted state
 */
export function updateState(
  key: string,
  updates: Partial<Omit<PersistedState, 'version' | 'lastUpdated'>>
): void {
  const current = loadState(key)

  saveState(key, {
    ...current,
    ...updates,
  })
}

/**
 * Record a successful configuration for future reference
 */
export function recordSuccessfulConfig(
  key: string,
  concurrency: number,
  chunkSize: number
): void {
  updateState(key, {
    lastSuccessfulConfig: { concurrency, chunkSize },
  })
}

/**
 * Record discovered limit (when system first hits rate limits)
 */
export function recordDiscoveredLimit(
  key: string,
  maxConcurrency: number,
  safeChunkSize: number
): void {
  updateState(key, {
    discoveredMaxConcurrency: maxConcurrency,
    discoveredSafeChunkSize: safeChunkSize,
  })
}

/**
 * Get all throttle-related keys from localStorage
 */
export function getAllThrottleKeys(): string[] {
  if (typeof window === 'undefined') return []

  const keys: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('tinesight-throttle-')) {
        keys.push(key)
      }
    }
  } catch {
    // Ignore errors
  }
  return keys
}

/**
 * Clear all throttle-related persisted state
 */
export function clearAllThrottleState(): void {
  const keys = getAllThrottleKeys()
  for (const key of keys) {
    clearState(key)
  }
}
