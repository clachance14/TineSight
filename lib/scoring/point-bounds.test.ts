/**
 * Guards the enum -> point-bounds mapping in migration 052.
 *
 * `detections.point_min` / `point_max` are STORED generated columns derived from
 * `estimated_point_range`, whose value domain is the Zod enum in
 * lib/validations/detection.ts. Migration 051 derived those bounds with a bare
 * `(\d+)-(\d+)` regex, which parses only two of the six enum values — so "10+ points"
 * (82% of rows on the dogfood account, and the trophy tier on a bred-for-antlers
 * operation) got NULL bounds and silently vanished from every point filter.
 *
 * The mapping now lives in SQL, which no TypeScript test can execute. What this test
 * CAN do is fail the moment a seventh enum value appears without a matching SQL
 * branch — reintroducing that exact bug by construction. Mirror any change to
 * migration 052's CASE expression here.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ESTIMATED_POINT_RANGE_OPTIONS } from '../validations/detection.ts'

/** Open-ended upper bound. Mirrors migration 052; see the COMMENT ON COLUMN in 053. */
const OPEN_UPPER = 99

/** TypeScript mirror of migration 052's CASE expression. Keep the two in lockstep. */
function pointBounds(range: string | null): { min: number | null; max: number | null } {
  if (range === null) return { min: null, max: null }

  const span = /(\d+)\s*-\s*(\d+)/.exec(range)
  if (span) return { min: Number(span[1]), max: Number(span[2]) }

  const open = /(\d+)\s*\+/.exec(range)
  if (open) return { min: Number(open[1]), max: OPEN_UPPER }

  if (/^\s*spike/i.test(range)) return { min: 2, max: 2 }
  if (/^\s*fork/i.test(range)) return { min: 4, max: 4 }

  return { min: null, max: null }
}

/** Overlap predicate used by both the RPC and the embedded filter. */
function overlaps(
  b: { min: number | null; max: number | null },
  minPoints?: number,
  maxPoints?: number
): boolean {
  if (minPoints === undefined && maxPoints === undefined) return true
  if (b.min === null || b.max === null) return false
  if (minPoints !== undefined && b.max < minPoints) return false
  if (maxPoints !== undefined && b.min > maxPoints) return false
  return true
}

test('every enum value except "unknown" produces non-null bounds', () => {
  for (const option of ESTIMATED_POINT_RANGE_OPTIONS) {
    const bounds = pointBounds(option)
    if (option === 'unknown') {
      assert.equal(bounds.min, null, '"unknown" must stay unparseable')
      continue
    }
    assert.notEqual(
      bounds.min,
      null,
      `"${option}" parsed to NULL bounds — it will silently vanish from every point filter (this is the migration 051 bug). Add a branch to migration 052's CASE and mirror it here.`
    )
    assert.notEqual(bounds.max, null, `"${option}" has a NULL upper bound`)
  }
})

test('the open-ended tier is reachable by a minPoints filter', () => {
  // The regression that motivated 052: "10+ points" was excluded from minPoints=10.
  const tenPlus = pointBounds('10+ points')
  assert.deepEqual(tenPlus, { min: 10, max: OPEN_UPPER })
  assert.ok(overlaps(tenPlus, 10, undefined), '10+ must match minPoints=10')
  assert.ok(overlaps(tenPlus, 12, undefined), '10+ must match minPoints=12')
  assert.ok(overlaps(tenPlus, undefined, 20), '10+ must match maxPoints=20')
  // Documented edge: a minPoints above the sentinel excludes the tier entirely.
  assert.equal(overlaps(tenPlus, OPEN_UPPER + 1, undefined), false)
})

test('span, word and future open-ended values parse as specified', () => {
  assert.deepEqual(pointBounds('6-8 points'), { min: 6, max: 8 })
  assert.deepEqual(pointBounds('8-10 points'), { min: 8, max: 10 })
  assert.deepEqual(pointBounds('spike'), { min: 2, max: 2 })
  assert.deepEqual(pointBounds('fork'), { min: 4, max: 4 })
  // Numeric branches are ordered before the word branches so unseen free-text
  // values keep working without another migration.
  assert.deepEqual(pointBounds('20+ points'), { min: 20, max: OPEN_UPPER })
  assert.deepEqual(pointBounds('12-14 points'), { min: 12, max: 14 })
})

test('unparseable ranges never match a bounded filter', () => {
  const unknown = pointBounds('unknown')
  assert.equal(overlaps(unknown, 8, 12), false)
  assert.equal(overlaps(unknown, undefined, undefined), true, 'no filter matches everything')
})
