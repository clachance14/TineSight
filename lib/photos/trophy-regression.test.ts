import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
const require = createRequire(import.meta.url)
const ts = require('typescript')
const { createClient } = require('@supabase/supabase-js')
test('fingerprint Review uses confirmed numeric trophy instead of qualitative size impression', async () => {
  const rows = [
    { id: 'numeric', size_class: 'standard', is_trophy: true, images: { captured_at: null } },
    { id: 'impression', size_class: 'trophy', is_trophy: false, images: { captured_at: null } },
  ]
  const client = createClient('https://example.supabase.co', 'test-key', { global: { fetch: async (url: string) => {
    const params = new URL(String(url)).searchParams
    const result = rows.filter(row => params.get('is_trophy') === 'eq.true' ? row.is_trophy : row.size_class === 'trophy')
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } } })
  const exports: Record<string, any> = {}
  const compiled = ts.transpileModule(readFileSync(new URL('../services/fingerprint.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  vm.runInNewContext(compiled, { exports, require: () => ({ createClient: async () => client }) })
  const result = await exports.getTrophyDetections('owner')
  assert.deepEqual(Array.from(result.data, (row: any) => row.id), ['numeric'])
})

test('unclustered Review filters memberships before its 50-photo page limit', async () => {
  const rows = Array.from({ length: 100 }, (_, n) => ({ id: `d-${n}`, crop_file_path: null, images: { captured_at: null }, clustered: n < 50 }))
  const client = createClient('https://example.supabase.co', 'test-key', { global: { fetch: async (url: string) => {
    const parsed = new URL(String(url))
    let result: unknown[]
    if (parsed.pathname.endsWith('/trophy_cluster_members')) result = rows.filter(row => row.clustered).map(row => ({ detection_id: row.id }))
    else result = rows.filter(row => parsed.searchParams.get('trophy_cluster_members') === 'is.null' ? !row.clustered : true).slice(0, 50)
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } } })
  const exports: Record<string, any> = {}
  const compiled = ts.transpileModule(readFileSync(new URL('../services/trophy.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  vm.runInNewContext(compiled, { exports, require: () => ({ createClient: async () => client }) })
  const result = await exports.getUnclusteredTrophies('owner')
  assert.equal(result.data.length, 50)
  assert.equal(result.data[0].id, 'd-50')
})
