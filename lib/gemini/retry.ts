/** Retry only transient provider failures. Dependencies are injectable for stress tests. */
export interface RetryOptions {
  maxAttempts?: number
  timeoutMs?: number
  maxElapsedMs?: number
  initialDelayMs?: number
  maxDelayMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  random?: () => number
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}
function providerError(error: unknown): Record<string, unknown> {
  const value = record(error)
  const message = value['message']
  if (typeof message === 'string') {
    try { return { ...record(record(JSON.parse(message))['error']), ...value } } catch { /* Plain text error. */ }
  }
  return value
}
export function errorStatus(error: unknown): number | null {
  const value = providerError(error)
  for (const field of ['status', 'statusCode', 'code']) {
    const status = Number(value[field])
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status
  }
  const message = typeof value['message'] === 'string' ? value['message'] : ''
  const status = message.match(/\b(408|429|500|502|503|504)\b/)
  if (status) return Number(status[1])
  if (/resource_exhausted|rate.?limit/i.test(message)) return 429
  if (/unavailable|overloaded/i.test(message)) return 503
  return null
}
export function isModelUnavailable(error: unknown): boolean {
  return [404, 503].includes(errorStatus(error) ?? 0)
}
function retryable(error: unknown): boolean {
  const status = errorStatus(error)
  if (status !== null) return [408, 429, 500, 502, 503, 504].includes(status)
  const value = record(error)
  return value['name'] === 'TimeoutError' || /timeout|timed out|network|fetch failed|ECONNRESET|ETIMEDOUT/i.test(String(value['message'] ?? ''))
}
export function retryAfterMs(error: unknown, now = Date.now()): number | null {
  const value = providerError(error)
  const headers = value['headers'] ?? record(value['response'])['headers']
  const headerRecord = record(headers)
  const raw = typeof headerRecord['get'] === 'function'
    ? (headerRecord['get'] as (key: string) => unknown).call(headers, 'retry-after')
    : headerRecord['retry-after'] ?? headerRecord['Retry-After']
  if (typeof raw === 'string' || typeof raw === 'number') {
    const seconds = Number(raw)
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
    const date = Date.parse(String(raw))
    if (Number.isFinite(date)) return Math.max(0, date - now)
  }
  // The installed Google SDK preserves google.rpc.RetryInfo in its JSON error
  // message, even when it does not expose the HTTP response headers.
  if (Array.isArray(value['details'])) {
    for (const detail of value['details']) {
      const delay = record(detail)['retryDelay']
      if (typeof delay === 'string' && /^\d+(\.\d+)?s$/.test(delay)) return Number(delay.slice(0, -1)) * 1000
    }
  }
  return null
}
function bounded(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.floor(value))) : fallback
}
export async function withRetry<T>(fn: (signal: AbortSignal) => Promise<T>, options: RetryOptions = {}): Promise<{ result: T; retryCount: number; wasRateLimited: boolean }> {
  const maxAttempts = bounded(options.maxAttempts, 3, 1, 5)
  const timeoutMs = bounded(options.timeoutMs, 60_000, 1, 180_000)
  const maxElapsedMs = bounded(options.maxElapsedMs, 180_000, 1, 300_000)
  const initialDelayMs = bounded(options.initialDelayMs, 1000, 1, 30_000)
  const maxDelayMs = bounded(options.maxDelayMs, 30_000, 1, 60_000)
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))
  const now = options.now ?? Date.now
  const random = options.random ?? Math.random
  const start = now()
  let wasRateLimited = false
  let lastError: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const remaining = maxElapsedMs - (now() - start)
    if (remaining <= 0) throw lastError ?? new Error('Gemini retry deadline exceeded')
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error('Gemini request timed out')
          error.name = 'TimeoutError'
          reject(error)
          controller.abort(error)
        }, Math.min(timeoutMs, remaining))
      })
      const result = await Promise.race([Promise.resolve().then(() => fn(controller.signal)), timeout])
      return { result, retryCount: attempt, wasRateLimited }
    } catch (error) {
      lastError = error
      wasRateLimited ||= errorStatus(error) === 429
      if (attempt + 1 >= maxAttempts || !retryable(error)) throw error
      const exponential = Math.min(maxDelayMs, initialDelayMs * 2 ** attempt)
      const jittered = exponential * (0.5 + Math.min(1, Math.max(0, random())) * 0.5)
      const delay = Math.max(jittered, retryAfterMs(error, now()) ?? 0)
      // Never shorten a provider Retry-After to fit our budget and retry early.
      if (delay >= maxElapsedMs - (now() - start)) throw error
      clearTimeout(timer)
      await sleep(delay)
    } finally { clearTimeout(timer) }
  }
  throw lastError
}
