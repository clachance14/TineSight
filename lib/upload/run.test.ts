import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'

const nodeRequire=createRequire(import.meta.url)
function loadModules() {
  const cache=new Map<string,Record<string,any>>()
  const load=(file:string):Record<string,any>=>{
    const absolute=path.resolve(file)
    if(cache.has(absolute))return cache.get(absolute)!
    const exports:Record<string,any>={};cache.set(absolute,exports)
    const source=fs.readFileSync(absolute,'utf8')
    const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
    new Function('exports','require',compiled)(exports,(name:string)=>name.startsWith('.')?load(path.resolve(path.dirname(absolute),`${name}.ts`)):nodeRequire(name))
    return exports
  }
  return {run:load('lib/upload/run.ts'),store:load('lib/stores/upload.ts')['useUploadStore'],runs:load('lib/upload/active-run.ts')}
}

interface ApiOptions { sessionOk?: boolean; initFail?: (batchIndex: number) => string | null; closeStatus?: number }
function fakeApi(t: any, options: ApiOptions = {}) {
  const calls: Array<{ method: string; url: string; body?: any }> = []
  let batches = 0
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit = {}) => {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ method: init.method ?? 'GET', url, body })
    if (url === '/api/upload-sessions') return options.sessionOk === false ? new Response('down', { status: 500 }) : Response.json({ sessionId: 'session-1' })
    if (url === '/api/photos/upload') {
      const index = batches++; const failure = options.initFail?.(index) ?? null
      if (failure !== null) return Response.json({ error: failure }, { status: 400 })
      return Response.json({ batchId: `batch-${index}`, uploads: body.files.map((f: any, n: number) => ({ fileId: f.id, imageId: `image-${index}-${n}`, uploadUrl: `url-${index}-${n}` })) })
    }
    if (url === '/api/photos/upload/complete') return Response.json({ status: 'processing' })
    if (url === '/api/upload-sessions/session-1/complete') return options.closeStatus ? new Response('nope', { status: options.closeStatus }) : Response.json({ success: true })
    if (url.startsWith('/api/photos/upload-session/')) return Response.json({ ok: true })
    throw new Error(`unexpected ${init.method} ${url}`)
  })
  return calls
}
function queue(store: any, specs: Array<Record<string, unknown>>) {
  store.getState().reset()
  store.getState().addFiles(specs.map((spec, i) => ({ file: new File([`f${i}`], `photo-${i}.jpg`, { type: 'image/jpeg' }), contentSha256: `hash-${i}`, ...spec })))
  return store.getState().uploadQueue.filter((f: any) => f.status === 'pending')
}
const okTransfer = async () => ({ success: true })

test('a run creates one session, initializes a batch per chunk, hands off, closes, and reports counts', async t => {
  const { run, store } = loadModules(); const calls = fakeApi(t)
  const files = queue(store, [{}, {}, {}])
  const throttle = { log: [] as string[], startSession() { this.log.push('start') }, stopSession() { this.log.push('stop') }, shouldProceed() { this.log.push('proceed'); return { allowed: false, waitMs: 5 } }, async waitForRecovery() { this.log.push('wait') } }
  const sessions: string[] = []; const chunks: string[] = []
  const result = await run.runUploadSession({ files, transfer: okTransfer, throttle, chunkSize: 2, parallelChunks: 1, onSession: (id: string) => sessions.push(id), onChunkStart: (i: number) => chunks.push(`start:${i}`), onChunkComplete: (i: number) => chunks.push(`done:${i}`) })
  assert.deepEqual(result, { status: 'completed', sessionId: 'session-1', completed: 3, failed: 0, handedOff: true })
  assert.deepEqual(sessions, ['session-1']); assert.deepEqual(chunks, ['start:0', 'done:0', 'start:1', 'done:1'])
  assert.deepEqual(throttle.log, ['proceed', 'wait', 'start', 'stop'])
  // The next round's batch is initialized while the current round transfers.
  assert.deepEqual(calls.map(c => `${c.method} ${c.url}`), ['POST /api/upload-sessions', 'POST /api/photos/upload', 'POST /api/photos/upload', 'POST /api/photos/upload/complete', 'POST /api/photos/upload/complete', 'POST /api/upload-sessions/session-1/complete'])
  assert.equal(calls[1].body.uploadSessionId, 'session-1'); assert.deepEqual(calls.filter(c => c.url === '/api/photos/upload/complete')[0].body.uploadedImageIds, ['image-0-0', 'image-0-1'])
  assert.ok(store.getState().uploadQueue.every((f: any) => f.status === 'completed')); assert.equal(store.getState().isPreparing, false)
})

test('chunks never cross group keys, each batch carries its location once, and each file carries its own source fields', async t => {
  const { run, store } = loadModules(); const calls = fakeApi(t)
  const files = queue(store, [{ locationId: 'north', cameraId: 'cam-1', sourceFolder: 'North/SD1', capturedAt: new Date('2026-01-02T03:04:05Z'), make: 'Bushnell', model: 'Core' }, { locationId: 'south', sourceFolder: 'South' }, { locationId: 'north', cameraId: 'cam-1', sourceFolder: 'North/SD1' }])
  const result = await run.runUploadSession({ files, transfer: okTransfer, chunkSize: 25, groupKey: (f: any) => f.locationId ?? '', location: (chunk: any[]) => chunk[0].locationId === 'north' ? { locationId: 'north', lat: 44, lng: -89, areaName: 'North Pasture', directionCompass: 90 } : null })
  assert.equal(result.status, 'completed')
  const inits = calls.filter(c => c.url === '/api/photos/upload').map(c => c.body)
  assert.equal(inits.length, 2)
  const north = inits.find(b => b.files.length === 2), south = inits.find(b => b.files.length === 1)
  assert.deepEqual({ locationId: north.locationId, locationLat: north.locationLat, locationLng: north.locationLng, areaName: north.areaName, directionCompass: north.directionCompass, directionNotes: north.directionNotes }, { locationId: 'north', locationLat: 44, locationLng: -89, areaName: 'North Pasture', directionCompass: 90, directionNotes: undefined })
  assert.equal(south.locationId, undefined); assert.equal(south.areaName, undefined)
  const file = north.files[0]
  assert.equal(file.cameraId, 'cam-1'); assert.equal(file.contentType, 'image/jpeg'); assert.equal(file.size, 2); assert.equal(file.capturedAt, '2026-01-02T03:04:05.000Z'); assert.equal(file.make, 'Bushnell'); assert.equal(file.exifData.source_folder, 'North/SD1'); assert.equal(file.contentSha256, 'hash-0')
  assert.equal(south.files[0].cameraId, undefined)
})

test('when every batch fails to initialize the session is closed as failed and the run reports the server reason', async t => {
  const { run, store } = loadModules(); const calls = fakeApi(t, { initFail: () => 'Unsupported content type' })
  const files = queue(store, [{}, {}]); const failures: string[] = []
  const result = await run.runUploadSession({ files, transfer: okTransfer, chunkSize: 1, onBatchInitFailed: (chunk: any[], message: string) => failures.push(`${chunk.length}:${message}`) })
  assert.deepEqual(result, { status: 'failed', reason: 'initialization', sessionId: 'session-1', message: 'Upload could not start: Unsupported content type', completed: 0, failed: 2, handedOff: false })
  assert.deepEqual(failures, ['1:Unsupported content type', '1:Unsupported content type'])
  assert.ok(store.getState().uploadQueue.every((f: any) => f.status === 'failed' && f.error === 'Unsupported content type'))
  assert.ok(calls.some(c => c.method === 'PATCH' && c.url === '/api/photos/upload-session/session-1'), 'session marked failed')
  assert.ok(!calls.some(c => c.url === '/api/upload-sessions/session-1/complete'), 'no finalize after a failed start')
})

test('a lost session close is a finalization failure that preserves every completed photo', async t => {
  const { run, store } = loadModules(); fakeApi(t, { closeStatus: 400 })
  const files = queue(store, [{}, {}])
  const result = await run.runUploadSession({ files, transfer: okTransfer })
  assert.equal(result.status, 'failed'); assert.equal(result.reason, 'finalization'); assert.equal(result.sessionId, 'session-1')
  assert.match(result.message, /could not be finished/i)
  assert.equal(result.completed, 2); assert.equal(result.failed, 0); assert.equal(result.handedOff, true, 'photos reached processing; galleries should refresh')
  assert.ok(store.getState().uploadQueue.every((f: any) => f.status === 'completed'))
})

test('user cancellation mid-transfer settles the run cancelled with no handoff and nothing left uploading', async t => {
  const { run, store, runs } = loadModules(); const calls = fakeApi(t)
  const files = queue(store, [{}, {}])
  const transfer = (_file: any, _url: string, signal: AbortSignal) => new Promise<{ success: boolean; error?: string }>(resolve => { signal.addEventListener('abort', () => resolve({ success: false, error: 'Upload cancelled' }), { once: true }) })
  const pending = run.runUploadSession({ files, transfer, runId: 'run-cancel', chunkSize: 25 })
  await new Promise(r => setTimeout(r, 20))
  runs.cancelUploadRun('run-cancel')
  const result = await pending
  assert.deepEqual(result, { status: 'cancelled', byUser: true, sessionId: 'session-1', completed: 0, failed: 0, handedOff: false })
  assert.ok(!calls.some(c => c.url === '/api/photos/upload/complete'), 'no processing handoff after cancel')
  assert.ok(!calls.some(c => c.url === '/api/upload-sessions/session-1/complete'), 'no finalize after cancel')
  assert.ok(!store.getState().uploadQueue.some((f: any) => f.status === 'uploading' || f.status === 'pending'))
  assert.equal(store.getState().isPreparing, false)
})

test('a generic failure marks the run files failed with its message and settles as an error', async t => {
  const { run, store } = loadModules(); fakeApi(t)
  const files = queue(store, [{}, {}])
  const result = await run.runUploadSession({ files, transfer: okTransfer, groupKey: () => { throw new Error('grouping exploded') } })
  assert.equal(result.status, 'failed'); assert.equal(result.reason, 'error'); assert.equal(result.message, 'grouping exploded')
  assert.ok(store.getState().uploadQueue.every((f: any) => f.status === 'failed' && f.error === 'grouping exploded'))
  assert.equal(store.getState().isPreparing, false)
})

test('observer exceptions never fail the run and a missing session never blocks it', async t => {
  const { run, store } = loadModules(); const calls = fakeApi(t, { sessionOk: false })
  const files = queue(store, [{}])
  const result = await run.runUploadSession({ files, transfer: okTransfer, onChunkStart: () => { throw new Error('observer bug') }, onSession: () => { throw new Error('never called') } })
  assert.deepEqual(result, { status: 'completed', sessionId: null, completed: 1, failed: 0, handedOff: true })
  assert.equal(calls.find(c => c.url === '/api/photos/upload')?.body.uploadSessionId, null)
  assert.ok(!calls.some(c => c.url.includes('/complete') && c.url.startsWith('/api/upload-sessions')), 'no session finalize without a session')
})

test('serializeUploadFile mirrors the upload API contract and omits source fields a file does not carry', () => {
  const { run } = loadModules()
  const plain = run.serializeUploadFile({ id: 'f1', filename: 'IMG_0001.JPG', file: new File(['abc'], 'IMG_0001.JPG', { type: '' }), contentSha256: 'h', make: null, capturedAt: null })
  assert.deepEqual(plain, { id: 'f1', filename: 'IMG_0001.JPG', contentType: 'image/jpeg', size: 3, contentSha256: 'h' })
  const sourced = run.serializeUploadFile({ id: 'f2', filename: 'a.jpg', file: new File(['ab'], 'a.jpg', { type: 'image/jpeg' }), cameraId: 'cam', sourceFolder: 'Creek', exifData: { iso: 100 } })
  assert.equal(sourced.cameraId, 'cam'); assert.deepEqual(sourced.exifData, { iso: 100, source_folder: 'Creek' })
})
