/** Conservative deployment defaults; project RPM/TPM quotas remain provider-owned. */
export function boundedSetting(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = value == null || value.trim() === '' ? NaN : Number(value)
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(1, Math.floor(parsed))) : fallback
}
export function modelChain(primary: string, fallbacks = ''): string[] {
  const models = [...new Set([primary, ...fallbacks.split(',')].map(model => model.trim()).filter(Boolean))]
  if (models.length > 2) throw new Error('Configure at most one Gemini fallback model')
  if (models.some(model => /^gemini-(1\.5|2\.0)(-|$)/.test(model))) {
    throw new Error('Gemini 1.5/2.0 models are retired; configure a supported GEMINI_MODEL')
  }
  return models
}
export const GEMINI_TASK_QUEUE = {
  name: 'gemini-paid-analysis',
  concurrencyLimit: boundedSetting(process.env['GEMINI_JOB_CONCURRENCY'] ?? process.env['TRIGGER_CONCURRENCY_LIMIT'], 10, 20),
}
export const GEMINI_CROP_CONCURRENCY = boundedSetting(process.env['GEMINI_CROP_CONCURRENCY'], 2, 4)
export const GEMINI_TIMEOUT_MS = boundedSetting(process.env['GEMINI_TIMEOUT_MS'], 60_000, 180_000)
export const GEMINI_MAX_ATTEMPTS = boundedSetting(process.env['GEMINI_MAX_ATTEMPTS'], 3, 5)
