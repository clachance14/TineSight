import './env.mjs';
import { createClient } from '@supabase/supabase-js';
import { tasks } from '@trigger.dev/sdk/v3';

// Re-enqueues analyze-photo for TODAY's pending images using whatever
// TRIGGER_SECRET_KEY is in .env.local. Intended for the dev loop:
//   1. set TRIGGER_SECRET_KEY=tr_dev_... in .env.local
//   2. npx trigger.dev@latest dev   (local worker on the dev env)
//   3. node scripts/retrigger-today.mjs
//
// Safety: refuses to run against a prod key unless ALLOW_PROD=1 is set, so we
// don't dump runs into a prod queue with no worker.
const key = process.env.TRIGGER_SECRET_KEY || '';
const isProd = key.startsWith('tr_prod_');
if (isProd && process.env.ALLOW_PROD !== '1') {
  console.error(
    `Refusing to run: TRIGGER_SECRET_KEY is a PROD key (${key.slice(0, 8)}...).\n` +
      `Use a tr_dev_ key for the local dev worker, or set ALLOW_PROD=1 to override.`
  );
  process.exit(1);
}
console.log(`Using ${key.slice(0, 8)}... (${isProd ? 'PROD' : 'dev'})`);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const start = new Date().toISOString().slice(0, 10) + 'T00:00:00Z';
const { data: imgs, error } = await supabase
  .from('images')
  .select('id, batch_id')
  .eq('detection_status', 'pending')
  .gte('created_at', start)
  .order('created_at');

if (error) {
  console.error('Query error:', error.message);
  process.exit(1);
}
console.log(`Found ${imgs?.length ?? 0} pending images created today.`);
if (!imgs?.length) process.exit(0);

let ok = 0,
  fail = 0;
for (const img of imgs) {
  try {
    await tasks.trigger('analyze-photo', { imageId: img.id, batchId: img.batch_id });
    ok++;
    if (ok % 25 === 0) console.log(`  triggered ${ok}/${imgs.length}`);
  } catch (err) {
    fail++;
    console.error('  fail', img.id, err.message);
  }
}
console.log(`Done. triggered=${ok} failed=${fail}`);
