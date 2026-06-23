import './env.mjs'
import { createClient } from '@supabase/supabase-js'
import { extractAntlerFingerprint } from '../lib/gemini/client'
import { isTrophyScore, DEFAULT_TROPHY_THRESHOLD_INCHES } from '../lib/scoring/gates'
import { computeBcScores, rawFromFingerprintMeasurements, scoreClassFor } from '../lib/scoring/boone-crockett'

/**
 * Backfill antler fingerprints for legacy trophy detections that never went
 * through the score-gate cascade (ADR 0004/0005). Runs the REAL fingerprint path
 * directly (no Trigger.dev worker), idempotent + resumable: only touches trophies
 * with a NULL fingerprint, so re-running picks up whatever failed last time.
 *
 * Skips the reverse-reid auto-scan on purpose — this is a bulk backfill; the
 * operator drives re-ID via "Find sightings" instead of 319 auto-proposals.
 *
 * Run with the model you want, e.g.:
 *   GEMINI_MODEL=gemini-3.5-flash npx tsx scripts/backfill-fingerprints-direct.ts [userId]
 */

const USER = process.argv[2] ?? '0dd42cf4-9bb4-4716-9e8a-da56287041c5'
const CONCURRENCY = 6
const RATES: Record<string, { in: number; out: number }> = {
  'gemini-3.5-flash': { in: 1.5, out: 9.0 },
  'gemini-3-flash-preview': { in: 1.5, out: 9.0 },
  'gemini-2.5-flash': { in: 0.3, out: 2.5 },
}
const FALLBACK_RATE = { in: 1.5, out: 9.0 }

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

interface Row { id: string; crop_file_path: string | null }

let done = 0
let failed = 0
let totalCost = 0
let totalTokens = 0

async function fingerprintOne(det: Row, threshold: number, idx: number, n: number): Promise<void> {
  try {
    if (!det.crop_file_path) throw new Error('no crop')
    const { data: signed } = await s.storage.from('photos').createSignedUrl(det.crop_file_path, 3600)
    if (!signed?.signedUrl) throw new Error('sign failed')
    const buf = Buffer.from(await (await fetch(signed.signedUrl)).arrayBuffer())

    const { result: fingerprint, metrics } = await extractAntlerFingerprint(buf)

    const bc = computeBcScores(
      rawFromFingerprintMeasurements(fingerprint.measurements, fingerprint.scores?.abnormal_points_total ?? null)
    )
    fingerprint.scores = {
      ...fingerprint.scores,
      gross_score: bc.grossScore,
      gross_typical: bc.grossTypical,
      deductions: bc.asymmetryDeductions,
      net_score: bc.netTypical,
      net_typical: bc.netTypical,
      net_non_typical: bc.netNonTypical,
      abnormal_points_total: bc.abnormalPointsTotal,
      score_class: scoreClassFor(bc.grossScore),
      typical_status: fingerprint.scores?.typical_status ?? 'typical',
    }
    const trophy = isTrophyScore(bc.grossScore, threshold)

    const { error } = await s
      .from('detections')
      .update({ antler_fingerprint: fingerprint as never, score_gross: Math.round(bc.grossScore), is_trophy: trophy } as never)
      .eq('id', det.id)
    if (error) throw new Error(error.message)

    const rate = RATES[metrics.modelUsed] ?? FALLBACK_RATE
    const thinking = metrics.thoughtsTokens ?? Math.max(0, metrics.totalTokens - metrics.promptTokens - metrics.responseTokens)
    const cost = (metrics.promptTokens / 1e6) * rate.in + ((metrics.responseTokens + thinking) / 1e6) * rate.out
    totalCost += cost
    totalTokens += metrics.totalTokens
    done++
    console.log(`[${String(idx + 1).padStart(3)}/${n}] ✓ ${det.id.slice(0, 8)}  gross ${bc.grossScore.toFixed(0).padStart(3)}″  trophy=${trophy ? 'Y' : 'n'}  (${metrics.modelUsed}, running $${totalCost.toFixed(2)})`)
  } catch (e) {
    failed++
    console.log(`[${String(idx + 1).padStart(3)}/${n}] ✗ ${det.id.slice(0, 8)}  ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function main(): Promise<void> {
  const { data: prof } = await s.from('profiles').select('trophy_threshold').eq('id', USER).single()
  const threshold = (prof as { trophy_threshold: number | null } | null)?.trophy_threshold ?? DEFAULT_TROPHY_THRESHOLD_INCHES

  const { data, error } = await s
    .from('detections')
    .select('id, crop_file_path, images!inner(user_id)')
    .eq('size_class', 'trophy')
    .is('antler_fingerprint', null)
    .not('crop_file_path', 'is', null)
    .eq('images.user_id', USER)
  if (error) {
    console.error(error.message)
    process.exit(1)
  }
  const rows = (data ?? []) as unknown as Row[]
  const n = rows.length
  console.log(`Backfilling ${n} legacy trophy detections  (model ${process.env.GEMINI_MODEL ?? 'default'}, threshold ${threshold}″, concurrency ${CONCURRENCY})\n`)
  if (n === 0) {
    console.log('Nothing to do.')
    return
  }

  let cursor = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = cursor++
      if (i >= n) return
      await fingerprintOne(rows[i], threshold, i, n)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, n) }, () => worker()))

  console.log(`\n──────── BACKFILL COMPLETE ────────`)
  console.log(`  fingerprinted: ${done}`)
  console.log(`  failed:        ${failed}  (re-run to retry — idempotent)`)
  console.log(`  total tokens:  ${totalTokens.toLocaleString()}`)
  console.log(`  TOTAL COST:    $${totalCost.toFixed(2)}`)
  console.log(`───────────────────────────────────`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
