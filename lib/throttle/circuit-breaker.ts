/**
 * Circuit Breaker
 *
 * Prevents cascading failures by temporarily blocking requests
 * when too many failures occur.
 *
 * States:
 * - CLOSED: Normal operation, requests allowed
 * - OPEN: Blocking requests due to failures
 * - HALF_OPEN: Testing if system has recovered
 */

import type { CircuitState } from './types'

export interface CircuitBreakerConfig {
  /** Consecutive failures to trigger open state */
  failureThreshold: number
  /** Time to wait before testing recovery (ms) */
  recoveryTimeMs: number
  /** Number of test requests allowed in half-open state */
  halfOpenRequests: number
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED'
  private consecutiveFailures = 0
  private lastFailureTime: number | null = null
  private halfOpenAttempts = 0
  private config: CircuitBreakerConfig

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      recoveryTimeMs: config.recoveryTimeMs ?? 30_000,
      halfOpenRequests: config.halfOpenRequests ?? 1,
    }
  }

  /**
   * Record a successful request
   */
  recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      // Recovery confirmed, close circuit
      this.state = 'CLOSED'
      this.halfOpenAttempts = 0
    }
    this.consecutiveFailures = 0
  }

  /**
   * Record a failed request
   */
  recordFailure(): void {
    this.consecutiveFailures++
    this.lastFailureTime = Date.now()

    if (this.state === 'HALF_OPEN') {
      // Recovery test failed, reopen circuit
      this.state = 'OPEN'
      this.halfOpenAttempts = 0
      return
    }

    if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.state = 'OPEN'
    }
  }

  /**
   * Check if a request should be allowed
   */
  shouldAllow(): boolean {
    if (this.state === 'CLOSED') {
      return true
    }

    if (this.state === 'OPEN') {
      // Check if enough time has passed to try recovery
      const elapsed = Date.now() - (this.lastFailureTime ?? 0)
      if (elapsed >= this.config.recoveryTimeMs) {
        this.state = 'HALF_OPEN'
        this.halfOpenAttempts = 0
        return true
      }
      return false
    }

    // HALF_OPEN: allow limited test requests
    if (this.halfOpenAttempts < this.config.halfOpenRequests) {
      this.halfOpenAttempts++
      return true
    }
    return false
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    // Update state based on time if needed
    if (this.state === 'OPEN' && this.lastFailureTime) {
      const elapsed = Date.now() - this.lastFailureTime
      if (elapsed >= this.config.recoveryTimeMs) {
        this.state = 'HALF_OPEN'
        this.halfOpenAttempts = 0
      }
    }
    return this.state
  }

  /**
   * Get consecutive failure count
   */
  getConsecutiveFailures(): number {
    return this.consecutiveFailures
  }

  /**
   * Get time until recovery attempt (ms), or 0 if not in OPEN state
   */
  getTimeUntilRecovery(): number {
    if (this.state !== 'OPEN' || !this.lastFailureTime) {
      return 0
    }
    const elapsed = Date.now() - this.lastFailureTime
    return Math.max(0, this.config.recoveryTimeMs - elapsed)
  }

  /**
   * Force circuit to specific state (for testing/recovery)
   */
  forceState(state: CircuitState): void {
    this.state = state
    if (state === 'CLOSED') {
      this.consecutiveFailures = 0
      this.halfOpenAttempts = 0
    }
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset(): void {
    this.state = 'CLOSED'
    this.consecutiveFailures = 0
    this.lastFailureTime = null
    this.halfOpenAttempts = 0
  }

  /**
   * Check if circuit is open (blocking requests)
   */
  isOpen(): boolean {
    return this.getState() === 'OPEN'
  }

  /**
   * Check if circuit is closed (normal operation)
   */
  isClosed(): boolean {
    return this.getState() === 'CLOSED'
  }
}
