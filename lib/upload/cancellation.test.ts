import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { registerUploadRun, releaseUploadRun } from './active-run.ts'

test('account change aborts all runs and removes unload prompt before reload', () => {
  const previous = globalThis.window
  const target = new EventTarget()
  Object.assign(globalThis, { window: target })
  try {
    const first = registerUploadRun('first'), second = registerUploadRun('second')
    target.dispatchEvent(new Event('tinesight:account-changed'))
    assert.equal(first.signal.aborted, true)
    assert.equal(second.signal.aborted, true)
    const unload = new Event('beforeunload', { cancelable: true })
    target.dispatchEvent(unload)
    assert.equal(unload.defaultPrevented, false)
  } finally { releaseUploadRun('first'); releaseUploadRun('second'); Object.assign(globalThis, { window: previous }) }
})

test('large session cancellation pages every batch and avoids oversized mutation URLs', async () => {
  const ids = Array.from({ length: 1201 }, (_, i) => `batch-${i}`)
  const touched: string[] = [], pages: number[] = []
  let parentCancelled = false
  const db = { from(table: string) {
    let updating = false, sessionLookup = false, range: [number, number] = [0, 999], batchIds: string[] = []
    const query = {
      select() { return query }, eq() { return query }, order() { return query },
      single() { sessionLookup = true; return query },
      range(from: number, to: number) { range = [from, to]; return query },
      update(_data: unknown, options?: { count: string }) { updating = true; if (table !== 'upload_sessions') assert.equal(options?.count, 'exact'); return query },
      in(column: string, values: string[]) { if (column === 'batch_id') batchIds = values; return query },
      then(resolve: (value: unknown) => unknown) {
        if (table === 'upload_sessions') {
          if (updating) parentCancelled = true
          return Promise.resolve(resolve({ data: sessionLookup ? { id: 'session', total_images: ids.length * 25 } : null, error: null }))
        }
        assert.equal(parentCancelled, true)
        if (table === 'processing_batches') {
          if (updating) return Promise.resolve(resolve({ count: ids.length, error: null }))
          pages.push(range[0]); return Promise.resolve(resolve({ data: ids.slice(range[0], range[1] + 1).map(id => ({ id })), error: null }))
        }
        assert.ok(batchIds.length <= 100)
        touched.push(...batchIds)
        return Promise.resolve(resolve({ count: batchIds.length * 25, error: null }))
      },
    }
    return query
  } }
  const source = fs.readFileSync(new URL('../services/upload-sessions.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports: Record<string, (...args: unknown[]) => Promise<{data: {photos_marked_for_deletion: number; batches_cancelled: number}; error: unknown}>> = {}
  new Function('exports', 'require', compiled)(exports, () => ({ createClient: async () => db }))
  const result = await exports['cancelSession']!('owner', 'session', 'all')
  assert.equal(result.error, null)
  assert.deepEqual(pages, [0, 500, 1000])
  assert.deepEqual(touched, ids)
  assert.equal(result.data.photos_marked_for_deletion, 1201 * 25)
  assert.equal(result.data.batches_cancelled, 1201)
})
