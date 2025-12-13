/**
 * SAM2 Vast.ai Pipeline Module
 *
 * Client and utilities for communicating with the SAM2 GPU worker
 * running on Vast.ai for deer and antler detection
 */

export {
  Sam2Client,
  getSam2Client,
  type HealthResponse,
  type AnalyzeImageRequest,
  type AnalyzeImageResponse,
  type AnalyzeOptions,
  type Detection,
} from './client'

export {
  Sam2HealthListener,
  waitForSam2Ready,
} from './health'
