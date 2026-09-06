import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

test('recovery settles budgets first and never requeues failed previews through analysis selection', async () => {
  const calls: string[] = []
  const rows = [
    { id: 'one', batch_id: 'batch', detection_status: 'pending', variant_status: 'failed' },
    { id: 'two', batch_id: 'batch', detection_status: 'completed', variant_status: 'processing' },
  ]
  const query: Record<string, unknown> = {}
  for (const method of ['select','not','eq','is','or','order','limit','gt']) query[method] = () => query
  query['then'] = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: rows, error: null }))
  const db = { rpc: async (name: string) => { calls.push(name); return { error: null } }, from: () => { assert.deepEqual(calls,['expire_photo_work_budgets']); return query } }
  const source = fs.readFileSync(new URL('../../trigger/jobs/recover-photo-work.ts',import.meta.url),'utf8')
  const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  let run: (() => Promise<unknown>) | undefined
  const dependencies = {
    '../client': { schedules: { task: (options: {run: () => Promise<unknown>}) => { run=options.run; return options } } },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    // The job enqueues each page as two batches (see batch-process.ts); the
    // per-photo selection rules under test are unchanged.
    './analyze-photo': { analyzePhoto: { batchTrigger: async (items: Array<{payload: {imageId: string}}>) => { for (const item of items) calls.push(`analysis:${item.payload.imageId}`) } } },
    './generate-image-variants': { generateImageVariantsJob: { batchTrigger: async (items: Array<{payload: {imageId: string}}>) => { for (const item of items) calls.push(`variant:${item.payload.imageId}`) } } },
  }
  new Function('exports','require',compiled)({},(name: keyof typeof dependencies) => dependencies[name])
  assert.ok(run)
  await run()
  assert.deepEqual(calls,['expire_photo_work_budgets','analysis:one','variant:two'])
})

test('fanout configuration cannot create a zero-step loop or unbounded fanout', async () => {
  const { boundedSetting } = await import('../gemini/capacity.ts')
  for (const value of ['0', '-3', 'NaN', '', '100000']) {
    const rate = boundedSetting(value, 20, 100)
    assert.ok(rate >= 1 && rate <= 100)
    let chunks = 0
    for (let index = 0; index < 100; index += rate) chunks++
    assert.ok(chunks >= 1 && chunks <= 100)
  }
})
