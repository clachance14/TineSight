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
  return {retry:load('lib/upload/retry-failed.ts')['retryFailedUploads'],store:load('lib/stores/upload.ts')['useUploadStore'],preparation:load('lib/upload/preparation.ts'),runs:load('lib/upload/active-run.ts')}
}

test('Retry failed photos keeps original reservations and never retransfers acknowledged bytes',async t=>{
  const {retry,store}=loadModules()
  store.getState().addFiles([{file:new File(['a'],'one.jpg')},{file:new File(['b'],'two.jpg')}])
  const files=store.getState().uploadQueue
  store.getState().startUpload('existing-batch',files.map((file:any,index:number)=>({fileId:file.id,imageId:`image-${index}`,uploadUrl:`url-${index}`})))
  store.getState().markFileTransferred(files[0].id)
  store.getState().markFileFailed(files[0].id,'Processing handoff unavailable')
  store.getState().markFileFailed(files[1].id,'Network timeout')
  let transfers=0,handoffs=0
  t.mock.method(globalThis,'fetch',async(_url:string,init:RequestInit)=>{
    handoffs++;const body=JSON.parse(init.body as string)
    assert.equal(body.batchId,'existing-batch')
    assert.deepEqual(body.uploadedImageIds.sort(),['image-0','image-1'])
    return Response.json({status:'processing'})
  })
  const pending=await retry(async(file:any)=>{transfers++;assert.equal(file.filename,'two.jpg');return {success:true}})
  assert.equal(transfers,1);assert.equal(handoffs,1);assert.deepEqual(pending,[])
  assert.equal(store.getState().completedCount,2);assert.equal(store.getState().failedCount,0)
  assert.ok(store.getState().uploadQueue.every((file:any)=>file.error===undefined),'Successful retries must clear old failure messages')
})

test('init failure preserves File for retry and old-account completion callbacks cannot change counts',async()=>{
  const {retry,store}=loadModules()
  store.getState().addFiles([{file:new File(['a'],'one.jpg')}])
  const id=store.getState().uploadQueue[0].id
  store.getState().markFileFailed(id,'HTTP400')
  assert.ok(store.getState().uploadQueue[0].file)
  const pending=await retry(async()=>assert.fail('uninitialized file uploaded'))
  assert.equal(pending.length,1);assert.equal(store.getState().uploadQueue[0].status,'pending')
  store.getState().reset()
  store.getState().markFileCompleted(id);store.getState().markFileFailed(id,'late old account')
  assert.equal(store.getState().completedCount,0);assert.equal(store.getState().failedCount,0)
})

test('unreadable original stays failed and retryable while readable peers alone enter transfer',async()=>{
  const {store,preparation}=loadModules()
  const good=new File(['good'],'good.jpg'),bad=new File(['bad'],'bad.jpg')
  Object.defineProperty(bad,'arrayBuffer',{value:async()=>{throw new Error('Source disconnected')}})
  const goodResult=await preparation.readOriginalHash(good),badResult=await preparation.readOriginalHash(bad)
  assert.equal(typeof goodResult.hash,'string');assert.equal(badResult.hash,undefined)
  store.getState().addFiles([{file:good,contentSha256:goodResult.hash}])
  preparation.recordPreparationFailures([badResult.failure])
  assert.deepEqual(store.getState().uploadQueue.filter((f:any)=>f.status==='pending').map((f:any)=>f.filename),['good.jpg'])
  const failed=store.getState().uploadQueue.find((f:any)=>f.status==='failed')
  assert.equal(failed.file,bad);assert.match(failed.error,/could not be read/)
  assert.equal(store.getState().failedCount,1)
})

test('intentional cancel during retry settles as cancelled with no retryable deleted originals',async t=>{
  const {retry,store,runs}=loadModules()
  store.getState().addFiles([{file:new File(['a'],'one.jpg')}])
  const file=store.getState().uploadQueue[0]
  store.getState().startUpload('batch',[{fileId:file.id,imageId:'image',uploadUrl:'url'}])
  store.getState().markFileFailed(file.id,'Earlier network failure')
  t.mock.method(globalThis,'fetch',async()=>assert.fail('Cancelled retry must not enqueue'))
  await assert.rejects(retry(async()=>{runs.cancelUploadRun('session');return {success:false,error:'Abort'}},'session'),error=>error===runs.USER_UPLOAD_CANCELLED)
  assert.equal(store.getState().isCancelled,true)
  assert.equal(store.getState().failedCount,0)
  assert.equal(store.getState().uploadQueue.length,0)
  assert.equal(store.getState().isPreparing,false)
})

test('cancelled run retains completed references and ignores late failure callbacks',()=>{
  const {store}=loadModules()
  store.getState().addFiles([{file:new File(['a'],'saved.jpg')},{file:new File(['b'],'cancelled.jpg')}])
  const [saved,cancelled]=store.getState().uploadQueue
  store.getState().markFileCompleted(saved.id)
  store.getState().markFileFailed(cancelled.id,'Abort')
  store.getState().cancelFiles([saved.id,cancelled.id])
  store.getState().markFileFailed(cancelled.id,'Late abort error')
  assert.equal(store.getState().isCancelled,true)
  assert.equal(store.getState().completedCount,1)
  assert.equal(store.getState().failedCount,0)
  assert.deepEqual(store.getState().uploadQueue.map((file:any)=>file.filename),['saved.jpg'])
  store.getState().reset()
  store.getState().cancelFiles([saved.id,cancelled.id])
  assert.equal(store.getState().isCancelled,false,'Old account must not repopulate cancellation state')
})
