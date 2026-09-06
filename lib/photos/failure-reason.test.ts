import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { photoFailureReason } from './failure-reason.ts'
const require = createRequire(import.meta.url)
const ts = require('typescript')

test('terminal reason distinguishes retry exhaustion, timeouts, unreadable source and provider capacity without copying logs', () => {
  assert.match(photoFailureReason('preview', 'failed', 'Preview generation stopped after 3 interrupted attempts')!, /Automatic retries have stopped/)
  assert.match(photoFailureReason('analysis', 'failed', 'Photo analysis stopped after 3 interrupted attempts')!, /Photo analysis stopped/)
  for (const [raw, expected] of [
    ['ETIMEDOUT timed out https://storage/private?token=SECRET', /took too long/],
    ['decode failed at /private/owner/file.jpg', /could not be read/],
    ['404 not found owner-secret.jpg', /original upload/],
    ['429 quota api-key=SECRET', /unavailable or busy/],
    ['SECRET arbitrary provider response', /details have been recorded/],
  ] as const) {
    const reason = photoFailureReason('analysis', 'failed', raw)
    assert.match(reason!, expected)
    assert(!reason!.includes('SECRET') && !reason!.includes('/private/') && !reason!.includes('owner-secret'))
  }
  assert.equal(photoFailureReason('preview', 'processing', 'Old secret failure'), null)
  assert.equal(photoFailureReason('analysis', 'completed', 'Old secret failure'), null)
})

test('actual photo-view DTO exposes only mapped terminal reasons while retaining ready preview', async () => {
  const photo = { id: 'photo', file_path: 'owner/original.jpg', medium_path: 'medium/photo.webp', detections: [], detection_status: 'failed', variant_status: 'failed', error_message: 'Photo analysis stopped after 3 interrupted attempts', variant_error: 'decode error SECRET /private/file.jpg' }
  const exports: Record<string, any> = {}
  const compiled = ts.transpileModule(readFileSync(new URL('../services/photo-view.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(compiled, { exports, require: (name: string) => name === 'server-only' ? {} : name.includes('failure-reason') ? { photoFailureReason } : {
    getPhoto: async () => ({ data: photo, error: null }), getAdjacentPhotos: async () => ({ prevId: null, nextId: null }), getSignedViewUrl: async (path: string) => ({ data: `https://signed.invalid/${path}`, error: null }),
  } })
  const result = await exports.loadPhotoView('owner', 'photo')
  assert.match(result.analysisFailureReason, /Automatic retries have stopped/)
  assert.match(result.previewFailureReason, /could not be read/)
  assert.equal(result.imageUrl, 'https://signed.invalid/medium/photo.webp')
  assert(!JSON.stringify(result).includes('SECRET'))
  photo.detection_status = 'completed'; photo.variant_status = 'ready'
  const recovered = await exports.loadPhotoView('owner', 'photo')
  assert.equal(recovered.analysisFailureReason, null)
  assert.equal(recovered.previewFailureReason, null)
})
