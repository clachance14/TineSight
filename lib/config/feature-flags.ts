/**
 * Feature flags configuration for TineSight
 */

/**
 * Check if SAM2 pipeline is enabled
 * Reads from SAM2_PIPELINE_ENABLED environment variable
 */
export function isSam2PipelineEnabled(): boolean {
  return process.env['SAM2_PIPELINE_ENABLED'] === 'true'
}
