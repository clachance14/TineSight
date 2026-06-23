import './env.mjs';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const start = new Date().toISOString().slice(0, 10) + 'T00:00:00Z';
const MAX_MIN = Number(process.argv[2] || 45);

const t0 = Date.now();
let lastDone = -1;
while (Date.now() - t0 < 1000 * 60 * MAX_MIN) {
  const { data, error } = await s
    .from('images')
    .select('detection_status, variant_status, has_deer, error_message')
    .gte('created_at', start);
  if (error) { console.error('err', error.message); break; }
  const det = {}, varr = {};
  let deer = 0, err = 0, thumb = 0;
  for (const r of data) {
    det[r.detection_status] = (det[r.detection_status] || 0) + 1;
    varr[r.variant_status] = (varr[r.variant_status] || 0) + 1;
    if (r.has_deer) deer++;
    if (r.error_message) err++;
    if (r.variant_status === 'ready') thumb++;
  }
  const done = (det.completed || 0) + (det.failed || 0);
  if (done !== lastDone) {
    const ts = new Date().toISOString().slice(11, 19);
    console.log(
      `${ts}  detect[done ${done}/${data.length} | proc ${det.processing || 0} | pend ${det.pending || 0} | failed ${det.failed || 0}]  thumbs ${thumb}  deer ${deer}  errs ${err}`
    );
    lastDone = done;
  }
  const remaining = (det.pending || 0) + (det.processing || 0);
  if (remaining === 0 && data.length > 0) {
    console.log(`✅ ALL DONE — ${data.length} images. completed=${det.completed || 0} failed=${det.failed || 0} deer=${deer} errors=${err}`);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 12000));
}
console.log('watch window ended (still processing)');
