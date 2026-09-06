import test from 'node:test'
import assert from 'node:assert/strict'
import { acknowledgedFetch, createUploadLimiter, transferBatch } from './transfer.ts'
import { createUploadPhotoNavigator } from './photo-navigation.ts'

test('upload start opens its session once without subsequent redirects', () => {
  const navigations: string[] = []
  const showPhotos = createUploadPhotoNavigator(href => navigations.push(href))
  showPhotos('session-30')
  assert.deepEqual(navigations, ['/photos?uploadSessionId=session-30&triageView=all'])
  showPhotos('session-30')
  assert.equal(navigations.length, 1)
  showPhotos('next-session')
  assert.equal(navigations.length, 2)
})

function files(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `file-${index}`, filename: `photo-${index}.jpg`, status: 'pending' as const, progress: 0, file: new File(['photo'], `photo-${index}.jpg`, { type: 'image/jpeg' }) }))
}

test('concurrent transport chunks share a five-file cap across 1000 photos', async () => {
  const limit = createUploadLimiter(5)
  let active = 0, peak = 0, finished = 0
  await Promise.all(Array.from({length: 1000}, () => limit(async () => {
    active++; peak = Math.max(peak, active)
    await new Promise(resolve => setImmediate(resolve))
    active--; finished++
  })))
  assert.equal(peak, 5)
  assert.equal(finished, 1000)
})

test('handoff follows transfer retry, sends only successful IDs, and success follows acknowledgment', async t => {
  const inputs = files(2), calls: string[] = [], outcomes: string[] = []
  let attempts = 0
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    if (url.includes('refresh-url')) return Response.json({ uploadUrl: 'fresh' })
    calls.push('handoff')
    const body = JSON.parse(init.body as string)
    assert.deepEqual(body.uploadedImageIds.sort(), ['image-0','image-1'])
    assert.deepEqual(body.failedImageIds, [])
    assert.equal(attempts, 2)
    assert.deepEqual(outcomes, [])
    return Response.json({ status: 'processing' })
  })
  await transferBatch({ batchId: 'batch', files: inputs, uploads: inputs.map((file,index)=>({fileId:file.id,imageId:`image-${index}`,uploadUrl:'original'})), limit:createUploadLimiter(5),
    transfer: async file => { if (file.id==='file-0' && ++attempts===1) return {success:false,error:'transient'}; calls.push('transferred'); return {success:true} },
    completed: id=>outcomes.push(id), failed: (_id,error)=>assert.fail(error),
  })
  assert.equal(calls.at(-1), 'handoff')
  assert.equal(outcomes.length, 2)
})

test('failed handoff never reports a transferred photo completed', async t => {
  const inputs = files(1), failures: string[] = []
  t.mock.method(globalThis, 'fetch', async () => Response.json({error:'Session cancelled'}, {status:409}))
  await transferBatch({batchId:'batch',files:inputs,uploads:[{fileId:'file-0',imageId:'image-0',uploadUrl:'url'}],limit:createUploadLimiter(5),transfer:async()=>({success:true}),completed:()=>assert.fail('false upload success'),failed:(_id,error)=>failures.push(error)})
  assert.match(failures[0]!, /processing could not start/)
})

test('cancelled queued files settle and do not start storage transfers or handoff', async t => {
  const inputs = files(20), controller = new AbortController()
  let sent = 0, failed = 0
  controller.abort()
  t.mock.method(globalThis, 'fetch', async()=>{assert.fail('cancelled run enqueued'); return Response.json({})})
  await transferBatch({batchId:'batch',files:inputs,uploads:inputs.map(file=>({fileId:file.id,imageId:file.id,uploadUrl:'url'})),limit:createUploadLimiter(5),signal:controller.signal,transfer:async()=>{sent++;return {success:true}},completed:()=>assert.fail('cancelled completed'),failed:()=>{failed++}})
  assert.equal(sent,0)
  assert.equal(failed,20)
})

test('503 handoff responses retry before any success callback', async t => {
  const inputs=files(1)
  const originalTimeout = globalThis.setTimeout
  t.mock.method(globalThis, 'setTimeout', (callback: (...args: unknown[])=>void, _delay?:number, ...args:unknown[]) => originalTimeout(callback,0,...args))
  let calls=0, completed=0
  t.mock.method(globalThis, 'fetch', async()=> {
    assert.equal(completed,0)
    return ++calls<3 ? Response.json({error:'Queue unavailable'},{status:503}) : Response.json({status:'processing'})
  })
  await transferBatch({batchId:'batch',files:inputs,uploads:[{fileId:'file-0',imageId:'image-0',uploadUrl:'url'}],limit:createUploadLimiter(),transfer:async()=>({success:true}),completed:()=>{completed++},failed:(_id,error)=>assert.fail(error)})
  assert.equal(calls,3);assert.equal(completed,1)
})

for (const reason of ['Upload failed: 429','Upload failed: 503','Upload timeout']) {
  test(`${reason} exhausts bounded retries and excludes failed original from processing`,async t=>{
    const inputs=files(1), originalTimeout=globalThis.setTimeout
    t.mock.method(globalThis,'setTimeout',(callback:(...args:unknown[])=>void,_delay?:number,...args:unknown[])=>originalTimeout(callback,0,...args))
    let attempts=0,failed=0,handoff=0
    t.mock.method(globalThis,'fetch',async(url:string,init:RequestInit)=>{
      if(url.includes('refresh-url'))return Response.json({uploadUrl:'fresh'})
      handoff++
      const body=JSON.parse(init.body as string)
      assert.deepEqual(body.uploadedImageIds,[])
      assert.deepEqual(body.failedImageIds,['image-0'])
      return Response.json({status:'failed'})
    })
    await transferBatch({batchId:'batch',files:inputs,uploads:[{fileId:'file-0',imageId:'image-0',uploadUrl:'url'}],limit:createUploadLimiter(),transfer:async()=>{attempts++;return {success:false,error:reason}},completed:()=>assert.fail('failed original completed'),failed:()=>{failed++}})
    assert.equal(attempts,3);assert.equal(failed,1);assert.equal(handoff,1)
  })
}

test('control-plane request retains deadline when caller supplies cancellation signal', async t => {
  const controller = new AbortController()
  const deadline = new AbortController()
  t.mock.method(AbortSignal, 'timeout', () => deadline.signal)
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    assert.notEqual(init.signal, controller.signal)
    deadline.abort(new DOMException('Timed out', 'TimeoutError'))
    assert.equal(init.signal?.aborted, true)
    init.signal?.throwIfAborted()
    return Response.json({})
  })
  await assert.rejects(acknowledgedFetch('/complete', { signal: controller.signal }, 1), /Timed out/)
  assert.equal(controller.signal.aborted, false)
})
