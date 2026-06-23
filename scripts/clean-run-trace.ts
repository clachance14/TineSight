/**
 * Clean, fully-logged run of the REAL TineSight photo pipeline against a single image.
 *
 * Uses the actual production functions (detectDeer / classifyDeerCrop /
 * estimateAntlerScore / extractAntlerFingerprint) and the actual gate logic
 * (lib/scoring/gates.ts), mirroring the orchestration in
 *   trigger/jobs/analyze-photo.ts  +  trigger/jobs/generate-fingerprint.ts
 * so we can trace every stage with full logging. Writes results to the DB
 * exactly like the jobs do.
 *
 * Run with: npx tsx scripts/clean-run-trace.ts <imageId>
 */
import './env.mjs';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import {
  detectDeer,
  classifyDeerCrop,
  estimateAntlerScore,
  extractAntlerFingerprint,
} from '@/lib/gemini/client';
import { cropToMemory, uploadCropBuffer } from '@/lib/image/crop';
import {
  passesCoarseCut,
  passesScoreEstimateBand,
  isTrophyScore,
  TROPHY_CONFIRM_BAND_INCHES,
  DEFAULT_TROPHY_THRESHOLD_INCHES,
} from '@/lib/scoring/gates';

const imageId = process.argv[2] || '21f1e9d4-e244-4e8b-a359-47377c598fc4';
const t0 = Date.now();
const log = (stage: string, msg: string, data?: unknown) => {
  const dt = ((Date.now() - t0) / 1000).toFixed(2).padStart(6);
  console.log(`[+${dt}s] [${stage}] ${msg}${data !== undefined ? '\n        ' + JSON.stringify(data) : ''}`);
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const computeBboxCoords = (b: [number, number, number, number]) => {
  const [ymin, xmin, ymax, xmax] = b;
  const scale = 10;
  return {
    bbox_x: Math.round(((xmin + xmax) / 2) * scale),
    bbox_y: Math.round(((ymin + ymax) / 2) * scale),
    bbox_width: Math.round((xmax - xmin) * scale),
    bbox_height: Math.round((ymax - ymin) * scale),
  };
};

async function main() {
console.log('\n================ CLEAN PIPELINE RUN ================');
log('INIT', `imageId=${imageId}`);

// ---- Fetch image + owner threshold -----------------------------------------
const { data: img, error: imgErr } = await supabase
  .from('images')
  .select('id, file_path, user_id, batch_id, variant_status')
  .eq('id', imageId)
  .single();
if (imgErr || !img) { log('FATAL', 'image fetch failed', imgErr?.message); process.exit(1); }
log('FETCH', 'image record', img);

const { data: prof } = await supabase
  .from('profiles').select('trophy_threshold').eq('id', img.user_id).single();
const trophyThreshold = prof?.trophy_threshold ?? DEFAULT_TROPHY_THRESHOLD_INCHES;
log('FETCH', `owner trophy_threshold = ${trophyThreshold}  (confirm band = ${TROPHY_CONFIRM_BAND_INCHES})`);

// ---- Clean slate: delete prior detections, reset image ----------------------
const { data: del } = await supabase.from('detections').delete().eq('image_id', imageId).select('id');
log('RESET', `deleted ${del?.length ?? 0} prior detection(s)`, del?.map((d) => d.id));
await supabase.from('images').update({
  detection_status: 'pending', has_deer: null, deer_count: null,
  analyzed_at: null, classification: null, confidence: null, analysis_notes: null,
}).eq('id', imageId);
log('RESET', 'image reset to detection_status=pending');

// ---- Download original ------------------------------------------------------
let imageBuffer: Buffer | null = null;
let mimeType = 'image/jpeg';
for (let attempt = 1; attempt <= 4; attempt++) {
  const { data: signed, error: signErr } = await supabase.storage
    .from('photos').createSignedUrl(img.file_path, 3600);
  if (signErr || !signed) { log('DOWNLOAD', `sign attempt ${attempt} failed`, signErr?.message); continue; }
  const resp = await fetch(signed.signedUrl);
  const buf = Buffer.from(await resp.arrayBuffer());
  const ct = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0];
  if (resp.ok && buf.byteLength > 50_000 && ct.startsWith('image/')) {
    imageBuffer = buf; mimeType = ct; break;
  }
  log('DOWNLOAD', `attempt ${attempt} bad response (status=${resp.status}, ${buf.byteLength}B, ${ct}) — retrying`);
  await new Promise((r) => setTimeout(r, 1500));
}
if (!imageBuffer) { log('FATAL', 'could not download a valid image after retries'); process.exit(1); }
const imageBase64 = imageBuffer.toString('base64');
log('DOWNLOAD', `original fetched: ${(imageBuffer.byteLength / 1024).toFixed(0)} KB, mime=${mimeType}`);

// ============================================================================
// STAGE 1 — DETECTION (Gemini)
// ============================================================================
log('STAGE1', 'calling detectDeer() ...');
const { result: detection, metrics: detMetrics } = await detectDeer(imageBase64, mimeType);
log('STAGE1', 'detection complete', {
  model: detMetrics.modelUsed, deer_present: detection.deer_present,
  count: detection.detections.length, tokens: detMetrics.totalTokens,
  ms: detMetrics.durationMs, quality: (detection as any).image_quality_score,
});
detection.detections.forEach((d: any, i: number) =>
  log('STAGE1', `  raw det #${i}`, { class: d.detection_class, conf: d.confidence, has_antlers: d.has_antlers, box_2d: d.box_2d }));

const MIN_CONFIDENCE = 70;
const filtered = detection.detections.filter((d: any) => d.confidence >= MIN_CONFIDENCE);
log('STAGE1', `confidence filter >=${MIN_CONFIDENCE}: ${detection.detections.length} -> ${filtered.length}`);

const deer = filtered.filter((d: any) => d.detection_class === 'deer');
const bucks = deer.filter((d: any) => d.has_antlers);
const does = deer.filter((d: any) => !d.has_antlers);
const nonDeer = filtered.filter((d: any) => d.detection_class !== 'deer');
log('STAGE1', 'split', { deer: deer.length, bucks: bucks.length, does: does.length, nonDeer: nonDeer.length });

// ============================================================================
// STAGE 2 — per-detection CLASSIFY + COARSE CUT + SCORE ESTIMATE
// ============================================================================
const records: any[] = [];

for (let i = 0; i < bucks.length; i++) {
  const d = bucks[i];
  const detectionId = crypto.randomUUID();
  log('STAGE2', `buck ${i + 1}/${bucks.length} detectionId=${detectionId} conf=${d.confidence}`);

  const { buffer: cropBuffer, base64: cropBase64 } = await cropToMemory(imageBuffer, d.box_2d);
  const [{ result: cls, metrics: clsMetrics }, cropPath] = await Promise.all([
    classifyDeerCrop(cropBase64, 'image/jpeg'),
    uploadCropBuffer(supabase, cropBuffer, detectionId),
  ]);
  log('STAGE2', '  classify', {
    model: clsMetrics.modelUsed, sex: cls.sex, size_class: cls.size_class,
    points: cls.estimated_point_range, age: cls.age_class, tokens: clsMetrics.totalTokens,
  });
  log('STAGE2', `  crop uploaded -> ${cropPath}`);

  // Trophy gate STEP 1 — coarse cut
  const coarse = passesCoarseCut(cls.size_class);
  log('GATE', `  STEP1 coarse cut (size_class='${cls.size_class}', drops spikes): ${coarse ? 'PASS' : 'STOP'}`);

  // Trophy gate STEP 2 — mid-cost score estimate (only if coarse passes)
  let scoreEstimate: { gross_score_estimate: number; confidence: number } | null = null;
  if (coarse) {
    try {
      const { result: est, metrics: estMetrics } = await estimateAntlerScore(cropBase64, 'image/jpeg');
      scoreEstimate = est;
      log('GATE', '  STEP2 score estimate', {
        gross_score_estimate: est.gross_score_estimate, confidence: est.confidence,
        model: estMetrics.modelUsed, tokens: estMetrics.totalTokens,
      });
    } catch (e) {
      log('GATE', '  STEP2 score estimate FAILED — buck will not advance to fingerprint', String(e));
    }
  }

  const coords = computeBboxCoords(d.box_2d);
  records.push({
    id: detectionId, image_id: imageId, ...coords, crop_file_path: cropPath, head_bbox: null,
    species: 'whitetail', sex: cls.sex, size_class: cls.size_class,
    estimated_point_range: cls.estimated_point_range, antler_description: cls.antler_description || null,
    age_class: cls.age_class, distinguishing_features: null, gemini_confidence: d.confidence,
    deer_id: null, class: 'deer', confidence: d.confidence / 100,
    score_estimate: scoreEstimate ? Math.round(scoreEstimate.gross_score_estimate) : null,
    score_estimate_confidence: scoreEstimate ? Math.round(scoreEstimate.confidence) : null,
  });
}

// does + non-deer: crop-only (mirrors job) — handle generically
for (const d of [...does, ...nonDeer]) {
  const detectionId = crypto.randomUUID();
  const { buffer } = await cropToMemory(imageBuffer, d.box_2d);
  const cropPath = await uploadCropBuffer(supabase, buffer, detectionId);
  const coords = computeBboxCoords(d.box_2d);
  const isDoe = d.detection_class === 'deer';
  log('STAGE2', `  ${isDoe ? 'doe' : d.detection_class} crop-only -> ${cropPath}`);
  records.push({
    id: detectionId, image_id: imageId, ...coords, crop_file_path: cropPath, head_bbox: null,
    species: isDoe ? 'whitetail' : null, sex: isDoe ? 'doe' : null, size_class: null,
    estimated_point_range: null, antler_description: null, age_class: isDoe ? 'unknown' : null,
    distinguishing_features: null, gemini_confidence: d.confidence, deer_id: null,
    detection_class: isDoe ? undefined : d.detection_class,
    class: isDoe ? 'deer' : d.detection_class, confidence: d.confidence / 100,
  });
}

// ---- Insert detections ------------------------------------------------------
const { error: insErr } = await supabase.from('detections').insert(records);
if (insErr) { log('FATAL', 'detection insert failed', insErr.message); process.exit(1); }
log('INSERT', `inserted ${records.length} detection(s)`, records.map((r) => ({ id: r.id, class: r.class, size_class: r.size_class, score_estimate: r.score_estimate })));

// ============================================================================
// STAGE 3 — BAND GATE + FINGERPRINT + AUTHORITATIVE TROPHY
// ============================================================================
const { data: inserted } = await supabase
  .from('detections').select('id, score_estimate')
  .eq('image_id', imageId).eq('class', 'deer').not('score_estimate', 'is', null);

const band = (inserted ?? []).filter((d) => passesScoreEstimateBand(d.score_estimate, trophyThreshold));
log('GATE', `STEP3 band gate (estimate >= ${trophyThreshold} - ${TROPHY_CONFIRM_BAND_INCHES} = ${trophyThreshold - TROPHY_CONFIRM_BAND_INCHES}): ${band.length}/${inserted?.length ?? 0} advance to fingerprint`,
  (inserted ?? []).map((d) => ({ id: d.id, estimate: d.score_estimate, advances: passesScoreEstimateBand(d.score_estimate, trophyThreshold) })));

for (const d of band) {
  log('STAGE3', `fingerprint for ${d.id} (Gemini Thinking) ...`);
  const { data: det } = await supabase.from('detections').select('crop_file_path').eq('id', d.id).single();
  const { data: cs } = await supabase.storage.from('photos').createSignedUrl(det!.crop_file_path, 3600);
  const cropResp = await fetch(cs!.signedUrl);
  const cropBuffer = Buffer.from(await cropResp.arrayBuffer());
  const { result: fp, metrics: fpMetrics } = await extractAntlerFingerprint(cropBuffer);
  log('STAGE3', '  fingerprint extracted', {
    model: fpMetrics.modelUsed, score_class: fp.scores.score_class,
    gross_score: fp.scores.gross_score, net_score: fp.scores.net_score,
    total_points: fp.measurements.total_points, confidence: fp.confidence.overall,
    tokens: fpMetrics.totalTokens, ms: fpMetrics.durationMs,
  });

  const grossScore = fp.scores.gross_score;
  const trophy = isTrophyScore(grossScore, trophyThreshold);
  log('GATE', `  FINAL authoritative trophy: gross ${grossScore} >= threshold ${trophyThreshold} ? -> is_trophy=${trophy}`);

  const { error: fpUpdateErr } = await supabase.from('detections').update({
    antler_fingerprint: fp as any, score_gross: Math.round(grossScore), is_trophy: trophy,
  }).eq('id', d.id);
  if (fpUpdateErr) log('STAGE3', '  !! fingerprint save FAILED', fpUpdateErr.message);
  else log('STAGE3', `  saved antler_fingerprint + score_gross=${Math.round(grossScore)} + is_trophy=${trophy}`);
}

// ---- Finalize images row (mirrors job Step 8) ------------------------------
await supabase.from('images').update({
  detection_status: 'completed',
  has_deer: deer.length > 0, deer_count: deer.length,
  analysis_notes: (detection as any).analysis_notes ?? null,
  analyzed_at: new Date().toISOString(),
  classification: deer.length > 0 ? 'deer' : null,
  confidence: records.length ? Math.max(...records.map((r) => r.confidence)) : null,
}).eq('id', imageId);
log('FINALIZE', 'image row updated: detection_status=completed');

// ---- Final state dump -------------------------------------------------------
const { data: finalDets } = await supabase.from('detections').select('*').eq('image_id', imageId);
console.log('\n================ FINAL DETECTION STATE ================');
console.log(JSON.stringify(finalDets, null, 2));
log('DONE', `total elapsed`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('TRACE FAILED:', e); process.exit(1); });
