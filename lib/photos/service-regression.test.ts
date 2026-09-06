import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const { createClient } = require('@supabase/supabase-js')
const sourcePath = new URL('../services/photos.ts', import.meta.url)
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

type Row = Record<string, unknown> & { id: string }
const fixtures: Row[] = Array.from({ length: 1207 }, (_, n) => ({
  id: uuid(n + 1), user_id: 'owner', captured_at: n < 1100 ? `2026-06-${String(n % 28 + 1).padStart(2, '0')}T12:00:00Z` : null,
  imported_at: `2026-07-${String(n % 28 + 1).padStart(2, '0')}T12:00:00Z`,
  best_score: n < 1130 ? n % 201 : null, is_archived: n >= 1200, upload_completed_at: '2026-07-01T12:00:00Z',
  batch_id: n % 2 ? 'north-batch' : 'south-batch',
}))
function split(expression: string): string[] {
  let depth = 0, start = 0
  const result: string[] = []
  for (let i = 0; i < expression.length; i++) {
    if (expression[i] === '(') depth++
    if (expression[i] === ')') depth--
    if (expression[i] === ',' && depth === 0) { result.push(expression.slice(start, i)); start = i + 1 }
  }
  result.push(expression.slice(start))
  return result
}
function predicate(row: Row, expression: string): boolean {
  if (expression.startsWith('and(')) return split(expression.slice(4, -1)).every(x => predicate(row, x))
  if (expression.startsWith('or(')) return split(expression.slice(3, -1)).some(x => predicate(row, x))
  const [, key, op, raw] = expression.match(/^([^.]+)\.([^.]+)\.(.*)$/) ?? []
  const value = row[key!]
  const right = raw === 'null' ? null : raw === 'true' ? true : raw === 'false' ? false : typeof value === 'number' ? Number(raw) : raw
  if (op === 'not' && raw === 'is.null') return value != null
  if (op === 'is' || op === 'eq') return value === right
  if (op === 'in') return raw!.slice(1, -1).split(',').map(value => value.startsWith('"') ? JSON.parse(value) : value).includes(String(value))
  if (value == null || right == null) return false
  if (op === 'gt') return value > right
  if (op === 'gte') return value >= right
  if (op === 'lt') return value < right
  if (op === 'lte') return value <= right
  throw new Error(`Unsupported test predicate: ${expression}`)
}
function harness(inputRows: Row[] = fixtures, batches?: Row[], detections: Row[] = []) {
  const requests: URL[] = []
  const stored = inputRows.map(row => ({ ...row }))
  const client = createClient('https://audit.invalid', 'placeholder', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input: string, init?: RequestInit) => {
      const url = new URL(String(input)); requests.push(url)
      let rows: Row[] = stored.slice()
      if (url.pathname.endsWith('/detections')) rows = detections.slice()
      if (url.pathname.includes('/rpc/')) return new Response(JSON.stringify([{ image_ids: stored.map(x => x.id), total_count: stored.length }]), { headers: { 'Content-Type': 'application/json' } })
      if (url.pathname.endsWith('/processing_batches')) rows = batches ?? [{ id: 'north-batch', area_name: 'North', user_id: 'owner' }]
      if ((url.searchParams.get('select') ?? '').includes('source_batch:')) {
        const batchRows = batches ?? [{ id: 'north-batch', area_name: 'North', user_id: 'owner' }]
        rows = rows.map(row => {
          let related = batchRows.find(batch => batch.id === row.batch_id) ?? null
          for (const [key, value] of url.searchParams) {
            if (!key.startsWith('source_batch.') || related === null) continue
            const field = key.slice('source_batch.'.length)
            const matches = field === 'or' ? split(value.slice(1, -1)).some(expression => predicate(related!, expression)) : predicate(related, `${field}.${value}`)
            if (!matches) related = null
          }
          return { ...row, source_batch: related }
        })
      }
      for (const [key, value] of url.searchParams) {
        if (key.startsWith('source_batch.')) continue
        if (key === 'detections' && value === 'is.null') { rows = rows.filter(row => !Array.isArray(row['detections']) || row['detections'].length === 0); continue }
        if (['select', 'order', 'offset', 'limit'].includes(key) || key.startsWith('detections')) continue
        rows = rows.filter(row => key === 'or' ? split(value.slice(1, -1)).some(x => predicate(row, x)) : predicate(row, `${key}.${value}`))
      }
      if (init?.method === 'PATCH' && typeof init.body === 'string') {
        const patch = JSON.parse(init.body)
        for (const row of rows) Object.assign(row, patch)
      }
      const count = rows.length
      const orders = (url.searchParams.get('order') ?? '').split(',').filter(Boolean)
      rows.sort((a, b) => {
        for (const order of orders) {
          const [key, direction, nulls] = order.split('.')
          const av = a[key!], bv = b[key!]
          if (av === bv) continue
          if (av == null) return nulls === 'nullsfirst' ? -1 : 1
          if (bv == null) return nulls === 'nullsfirst' ? 1 : -1
          return (av < bv ? -1 : 1) * (direction === 'desc' ? -1 : 1)
        }
        return 0
      })
      const offset = Number(url.searchParams.get('offset') ?? 0)
      rows = rows.slice(offset, offset + Math.min(1000, Number(url.searchParams.get('limit') ?? 1000)))
      const single = new Headers(init?.headers).get('accept') === 'application/vnd.pgrst.object+json'
      return new Response(JSON.stringify(single ? rows[0] : rows), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': `0-${Math.max(0, rows.length - 1)}/${count}` } })
    } },
  })
  const moduleCache = new Map<string, Record<string, unknown>>()
  function load(path: string): Record<string, any> {
    if (moduleCache.has(path)) return moduleCache.get(path)!
    const result = {}; moduleCache.set(path, result)
    const compiled = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    vm.runInNewContext(compiled, { exports: result, console, URL, URLSearchParams, Date, require: (name: string) => name === 'react' ? { cache: (f: unknown) => f } : name === '@/lib/supabase/server' ? { createClient: async () => client } : name.startsWith('@/') ? load(new URL(`../../${name.slice(2)}.ts`, import.meta.url).pathname) : require(name) })
    return result
  }
  return { service: load(sourcePath.pathname), requests }
}

test('photo detail excludes retired duplicate detections while preserving the scored original', async () => {
  const original = { id: uuid(2), image_id: uuid(1), deleted_at: null, score_gross: 128 }
  const duplicate = { id: uuid(3), image_id: uuid(1), deleted_at: '2026-09-05T00:00:00Z', score_gross: null }
  const { service } = harness([{ id: uuid(1), user_id: 'owner', deer_count: 1 }], undefined, [original, duplicate])
  const result = await service.getPhoto('owner', uuid(1))
  assert.equal(result.error, null)
  assert.deepEqual(JSON.parse(JSON.stringify(result.data.detections)), [original])
  assert.equal(result.data.deer_count, result.data.detections.length)
})

for (const sortBy of ['captured_at', 'imported_at', 'best_score']) {
  for (const sortDirection of ['asc', 'desc']) {
    for (const detection of [false, true]) {
      test(`all 1200 active photos reachable once: ${sortBy} ${sortDirection}, detection=${detection}`, async () => {
        const { service } = harness()
        const ids: string[] = []
        let cursor: string | undefined
        for (let page = 0; page < 30; page++) {
          const result = await service.getPhotos('owner', { sortBy, sortDirection, limit: 50, ...(detection ? { sex: 'buck' } : {}), ...(cursor ? { cursor } : {}) })
          assert.equal(result.error, null)
          const rows: Row[] = result.data
          if (!rows.length) break
          ids.push(...rows.map(x => x.id))
          const last = rows.at(-1)!
          cursor = `${last[sortBy] ?? 'null'}::${last.id}`
        }
        assert.equal(ids.length, 1200)
        assert.equal(new Set(ids).size, 1200, 'cursor must advance without duplicates, including null tails')
        assert(fixtures.filter(x => x.is_archived).every(x => !ids.includes(x.id)))
      })
    }
  }
}

test('pager matches captured ascending order and active archive scope', async () => {
  const { service } = harness()
  const filters = { sortBy: 'captured_at', sortDirection: 'asc' }
  const page = await service.getPhotos('owner', { ...filters, limit: 50 })
  const center = page.data[20]
  const neighbors = await service.getAdjacentPhotos('owner', center.id, filters)
  assert.equal(neighbors.prevId, page.data[19].id)
  assert.equal(neighbors.nextId, page.data[21].id)
})

test('select all with buck and area remains scoped to area and active photos', async () => {
  const { service } = harness()
  const result = await service.getPhotoIds('owner', { sex: 'buck', areaName: 'North' })
  assert.equal(result.count, 600)
  assert(result.data.every((id: string) => fixtures.find(x => x.id === id)?.batch_id === 'north-batch'))
})

test('date-only upper boundary includes selected day', async () => {
  const { service } = harness()
  const result = await service.getPhotos('owner', { dateFrom: '2026-06-01', dateTo: '2026-06-01', limit: 50 })
  assert(result.data.length > 0, 'noon on selected day must be included')
})

for (const sortBy of ['captured_at', 'imported_at', 'best_score']) {
  for (const sortDirection of ['asc', 'desc']) {
    test(`pager preserves tuple order at beginning, middle and null tail: ${sortBy} ${sortDirection}`, async () => {
      const { service } = harness()
      const filters = { sortBy, sortDirection }
      const all: Row[] = []
      let cursor: string | undefined
      for (let page = 0; page < 25; page++) {
        const result = await service.getPhotos('owner', { ...filters, limit: 50, ...(cursor ? { cursor } : {}) })
        if (!result.data.length) break
        all.push(...result.data)
        const last = all.at(-1)!
        cursor = `${last[sortBy] ?? 'null'}::${last.id}`
      }
      for (const index of [0, 500, 1099, 1100, 1130, 1199]) {
        const neighbors = await service.getAdjacentPhotos('owner', all[index]!.id, filters)
        assert.equal(neighbors.prevId, all[index - 1]?.id ?? null, `previous at ${index}`)
        assert.equal(neighbors.nextId, all[index + 1]?.id ?? null, `next at ${index}`)
      }
    })
  }
}

test('archive view and includeArchived explicitly expose preserved photos', async () => {
  const { service } = harness()
  const archived = await service.getPhotos('owner', { isArchived: true })
  assert.equal(archived.data.length, 7)
  assert(archived.data.every((row: Row) => row.is_archived))
  const all = await service.getPhotoIds('owner', { includeArchived: true })
  assert.equal(all.count, 1207)
})

test('manual archive and restore round trip preserves photo and its visibility', async () => {
  const { service } = harness()
  assert.equal((await service.archivePhotos('owner', [uuid(1)], true)).data.count, 1)
  const archived = await service.getPhotos('owner', { isArchived: true })
  assert(archived.data.some((row: Row) => row.id === uuid(1)))
  assert.equal((await service.archivePhotos('owner', [uuid(1)], false)).data.count, 1)
  const after = await service.getPhotos('owner', { isArchived: true })
  assert(!after.data.some((row: Row) => row.id === uuid(1)))
})

for (const size of [1001, 1200, 10000]) {
  for (const sortDirection of ['asc', 'desc']) {
    test(`metadata acceptance ${size}: score ${sortDirection}, cross-page ties/nulls, exact IDs and bounded URLs`, async () => {
      // Every size includes long equal-score groups and a null tail, including1001.
      const rows = Array.from({ length: size }, (_, index) => ({ ...fixtures[index % fixtures.length]!, id: uuid(index + 1), best_score: index % 9 === 0 ? null : index % 5, is_archived: false }))
      const { service, requests } = harness(rows)
      const expected = [...rows].sort((a, b) => {
        if (a.best_score === null && b.best_score !== null) return 1
        if (b.best_score === null && a.best_score !== null) return -1
        const valueComparison = (a.best_score ?? 0) - (b.best_score ?? 0)
        const comparison = valueComparison || a.id.localeCompare(b.id)
        return sortDirection === 'asc' ? comparison : -comparison
      }).map(row => row.id)
      const ids: string[] = []
      let cursor: string | undefined
      let exhausted = false
      for (let page = 0; page <= Math.ceil(size / 100); page++) {
        const result = await service.getPhotos('owner', { sortBy: 'best_score', sortDirection, sex: 'buck', limit: 100, ...(cursor ? { cursor } : {}) })
        assert.equal(result.error, null)
        if (page === 0) assert.equal(result.count, size, 'first-page total is the catalog total used by the grid')
        assert(result.data.length <= 100, 'each page respects the requested metadata bound')
        if (result.data.length === 0) { exhausted = true; break }
        ids.push(...result.data.map((row: Row) => row.id))
        const last = result.data.at(-1)
        cursor = `${last.best_score ?? 'null'}::${last.id}`
      }
      assert(exhausted, 'the cursor must eventually reach an empty page')
      assert.equal(ids.length, size)
      assert.equal(new Set(ids).size, size)
      assert.deepEqual(ids, expected, 'independent numeric/id tuple ordering includes NULLS LAST in both directions')
      const selection = await service.getPhotoIds('owner', { sex: 'buck' })
      assert.equal(selection.error, null)
      assert.deepEqual(Array.from(selection.data).sort(), [...expected].sort(), 'select-all reaches the exact same full metadata set')
      const maximumUrl = Math.max(...requests.map(url => Buffer.byteLength(url.toString(), 'utf8')))
      assert(maximumUrl < 8192, `request URL must be <8192 bytes, got ${maximumUrl}`)
      assert(requests.every(url => !url.searchParams.has('id') || !url.searchParams.get('id')!.startsWith('in.')))
      console.log(`T42 ${size} ${sortDirection}: ${requests.length} requests; maximum URL ${maximumUrl} bytes; ${rows.filter(row => row.best_score === null).length} null scores; exact order and complete selection`)
    })
  }
}

test('Empty photos excludes processing, deer, people, vehicles and remaining live detections', async () => {
  const empty = { ...fixtures[0]!, detection_status: 'completed', has_deer: false, has_people: false, has_vehicles: false, has_hogs: false, has_cows: false, has_goats: false }
  const rows = [empty, { ...empty, id: uuid(2), has_people: true }, { ...empty, id: uuid(3), has_vehicles: true }, { ...empty, id: uuid(4), has_deer: true }, { ...empty, id: uuid(5), detection_status: 'pending' }, { ...empty, id: uuid(6), detections: [{ class: 'animal' }] }]
  const { service } = harness(rows)
  const result = await service.getPhotos('owner', { emptyOnly: true })
  assert.deepEqual(Array.from(result.data, (row: Row) => row.id), [uuid(1)])
  const ids = await service.getPhotoIds('owner', { emptyOnly: true })
  assert.deepEqual(Array.from(ids.data), [uuid(1)])
})

test('priority triage always includes security independently of trophy status', async () => {
  const base = { ...fixtures[0]!, has_people: false, has_vehicles: false, triage_tier: 'empty' }
  const { service } = harness([{ ...base, triage_tier: 'trophy' }, { ...base, id: uuid(2), triage_tier: 'other', has_people: true }, { ...base, id: uuid(3), has_vehicles: true }, { ...base, id: uuid(4) }])
  const result = await service.getPhotos('owner', { triageView: 'priority' })
  assert.equal(result.data.length, 3)
  assert(!result.data.some((row: Row) => row.id === uuid(4)))
})

test('2001 source batches use bounded relational filtering, never giant UUID lists', async () => {
  const batches = Array.from({ length: 2001 }, (_, n) => ({ id: uuid(n + 30000), area_name: 'North', upload_session_id: 'pull', user_id: 'owner' }))
  const rows = batches.map((batch, n) => ({ ...fixtures[n % fixtures.length]!, id: uuid(n + 1), batch_id: batch.id, is_archived: false }))
  const { service, requests } = harness(rows, batches)
  const result = await service.getPhotoIds('owner', { areaName: 'North', uploadSessionId: 'pull' })
  assert.equal(result.count, 2001)
  assert.deepEqual(Array.from(result.data).sort(), rows.map(row => row.id).sort())
  assert(requests.every(url => !url.pathname.endsWith('/processing_batches')), 'source batches stay relational rather than client-prefetched')
  assert(requests.every(url => !url.searchParams.has('batch_id')), 'no batch UUID list grows with source count')
  const maximumUrl = Math.max(...requests.map(url => Buffer.byteLength(url.toString(), 'utf8')))
  assert(maximumUrl < 8192, `largest URL ${maximumUrl}`)
  console.log(`T42 2001 source batches: ${requests.length} requests; maximum URL ${maximumUrl} bytes; exact selection`)

})

test('relational area scopes preserve No Area and intersect upload sessions in grid, IDs and pager', async () => {
  const batches = [
    { id: 'named', area_name: 'North', upload_session_id: 'pull', user_id: 'owner' },
    { id: 'unnamed', area_name: null, upload_session_id: 'pull', user_id: 'owner' },
    { id: 'outside', area_name: 'South', upload_session_id: 'other', user_id: 'owner' },
  ]
  const rows = [null, 'named', 'unnamed', 'outside'].map((batch_id, n) => ({ ...fixtures[n]!, id: uuid(n + 1), batch_id, is_archived: false }))
  const { service, requests } = harness(rows, batches)
  for (const [filters, expected] of [
    [{ areaName: '__no_area__' }, [uuid(1), uuid(3)]],
    [{ areaNames: ['North', '__no_area__'] }, [uuid(1), uuid(2), uuid(3)]],
    [{ areaNames: ['North', '__no_area__'], uploadSessionId: 'pull' }, [uuid(2), uuid(3)]],
    [{ areaName: 'South', uploadSessionId: 'pull' }, []],
  ] as const) {
    const selected = await service.getPhotoIds('owner', filters)
    assert.deepEqual(Array.from(selected.data, (row: any) => typeof row === 'string' ? row : row.id).sort(), [...expected].sort())
    const grid = await service.getPhotos('owner', { ...filters, sortBy: 'captured_at', sortDirection: 'asc' })
    assert.deepEqual(Array.from(grid.data, (row: any) => row.id), [...expected])
    if (expected.length > 1) {
      const adjacent = await service.getAdjacentPhotos('owner', expected[0], { ...filters, sortBy: 'captured_at', sortDirection: 'asc' })
      assert.equal(adjacent.nextId, expected[1])
    }
  }
  assert(requests.every(url => !url.pathname.endsWith('/processing_batches')))
})
