import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
const require = createRequire(import.meta.url)
const ts = require('typescript')
const { QueryClient, InfiniteQueryObserver } = require('@tanstack/react-query')

function hookOptions(filters = {}, options = {}, fetcher = async () => new Response('{}')) {
  const cache = new Map()
  function load(path: string): any {
    if (cache.has(path)) return cache.get(path)
    const exports = {}; cache.set(path, exports)
    const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    vm.runInNewContext(code, { exports, URLSearchParams, Date, fetch: fetcher, require: (name: string) => name === 'react' ? { useRef: (current: unknown) => ({ current }) }
      : name === '@tanstack/react-query' ? { useInfiniteQuery: (config: unknown) => config }
      : name.startsWith('@/') ? load(new URL(`../../${name.slice(2)}.ts`, import.meta.url).pathname) : require(name) })
    return exports
  }
  return load(new URL('../hooks/use-photos.ts', import.meta.url).pathname).usePhotosInfinite(filters, options)
}

test('infinite query retains >1000 distinct photos including early pages for backward scrolling', async () => {
  let requests = 0
  const config = hookOptions({}, {}, async (input: string) => {
    requests++
    const params = new URL(input, 'https://audit.invalid').searchParams
    const offset = Number(params.get('cursor') ?? 0)
    return new Response(JSON.stringify({ photos: Array.from({ length: 50 }, (_, n) => ({ id: offset + n })), total: 1250, nextCursor: offset + 50 < 1250 ? String(offset + 50) : null }))
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  try {
    const observer = new InfiniteQueryObserver(client, config)
    for (let n = 0; n < 25; n++) await observer.fetchNextPage()
    const result = observer.getCurrentResult()
    const ids = result.data.pages.flatMap((p: any) => p.photos.map((photo: any) => photo.id))
    assert.equal(ids.length, 1250)
    assert.equal(new Set(ids).size, 1250)
    assert.equal(ids[0], 0)
    assert.equal(ids.at(-1), 1249)
    assert.equal(result.hasNextPage, false)
    assert.equal(requests, 25)
  } finally { client.clear() }
})

test('externally supplied grid data can disable its internal query', () => {
  assert.equal(hookOptions({}, { enabled: false }).enabled, false)
})

test('completed analysis still polls while thumbnail is generating', () => {
  const config = hookOptions()
  assert.equal(config.refetchInterval({ state: { data: { pages: [{ photos: [{ id: 'photo', detection_status: 'completed', variant_status: 'processing' }] }] } } }), 3000)
})

test('empty filtered results still refresh so newly scored rows can enter the set', () => {
  const config = hookOptions({ minScore: 150 })
  assert.equal(config.refetchInterval({ state: { data: { pages: [{ photos: [] }] } } }), 60000)
})

test('visible processing photos keep a three-second refresh even after repeated observer updates', () => {
  for (const realtimeActive of [false, true]) {
    const config = hookOptions({}, { realtimeActive })
    const query = { state: { data: { pages: [{ photos: [{ id: 'photo', detection_status: 'processing', variant_status: 'ready' }] }] } } }
    for (let update = 0; update < 20; update++) assert.equal(config.refetchInterval(query), 3000)
  }
})
