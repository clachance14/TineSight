import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

interface UsageContext {
  batchId?: string
  imageId?: string
  detectionId?: string
}

interface UsageMetadata {
  promptTokenCount?: number
  candidatesTokenCount?: number
  thoughtsTokenCount?: number
  cachedContentTokenCount?: number
  toolUsePromptTokenCount?: number
  totalTokenCount?: number
}

const context = new AsyncLocalStorage<UsageContext>()

export function withGeminiUsageContext<T>(ids: UsageContext, work: () => T): T {
  return context.run({ ...context.getStore(), ...ids }, work)
}

function count(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

export interface TokenCounts {
  promptTokens: number | null
  responseTokens: number | null
  thoughtsTokens: number | null
  cachedTokens: number | null
  toolUsePromptTokens: number | null
  totalTokens: number | null
}

/** Standard text/image API rates; integer nanodollars avoid intermediate rounding. */
export function priceUsage(model: string, tokens: TokenCounts, timestamp: string): {
  costUsd: number | null; costNanodollars: number | null; pricingBasis: string
} {
  const unknown = { costUsd: null, costNanodollars: null, pricingBasis: 'unpriced: incomplete usage or unsupported model' }
  const { promptTokens: input, responseTokens: output, thoughtsTokens: thinking, totalTokens: total } = tokens
  if (input === null || output === null || total === null || !Number.isFinite(Date.parse(timestamp))) return unknown
  if (input + output + (thinking ?? 0) !== total || (tokens.toolUsePromptTokens ?? 0) !== 0) return unknown
  const cached = tokens.cachedTokens ?? 0
  if (cached > input) return unknown
  let rates: [number, number, number]
  if (model === 'gemini-3-flash-preview') rates = [500, 3000, 50]
  else if (model === 'gemini-3.8-flash' && Date.parse(timestamp) >= Date.parse('2026-09-02T00:00:00Z')) {
    // Cached pricing isn't verified here: leave cached 3.8 requests unpriced.
    if (cached !== 0) return unknown
    rates = Date.parse(timestamp) < Date.parse('2027-01-01T00:00:00Z') ? [750, 3750, 0] : [1500, 7500, 0]
  } else return unknown
  const costNanodollars = (input - cached) * rates[0] + (output + (thinking ?? 0)) * rates[1] + cached * rates[2]
  return { costUsd: costNanodollars / 1e9, costNanodollars, pricingBasis: 'standard text/image API list rates; excludes other calls, hosting, taxes and credits' }
}

export function usageTokens(usage?: UsageMetadata): TokenCounts {
  return {
    promptTokens: count(usage?.promptTokenCount),
    responseTokens: count(usage?.candidatesTokenCount),
    thoughtsTokens: count(usage?.thoughtsTokenCount),
    cachedTokens: count(usage?.cachedContentTokenCount),
    toolUsePromptTokens: count(usage?.toolUsePromptTokenCount),
    totalTokens: count(usage?.totalTokenCount),
  }
}

export type GeminiUsageEvent = ReturnType<typeof usageTokens> & UsageContext & {
  event: 'gemini_usage'
  requestId: string
  callId: string
  operation: string
  model: string
  attempt: number
  status: 'response' | 'error'
  durationMs: number
  timestamp: string
  usageReported: boolean
  errorStatus: number | null
}

/** Wrap the transport, inside retries and before response parsing. Never log payloads. */
export function createUsageRecorder(
  operation: string,
  emit: (event: GeminiUsageEvent) => void = event => console.info(JSON.stringify(event)),
) {
  const callId = randomUUID()
  let attempt = 0
  return async function record<T extends { usageMetadata?: UsageMetadata }>(model: string, request: () => Promise<T>): Promise<T> {
    const started = Date.now()
    const base = {
      ...context.getStore(), event: 'gemini_usage' as const, callId,
      requestId: randomUUID(), operation, model, attempt: ++attempt,
    }
    let usage: UsageMetadata | undefined
    let status: 'response' | 'error' = 'error'
    let errorStatus: number | null = null
    try {
      const response = await request()
      usage = response.usageMetadata
      status = 'response'
      return response
    } catch (error) {
      if (error !== null && typeof error === 'object') {
        // Preserve provider-reported usage on errors when supplied; never infer zero.
        const details = error as { usageMetadata?: UsageMetadata; status?: unknown; code?: unknown }
        usage = details.usageMetadata
        const code = Number(details.status ?? details.code)
        if (Number.isInteger(code) && code >= 400 && code <= 599) errorStatus = code
      }
      throw error
    } finally {
      try {
        const tokens = usageTokens(usage)
        const timestamp = new Date().toISOString()
        emit({ ...base, ...tokens, ...priceUsage(model, tokens, timestamp), status, errorStatus,
          durationMs: Date.now() - started, timestamp,
          usageReported: usage !== undefined,
        })
      } catch {
        // Telemetry must not retry a paid request or fail photo processing.
      }
    }
  }
}
