import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createUsageRecorder, usageTokens, priceUsage, withGeminiUsageContext, type GeminiUsageEvent } from './usage.ts'
import { withRetry } from './retry.ts'

test('prices the recovered 3.8 fingerprint exactly including thinking', () => {
  const cost = priceUsage('gemini-3.8-flash', usageTokens({ promptTokenCount: 2978,
    candidatesTokenCount: 1173, thoughtsTokenCount: 1920, totalTokenCount: 6071 }), '2026-09-05T20:39:33Z')
  assert.equal(cost.costNanodollars, 13832250)
  assert.equal(cost.costUsd, 0.01383225)
})

test('uses the pricing date and refuses unsupported or incomplete accounting', () => {
  const tokens = usageTokens({ promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 30, totalTokenCount: 150 })
  const intro = priceUsage('gemini-3.8-flash', tokens, '2026-12-31T23:59:59Z')
  const standard = priceUsage('gemini-3.8-flash', tokens, '2027-01-01T00:00:00Z')
  assert.equal(standard.costNanodollars, intro.costNanodollars! * 2)
  assert.equal(priceUsage('unknown', tokens, '2026-09-05').costUsd, null)
  assert.equal(priceUsage('gemini-3.8-flash', usageTokens(), '2026-09-05').costUsd, null)
  assert.equal(priceUsage('gemini-3.8-flash', { ...tokens, totalTokens: 170 }, '2026-09-05').costUsd, null)
  assert.equal(priceUsage('gemini-3.8-flash', { ...tokens, cachedTokens: 10 }, '2026-09-05').costUsd, null)
})

test('3 Flash cached input is discounted without adding it to total tokens', () => {
  const tokens = usageTokens({ promptTokenCount: 100, cachedContentTokenCount: 60,
    candidatesTokenCount: 20, thoughtsTokenCount: 30, totalTokenCount: 150 })
  assert.equal(priceUsage('gemini-3-flash-preview', tokens, '2026-09-05').costNanodollars, 173000)
})

test('records provider counts separately without double counting cached or thinking tokens', () => {
  assert.deepEqual(usageTokens({ promptTokenCount: 100, candidatesTokenCount: 20,
    thoughtsTokenCount: 30, cachedContentTokenCount: 60, toolUsePromptTokenCount: 5, totalTokenCount: 155 }), {
    promptTokens: 100, responseTokens: 20, thoughtsTokens: 30, cachedTokens: 60,
    toolUsePromptTokens: 5, totalTokens: 155,
  })
  assert.equal(usageTokens({ thoughtsTokenCount: 0 }).thoughtsTokens, 0)
  assert.equal(usageTokens().totalTokens, null)
  assert.equal(usageTokens({ totalTokenCount: NaN }).totalTokens, null)
})

test('captures usage before application parsing fails, without logging response content', async () => {
  const events: GeminiUsageEvent[] = []
  const record = createUsageRecorder('detection', event => events.push(event))
  const response = { text: 'private malformed response', usageMetadata: { totalTokenCount: 42 } }
  const result = await record('model-a', async () => response)
  assert.equal(result, response)
  assert.throws(() => JSON.parse(result.text))
  assert.equal(events.length, 1)
  assert.equal(events[0]?.totalTokens, 42)
  assert.equal(events[0]?.status, 'response')
  assert.equal(JSON.stringify(events).includes('private'), false)
})

test('logs every retry with unknown usage for failed requests and retains call identity', async () => {
  const events: GeminiUsageEvent[] = []
  const record = createUsageRecorder('comparison', event => events.push(event))
  let calls = 0
  await withRetry(() => record('model-a', async () => {
    if (++calls === 1) throw Object.assign(new Error('private provider message'), { status: 429 })
    return { usageMetadata: { totalTokenCount: 12 } }
  }), { sleep: async () => {} })
  assert.equal(events.length, 2)
  assert.equal(events[0]?.errorStatus, 429)
  assert.equal(events[0]?.totalTokens, null)
  assert.equal(events[0]?.usageReported, false)
  assert.equal(events[1]?.totalTokens, 12)
  assert.deepEqual(events.map(e => e.attempt), [1, 2])
  assert.equal(events[0]?.callId, events[1]?.callId)
  assert.notEqual(events[0]?.requestId, events[1]?.requestId)
  assert.equal(JSON.stringify(events).includes('private'), false)
})

test('fallback models remain separately attributable within a logical call', async () => {
  const events: GeminiUsageEvent[] = []
  const record = createUsageRecorder('fingerprint', event => events.push(event))
  const error = Object.assign(new Error('unavailable'), { status: 503, usageMetadata: { totalTokenCount: 7 } })
  await assert.rejects(record('model-a', async () => { throw error }), value => value === error)
  await record('model-b', async () => ({ usageMetadata: { totalTokenCount: 9 } }))
  assert.deepEqual(events.map(e => [e.model, e.totalTokens]), [['model-a', 7], ['model-b', 9]])
})

test('concurrent photos and nested crops keep their own attribution', async () => {
  const events: GeminiUsageEvent[] = []
  await Promise.all(['photo-a', 'photo-b'].map(imageId => withGeminiUsageContext({ batchId: 'batch', imageId }, async () => {
    await Promise.resolve()
    await withGeminiUsageContext({ detectionId: `${imageId}-crop` }, async () => {
      await createUsageRecorder('classification', event => events.push(event))('model', async () => {
        await new Promise(resolve => setTimeout(resolve, imageId === 'photo-a' ? 5 : 0))
        return { usageMetadata: { totalTokenCount: 1 } }
      })
    })
  })))
  assert.equal(events.length, 2)
  for (const event of events) {
    assert.equal(event.batchId, 'batch')
    assert.equal(event.detectionId, `${event.imageId}-crop`)
  }
  await createUsageRecorder('validation', event => events.push(event))('model', async () => ({}))
  assert.equal(events[2]?.imageId, undefined)
})

test('logger failures neither fail nor retry a successful paid request', async () => {
  let calls = 0
  const record = createUsageRecorder('detection', () => { throw new Error('logger unavailable') })
  const response = await withRetry(() => record('model', async () => {
    calls++
    return { usageMetadata: { totalTokenCount: 1 } }
  }))
  assert.equal(calls, 1)
  assert.equal(response.result.usageMetadata.totalTokenCount, 1)
})

test('every public Gemini operation routes through the metered transport', () => {
  const client = readFileSync(new URL('./client.ts', import.meta.url), 'utf8')
  const functions = client.split('export async function ').slice(1)
  assert.equal(functions.length, 8)
  for (const fn of functions) {
    assert.match(fn, /getMeteredGeminiClient\("[a-z_]+"\)/)
    assert.doesNotMatch(fn, /getGeminiClient\(\)/)
  }
})
