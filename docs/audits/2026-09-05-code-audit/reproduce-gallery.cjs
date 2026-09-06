// Diagnostic snapshot: success confirms the audited defects, not correct behavior.
// No network or database writes; run from any directory.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const projectRoot = path.resolve(__dirname, '../../..');
const projectRequire = createRequire(path.join(projectRoot, 'package.json'));
const ts = projectRequire('typescript');
const { createClient } = projectRequire('@supabase/supabase-js');
const requests = [];
const client = createClient('https://audit.invalid', 'audit-placeholder', {
  global: { fetch: async (input, init) => {
    const url = String(input);
    requests.push({ url, body: init?.body });
    const body = url.includes('/rpc/')
      ? [{ image_ids: ['first-photo'], total_count: 60 }]
      : [{ id: 'first-photo', imported_at: '2026-06-01T00:00:00Z' }];
    return new Response(JSON.stringify(body), { status: 200, headers: {
      'Content-Type': 'application/json', 'Content-Range': '0-0/60',
    } });
  } },
  auth: { persistSession: false, autoRefreshToken: false },
});
const exportsObject = {};
const code = ts.transpileModule(
  fs.readFileSync(path.join(projectRoot, 'lib/services/photos.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
vm.runInNewContext(code, {
  exports: exportsObject,
  require: name => name === 'react' ? { cache: fn => fn }
    : name === '@/lib/supabase/server' ? { createClient: async () => client }
    : projectRequire(name),
  console,
});
(async () => {
  for (const filters of [{ sortBy: 'captured_at' }, { sortBy: 'best_score', sex: 'buck' }]) {
    requests.length = 0;
    await exportsObject.getPhotos('user', { ...filters, limit: 51, offset: 0 });
    const first = requests.at(-1).url;
    requests.length = 0;
    await exportsObject.getPhotos('user', {
      ...filters, limit: 51, offset: 0, cursor: '2026-06-01T00:00:00Z::first-photo',
    });
    assert.equal(requests.at(-1).url, first);
    console.log('CONFIRMED identical first/next-page SQL request:', filters, decodeURIComponent(first));
  }
  requests.length = 0;
  await exportsObject.getPhotoIds('user', { sex: 'buck', areaName: 'North' });
  assert.equal(requests.length, 1);
  assert(requests[0].url.includes('/rpc/get_filtered_detection_images'));
  assert(!String(requests[0].body).includes('North'));
  console.log('CONFIRMED select-all buck+area ignores area:', requests);
})().catch(error => { console.error(error); process.exitCode = 1; });
