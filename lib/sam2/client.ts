/**
 * SAM2 Vast.ai Pipeline Client
 *
 * Client for communicating with the SAM2 GPU worker running on Vast.ai
 * Handles deer and antler detection using the SAM2 model
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface HealthResponse {
  status: 'cold' | 'warming' | 'ready' | 'error'
  model_loaded: boolean
  model_name?: string | null
  uptime_seconds?: number
  progress_percent?: number
  error_message?: string | null
}

export interface AnalyzeImageRequest {
  imageUrl: string
  thresholds?: {
    deer?: number
    antlers?: number
  }
  maxInstances?: number
}

export interface Detection {
  deer_box_xyxy: [number, number, number, number]  // [xmin, ymin, xmax, ymax] pixels
  deer_score: number
  antler_box_xyxy: [number, number, number, number] | null
  antler_score: number | null
}

export interface AnalyzeImageResponse {
  deer_present: boolean
  detections: Detection[]
  model: {
    name: string
    revision?: string
  }
  processing_time_ms?: number
}

export interface AnalyzeOptions {
  thresholds?: {
    deer?: number
    antlers?: number
  }
  maxInstances?: number
  timeout?: number
}

// ============================================================================
// SAM2 Client
// ============================================================================

export class Sam2Client {
  private readonly workerUrl: string
  private readonly defaultTimeout: number = 60000 // 60 seconds

  constructor(workerUrl?: string) {
    this.workerUrl = workerUrl || process.env['SAM2_WORKER_URL'] || 'http://localhost:8000'

    // Remove trailing slash if present
    if (this.workerUrl.endsWith('/')) {
      this.workerUrl = this.workerUrl.slice(0, -1)
    }
  }

  /**
   * Check the health status of the SAM2 worker
   *
   * @returns Health status response
   */
  async checkHealth(): Promise<HealthResponse> {
    try {
      const response = await fetch(`${this.workerUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      return data as HealthResponse
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`SAM2 health check failed: ${error.message}`)
      }
      throw new Error('SAM2 health check failed: Unknown error')
    }
  }

  /**
   * Analyze an image for deer and antler detection
   *
   * @param imageUrl - URL of the image to analyze (must be publicly accessible)
   * @param options - Optional analysis parameters
   * @returns Detection results with bounding boxes and scores
   */
  async analyzeImage(imageUrl: string, options?: AnalyzeOptions): Promise<AnalyzeImageResponse> {
    const timeout = options?.timeout || this.defaultTimeout

    try {
      // Create request body
      const requestBody: AnalyzeImageRequest = {
        imageUrl,
        ...(options?.thresholds && { thresholds: options.thresholds }),
        ...(options?.maxInstances && { maxInstances: options.maxInstances }),
      }

      // Create an abort controller for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(`${this.workerUrl}/v1/analyze-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        throw new Error(`Analysis failed: ${response.status} ${response.statusText} - ${errorText}`)
      }

      const data = await response.json()
      return data as AnalyzeImageResponse
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`SAM2 analysis timed out after ${timeout}ms`)
        }
        throw new Error(`SAM2 analysis failed: ${error.message}`)
      }
      throw new Error('SAM2 analysis failed: Unknown error')
    }
  }

  /**
   * Get the configured worker URL
   */
  getWorkerUrl(): string {
    return this.workerUrl
  }
}

/**
 * Singleton instance of the SAM2 client
 * Uses SAM2_WORKER_URL environment variable
 */
let sam2Client: Sam2Client | null = null

/**
 * Get or create the singleton SAM2 client instance
 *
 * @returns Sam2Client instance
 */
export function getSam2Client(): Sam2Client {
  if (!sam2Client) {
    const workerUrl = process.env['SAM2_WORKER_URL']
    if (!workerUrl) {
      throw new Error('SAM2_WORKER_URL environment variable is not set')
    }
    sam2Client = new Sam2Client(workerUrl)
  }
  return sam2Client
}
