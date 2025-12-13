/**
 * SAM2 Worker Health Monitoring
 *
 * Utilities for monitoring SAM2 worker health status
 * Supports both WebSocket (preferred) and HTTP polling (fallback) methods
 */

import { HealthResponse } from './client'

// ============================================================================
// WebSocket Health Listener
// ============================================================================

export class Sam2HealthListener {
  private readonly workerUrl: string
  private ws: WebSocket | null = null

  constructor(workerUrl: string) {
    this.workerUrl = workerUrl

    // Remove trailing slash if present
    if (this.workerUrl.endsWith('/')) {
      this.workerUrl = this.workerUrl.slice(0, -1)
    }
  }

  /**
   * Wait for the SAM2 worker to become ready
   * First attempts WebSocket connection, falls back to HTTP polling if WebSocket fails
   *
   * @param timeoutMs - Maximum time to wait in milliseconds
   * @throws Error if worker doesn't become ready within timeout
   */
  async waitForReady(timeoutMs: number): Promise<void> {
    try {
      // Try WebSocket first
      await this.waitForReadyWebSocket(timeoutMs)
    } catch (wsError) {
      console.warn('WebSocket health monitoring failed, falling back to HTTP polling:', wsError)

      // Fall back to HTTP polling
      await this.waitForReadyPolling(timeoutMs)
    }
  }

  /**
   * Wait for ready status using WebSocket connection
   *
   * @param timeoutMs - Maximum time to wait in milliseconds
   * @throws Error if worker doesn't become ready within timeout or WebSocket fails
   */
  private async waitForReadyWebSocket(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // Convert http/https URL to ws/wss
      const wsUrl = this.workerUrl
        .replace(/^http:/, 'ws:')
        .replace(/^https:/, 'wss:')

      let ws: WebSocket
      let timeoutId: NodeJS.Timeout
      let resolved = false

      try {
        // Create WebSocket connection to /ws/status endpoint
        ws = new WebSocket(`${wsUrl}/ws/status`)
        this.ws = ws

        // Set up timeout
        timeoutId = setTimeout(() => {
          if (!resolved) {
            resolved = true
            ws.close()
            reject(new Error(`Timeout waiting for worker to become ready after ${timeoutMs}ms`))
          }
        }, timeoutMs)

        // Handle WebSocket open
        ws.addEventListener('open', () => {
          console.log('WebSocket connection established to SAM2 worker')
        })

        // Handle WebSocket messages
        ws.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data.toString()) as HealthResponse

            console.log(`SAM2 worker status: ${data.status}${data.progress_percent ? ` (${data.progress_percent}%)` : ''}`)

            // Check if worker is ready
            if (data.status === 'ready' && !resolved) {
              resolved = true
              clearTimeout(timeoutId)
              ws.close()
              resolve()
            }

            // Check for error status
            if (data.status === 'error' && !resolved) {
              resolved = true
              clearTimeout(timeoutId)
              ws.close()
              reject(new Error(`Worker error: ${data.error_message || 'Unknown error'}`))
            }
          } catch (parseError) {
            console.error('Failed to parse WebSocket message:', parseError)
          }
        })

        // Handle WebSocket errors
        ws.addEventListener('error', (error) => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeoutId)
            reject(new Error(`WebSocket error: ${error}`))
          }
        })

        // Handle WebSocket close
        ws.addEventListener('close', () => {
          if (!resolved) {
            resolved = true
            clearTimeout(timeoutId)
            reject(new Error('WebSocket connection closed before ready status received'))
          }
        })
      } catch (error) {
        if (!resolved) {
          resolved = true
          if (timeoutId!) clearTimeout(timeoutId)
          reject(error)
        }
      }
    })
  }

  /**
   * Wait for ready status using HTTP polling (fallback method)
   * Polls the /health endpoint every 5 seconds until worker is ready
   *
   * @param timeoutMs - Maximum time to wait in milliseconds
   * @throws Error if worker doesn't become ready within timeout
   */
  private async waitForReadyPolling(timeoutMs: number): Promise<void> {
    const pollIntervalMs = 5000 // Poll every 5 seconds
    const startTime = Date.now()

    console.log('Starting HTTP health polling (fallback mode)')

    while (true) {
      // Check timeout
      const elapsed = Date.now() - startTime
      if (elapsed >= timeoutMs) {
        throw new Error(`Timeout waiting for worker to become ready after ${timeoutMs}ms (polling mode)`)
      }

      try {
        // Make health check request
        const response = await fetch(`${this.workerUrl}/health`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          console.warn(`Health check returned ${response.status}, will retry...`)
          await this.sleep(pollIntervalMs)
          continue
        }

        const data = await response.json() as HealthResponse

        console.log(`SAM2 worker status: ${data.status}${data.progress_percent ? ` (${data.progress_percent}%)` : ''}`)

        // Check if worker is ready
        if (data.status === 'ready') {
          console.log('Worker is ready!')
          return
        }

        // Check for error status
        if (data.status === 'error') {
          throw new Error(`Worker error: ${data.error_message || 'Unknown error'}`)
        }

        // Worker is still warming up, wait and retry
        await this.sleep(pollIntervalMs)
      } catch (error) {
        // If it's our own error, rethrow
        if (error instanceof Error && error.message.startsWith('Worker error:')) {
          throw error
        }

        // Otherwise, log and retry
        console.warn('Health check failed, will retry:', error)
        await this.sleep(pollIntervalMs)
      }
    }
  }

  /**
   * Helper to sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Close any open WebSocket connection
   */
  close(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}

/**
 * Wait for a SAM2 worker to become ready
 * Convenience function that creates a listener and waits for ready status
 *
 * @param workerUrl - Base URL of the SAM2 worker
 * @param timeoutMs - Maximum time to wait in milliseconds (default: 5 minutes)
 * @throws Error if worker doesn't become ready within timeout
 */
export async function waitForSam2Ready(workerUrl: string, timeoutMs: number = 300000): Promise<void> {
  const listener = new Sam2HealthListener(workerUrl)

  try {
    await listener.waitForReady(timeoutMs)
  } finally {
    listener.close()
  }
}
