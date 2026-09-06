import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { dateInputValue, localDateBoundary, relativeDateRange } from './date-range.ts'
import { photoCursorPredicate } from './order.ts'
const require = createRequire(import.meta.url)
const ts = require('typescript')
function load(path: URL): Record<string, any> {
  const exports = {}
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(compiled, { exports, URLSearchParams, Date, require: (name: string) => name.startsWith('@/') ? load(new URL(`../../${name.slice(2)}.ts`, import.meta.url)) : require(name) })
  return exports
}
const { parsePhotoFilters, photoFilterParams } = load(new URL('./filters.ts', import.meta.url))
const { parseDetailFilters } = load(new URL('./detail-filters.ts', import.meta.url))

test('same source, content, date, archive and ordering survive list/detail/bulk URL round trip', () => {
  const filters = { cameraId: 'cam-1', uploadSessionId: 'pull-2', batchId: 'batch-3', hasDeer: true, hasDetections: true, status: 'completed', minConfidence: 65, minPoints: 8, maxPoints: 10, minScore: 130, areaNames: ['North, creek', 'South'], otherAnimals: ['people'], dateFrom: '2026-09-01T05:00:00.000Z', dateTo: '2026-09-06T04:59:59.999Z', includeArchived: true, sortBy: 'best_score', sortDirection: 'desc' }
  const params = photoFilterParams(filters)
  assert.deepEqual(JSON.parse(JSON.stringify(parsePhotoFilters(params))), filters)
  assert.deepEqual(JSON.parse(JSON.stringify(parseDetailFilters(params))), filters)
})

test('legacy point and source links retain filters', () => {
  const filters = parsePhotoFilters(new URLSearchParams('min_points=8&max_points=9&areaName=North&hasDetections=false&cameraId=cam&uploadSessionId=pull'))
  assert.equal(filters.minPoints, 8)
  assert.equal(filters.maxPoints, 9)
  assert.equal(filters.hasDetections, false)
  assert.equal(filters.cameraId, 'cam')
  assert.equal(filters.uploadSessionId, 'pull')
})

test('invalid ranges, boolean values and cursor syntax are rejected', () => {
  for (const query of ['minConfidence=110', 'isArchived=yes', 'minPoints=9&maxPoints=8', 'minScore=1e100', 'dateFrom=2026-09-06&dateTo=2026-09-01', 'cursor=bad']) {
    assert.throws(() => parsePhotoFilters(new URLSearchParams(query)), undefined, query)
  }
  assert.throws(() => photoCursorPredicate('best_score', false, '5),id.not.is.null::00000000-0000-4000-8000-000000000001'))
})

test('local date bounds include entire day and round-trip through date inputs', () => {
  const start = localDateBoundary('2026-09-05')
  const end = localDateBoundary('2026-09-05', true)
  assert.equal(dateInputValue(start), '2026-09-05')
  assert.equal(dateInputValue(end), '2026-09-05')
  const noon = new Date(2026, 8, 5, 12).getTime()
  assert(Date.parse(start) < noon && Date.parse(end) > noon)
  assert.equal(new Date(start).getHours(), 0)
  assert.equal(new Date(end).getHours(), 23)
})

test('relative saved dates roll on reopening; fixed custom ranges remain exact', () => {
  const saved = parsePhotoFilters(new URLSearchParams('datePreset=last7days&cameraId=North'))
  assert.equal(saved.dateFrom, undefined)
  const first = relativeDateRange(saved.datePreset, new Date(2026, 8, 5, 12))
  const reopened = relativeDateRange(saved.datePreset, new Date(2026, 8, 12, 12))
  assert.equal(dateInputValue(first.dateFrom), '2026-08-30')
  assert.equal(dateInputValue(first.dateTo), '2026-09-05')
  assert.equal(dateInputValue(reopened.dateFrom), '2026-09-06')
  assert.equal(dateInputValue(reopened.dateTo), '2026-09-12')
  const custom = parsePhotoFilters(new URLSearchParams('datePreset=custom&dateFrom=2026-08-01&dateTo=2026-08-05'))
  assert.equal(custom.dateFrom, '2026-08-01')
  assert.equal(custom.dateTo, '2026-08-05')
})

 test('archive and review changes preserve Empty, security and source scopes', () => {
  const { withArchiveState, withReviewStatus } = load(new URL('./filters.ts', import.meta.url))
  for (const triageView of ['empty', 'security', 'trophy']) {
    const scope = { triageView, cameraId: 'north', uploadSessionId: 'pull', dateFrom: '2026-09-01' }
    const archived = withArchiveState(scope, 'archived')
    assert.equal(archived.triageView, triageView)
    assert.equal(archived.isArchived, true)
    const kept = withReviewStatus(archived, 'keep')
    assert.equal(kept.triageView, triageView)
    assert.equal(kept.isArchived, true)
    assert.equal(kept.cameraId, 'north')
    assert.equal(kept.reviewStatus, 'keep')
  }
})

test('source and analysis selects set, replace and clear their field without touching the rest of the scope', () => {
  const { withSourceField } = load(new URL('./filters.ts', import.meta.url))
  const scope = { triageView: 'trophy', dateFrom: '2026-09-01', reviewStatus: 'keep' }
  for (const key of ['cameraId', 'uploadSessionId', 'qualityStatus']) {
    const set = withSourceField(scope, key, 'value-1')
    assert.equal(set[key], 'value-1', `${key} is set`)
    assert.equal(set.triageView, 'trophy', `${key} leaves the triage view alone`)
    assert.equal(set.dateFrom, '2026-09-01')
    assert.equal(withSourceField(set, key, 'value-2')[key], 'value-2', `${key} is replaced`)
    const cleared = withSourceField(set, key, '')
    assert.equal(key in cleared, false, `${key} is cleared by the empty option`)
    assert.equal(cleared.reviewStatus, 'keep')
  }
  const status = withSourceField(scope, 'status', 'failed')
  assert.equal(status.status, 'failed')
  assert.equal(status.triageView, 'all', 'an explicit analysis status hands scope to the status field')
  const anyStatus = withSourceField(status, 'status', '')
  assert.equal('status' in anyStatus, false, 'Any status clears the field')
  assert.equal(anyStatus.triageView, 'all')
  assert.deepEqual(scope, { triageView: 'trophy', dateFrom: '2026-09-01', reviewStatus: 'keep' }, 'input is not mutated')
})
