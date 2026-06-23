import './env.mjs';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Window: images created in the last N minutes (default 15)
const WINDOW_MIN = Number(process.argv[2] || 15);
const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();

const { data: images, error } = await supabase
  .from('images')
  .select(
    'id, original_filename, created_at, detection_status, variant_status, ' +
      'has_deer, deer_count, best_score, best_score_is_estimate, ' +
      'error_message, variant_error, is_cancelled, analyzed_at'
  )
  .gte('created_at', since)
  .order('created_at', { ascending: true });

if (error) {
  console.error('Query error:', error);
  process.exit(1);
}

if (!images?.length) {
  console.log(`No images created in the last ${WINDOW_MIN} min.`);
  process.exit(0);
}

// Pull detection + fingerprint info for these images in one go
const ids = images.map((i) => i.id);
const { data: dets } = await supabase
  .from('detections')
  .select('id, image_id, antler_fingerprint, size_class')
  .in('image_id', ids);

const detByImage = new Map();
for (const d of dets || []) {
  const arr = detByImage.get(d.image_id) || [];
  arr.push(d);
  detByImage.set(d.image_id, arr);
}

const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
console.log(`\n=== ${images.length} image(s) in last ${WINDOW_MIN} min — ${new Date().toLocaleTimeString()} ===`);
console.log(
  pad('filename', 26) + pad('variant', 10) + pad('detect', 12) + pad('dets', 6) + pad('fp', 5) + 'score'
);
console.log('-'.repeat(72));

let counts = { pending: 0, processing: 0, completed: 0, failed: 0, other: 0 };
for (const img of images) {
  const ds = detByImage.get(img.id) || [];
  const fpCount = ds.filter((d) => d.antler_fingerprint).length;
  const trophy = ds.filter((d) => d.size_class === 'trophy').length;
  const score = img.best_score
    ? `${img.best_score}${img.best_score_is_estimate ? '~' : ''}`
    : '';
  const st = img.detection_status;
  if (st in counts) counts[st]++; else counts.other++;
  const err = img.error_message || img.variant_error;
  console.log(
    pad(img.original_filename || img.id.slice(0, 8), 26) +
      pad(img.variant_status, 10) +
      pad(img.is_cancelled ? 'CANCELLED' : st, 12) +
      pad(`${ds.length}${trophy ? `(${trophy}T)` : ''}`, 6) +
      pad(`${fpCount}/${ds.length}`, 5) +
      (score || '') +
      (err ? `  ⚠ ${err.slice(0, 40)}` : '')
  );
}
console.log('-'.repeat(72));
console.log(
  `detection: pending ${counts.pending} | processing ${counts.processing} | completed ${counts.completed} | failed ${counts.failed}` +
    (counts.other ? ` | other ${counts.other}` : '')
);
