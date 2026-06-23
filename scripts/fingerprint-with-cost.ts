import './env.mjs'
import { createClient } from '@supabase/supabase-js'
import { extractAntlerFingerprint } from '../lib/gemini/client'
import { isTrophyScore, DEFAULT_TROPHY_THRESHOLD_INCHES } from '../lib/scoring/gates'
import { computeBcScores, rawFromFingerprintMeasurements, scoreClassFor } from '../lib/scoring/boone-crockett'

/**
 * Fingerprint ONE detection (default: the "deer #1" trophy from the photo under
 * test) using the REAL extractAntlerFingerprint path, write it exactly like the
 * generate-fingerprint job, and REPORT THE COST (tokens + $ + backfill extrapolation).
 *
 * Usage: npx tsx scripts/fingerprint-with-cost.ts [detectionId]
 */

// Standard rates (USD per 1M tokens), by model. Thinking tokens bill at the OUTPUT
// rate. Token counts below are MEASURED and exact; only these $/M rates are an
// assumption — edit to your contracted pricing. (gemini-3 preview pricing may differ
// from the published 3-Flash standard rate.)
const RATES: Record<string, { in: number; out: number }> = {
  'gemini-3-flash-preview': { in: 1.5, out: 9.0 },
  'gemini-3-flash': { in: 1.5, out: 9.0 },
  'gemini-2.5-flash': { in: 0.3, out: 2.5 },
  'gemini-2.0-flash': { in: 0.1, out: 0.4 },
}
const FALLBACK_RATE = { in: 1.5, out: 9.0 }
const BACKFILL_N = 319 // legacy trophies currently without a fingerprint

const DETECTION_ID = process.argv[2] ?? 'e59c5531-3761-4e5c-9c0f-3337c4043b24'

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
)

async function main(): Promise<void> {
  const { data: det } = await s
    .from('detections')
    .select('id, crop_file_path, antler_fingerprint, images!inner(user_id)')
    .eq('id', DETECTION_ID)
    .single()
  if (!det?.crop_file_path) {
    console.log('Detection or crop not found:', DETECTION_ID)
    return
  }
  const userId = (det.images as { user_id: string }).user_id
  if (det.antler_fingerprint != null) {
    console.log('⚠ Detection already has a fingerprint — re-running to measure cost anyway.')
  }

  // Download the crop (full-res crops/ path).
  const { data: signed } = await s.storage.from('photos').createSignedUrl(det.crop_file_path, 3600)
  if (!signed?.signedUrl) {
    console.log('Failed to sign crop')
    return
  }
  const cropBuffer = Buffer.from(await (await fetch(signed.signedUrl)).arrayBuffer())
  console.log(`Crop: ${det.crop_file_path}  (${(cropBuffer.byteLength / 1024).toFixed(0)} KB)`)
  console.log('Calling extractAntlerFingerprint (Gemini Thinking)…\n')

  const t0 = Date.now()
  const { result: fingerprint, metrics } = await extractAntlerFingerprint(cropBuffer)
  const wallMs = Date.now() - t0

  // Mirror generate-fingerprint: deterministic B&C scores overwrite the model's.
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

  const { data: profile } = await s.from('profiles').select('trophy_threshold').eq('id', userId).single()
  const threshold = (profile as { trophy_threshold: number | null } | null)?.trophy_threshold ?? DEFAULT_TROPHY_THRESHOLD_INCHES
  const trophy = isTrophyScore(bc.grossScore, threshold)

  const { error: upErr } = await s
    .from('detections')
    .update({ antler_fingerprint: fingerprint as never, score_gross: Math.round(bc.grossScore), is_trophy: trophy } as never)
    .eq('id', DETECTION_ID)
  if (upErr) {
    console.log('✗ Write failed:', upErr.message)
    return
  }

  // ---- COST ----
  const rate = RATES[metrics.modelUsed] ?? FALLBACK_RATE
  const prompt = metrics.promptTokens
  const response = metrics.responseTokens
  const total = metrics.totalTokens
  // Prefer the explicitly-reported thoughts count (now captured); fall back to deriving.
  const thinking = metrics.thoughtsTokens ?? Math.max(0, total - prompt - response)
  const output = response + thinking // thoughts billed at output rate
  const inputCost = (prompt / 1e6) * rate.in
  const outputCost = (output / 1e6) * rate.out
  const cost = inputCost + outputCost

  console.log('✓ Fingerprint written.')
  console.log(`  gross B&C: ${bc.grossScore.toFixed(1)}″  ·  class: ${scoreClassFor(bc.grossScore)}  ·  is_trophy: ${trophy}`)
  console.log(`  model: ${metrics.modelUsed}  ·  wall: ${(wallMs / 1000).toFixed(1)}s  ·  retries: ${metrics.retryCount}  ·  rateLimited: ${metrics.wasRateLimited}\n`)
  console.log('── COST (one fingerprint) ──────────────────────────')
  console.log(`  input tokens   : ${prompt.toLocaleString().padStart(8)}  × $${rate.in}/M = $${inputCost.toFixed(5)}`)
  console.log(`  output tokens  : ${response.toLocaleString().padStart(8)}  (visible response)`)
  console.log(`  thinking tokens: ${thinking.toLocaleString().padStart(8)}  (${metrics.thoughtsTokens != null ? 'reported' : 'derived'})`)
  console.log(`  billed output  : ${output.toLocaleString().padStart(8)}  × $${rate.out}/M = $${outputCost.toFixed(5)}`)
  console.log(`  total tokens   : ${total.toLocaleString().padStart(8)}`)
  console.log(`  ─────────────────────────────────────`)
  console.log(`  COST / FINGERPRINT: $${cost.toFixed(5)}`)
  console.log(`  × ${BACKFILL_N} legacy trophies ≈ $${(cost * BACKFILL_N).toFixed(2)}  (full backfill estimate)`)
  console.log('────────────────────────────────────────────────────')
  console.log(`\n(Rates assumed for ${metrics.modelUsed}: input $${rate.in}/M, output $${rate.out}/M. Token counts are MEASURED; edit RATES at top of script if your contracted pricing differs.)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
