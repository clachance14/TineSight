import './env.mjs';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const today = new Date().toISOString().slice(0, 10);
const start = today + 'T00:00:00Z';
const MAX_MIN = Number(process.argv[2] || 12);

function snap() {
  return s
    .from('images')
    .select('detection_status, variant_status', { count: 'exact' })
    .gte('created_at', start);
}

let last = -1;
const t0 = Date.now();
while (Date.now() - t0 < 1000 * 60 * MAX_MIN) {
  const { data, count, error } = await snap();
  if (error) { console.error('err', error.message); break; }
  if (count !== last) {
    const det = {}, varr = {};
    for (const r of data || []) {
      det[r.detection_status] = (det[r.detection_status] || 0) + 1;
      varr[r.variant_status] = (varr[r.variant_status] || 0) + 1;
    }
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`${ts}  today=${count}  detect=${JSON.stringify(det)}  variant=${JSON.stringify(varr)}`);
    last = count;
  }
  await new Promise((r) => setTimeout(r, 8000));
}
console.log('watch window ended; total today=' + last);
