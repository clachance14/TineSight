import { createHash } from 'node:crypto'
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

function route(path: string, dependencies: Record<string, unknown>) {
  const source = fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports: Record<string, (...args: unknown[]) => Promise<Response>> = {}
  new Function('exports','require',compiled)(exports, (name: string) => {
    if (name === 'node:crypto') return { createHash }
    if (name === 'next/server') return { NextResponse: Response }
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`)
    return dependencies[name]
  })
  return exports['POST']!
}
const batchId='00000000-0000-4000-8000-000000000001', imageId='00000000-0000-4000-8000-000000000002'
const request=(body: unknown)=>new Request('http://local.test/api/photos/upload/complete',{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}})

test('actual Next completion route rejects malformed IDs before RPC or enqueue',async()=>{
  const post=route('app/api/photos/upload/complete/route.ts',{
    '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},rpc:()=>assert.fail('malformed input reached RPC')})},
    '@trigger.dev/sdk/v3':{tasks:{trigger:()=>assert.fail('malformed enqueue')}},
  })
  assert.equal((await post(request({batchId,uploadedImageIds:['not-a-uuid']}))).status,400)
})

test('actual completion retry uses same enqueue identity after lost Trigger response',async()=>{
  const keys: string[]=[]
  let calls=0
  const post=route('app/api/photos/upload/complete/route.ts',{
    '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},rpc:async(name:string,args:Record<string,unknown>)=>{
      assert.equal(name,'finalize_upload_batch');assert.deepEqual(args['p_uploaded_ids'],[imageId]);return {data:{image_ids:[imageId]},error:null}
    }})},
    '@trigger.dev/sdk/v3':{tasks:{trigger:async(_name:string,_body:unknown,options:{idempotencyKey:string})=>{keys.push(options.idempotencyKey);if(calls++===0)throw new Error('503/lost response');return {id:'run'}}}},
  })
  assert.equal((await post(request({batchId,uploadedImageIds:[imageId]}))).status,500)
  assert.equal((await post(request({batchId,uploadedImageIds:[imageId]}))).status,200)
  assert.equal(keys[0],keys[1]);assert.ok(keys[0]!.startsWith(`upload-batch:${batchId}:`))
})

test('actual completion route refuses missing storage/cancelled batch without Trigger side effects',async()=>{
  const post=route('app/api/photos/upload/complete/route.ts',{
    '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},rpc:async()=>({data:null,error:{code:'22023',message:'Original photo transfer is incomplete'}})})},
    '@trigger.dev/sdk/v3':{tasks:{trigger:()=>assert.fail('unready original dispatched')}},
  })
  assert.equal((await post(request({batchId,uploadedImageIds:[imageId]}))).status,400)
})

test('actual init route reports bad MIME and oversized chunks as validation errors without creating batches',async()=>{
  const post=route('app/api/photos/upload/route.ts',{
    '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})}})},
    '@/lib/services/batches':{createBatch:()=>assert.fail('invalid batch created')},
    '@/lib/services/photos':{},'@/lib/services/cameras':{},'@/lib/services/locations':{},
  })
  const invalid={id:'file',filename:'photo.jpg',size:100}
  assert.equal((await post(request({files:[invalid]}))).status,400)
  assert.equal((await post(request({files:Array.from({length:101},()=>({...invalid,contentType:'image/jpeg'}))}))).status,400)
})

test('actual session completion route invokes owner-scoped finalization once',async()=>{
  const post=route('app/api/upload-sessions/[id]/complete/route.ts',{
    '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}}})},rpc:async(name:string,args:Record<string,unknown>)=>{assert.equal(name,'finish_upload_session');assert.deepEqual(args,{p_session_id:batchId});return {error:null}}})},
  })
  assert.equal((await post(request({}),{params:Promise.resolve({id:batchId})})).status,200)
})

test('actual duplicate API skips only confirmed content hashes, not equal filename/size',async()=>{
  const existingHash='a'.repeat(64),differentHash='b'.repeat(64)
  const post=route('app/api/photos/check-duplicates/route.ts',{
    '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},rpc:async(name:string,args:Record<string,string[]>)=>{
      assert.equal(name,'get_uploaded_content_hashes')
      assert.deepEqual(args['p_hashes'],[existingHash,differentHash])
      return {data:[existingHash],error:null}
    }})},
  })
  const response=await post(request({files:[{filename:'IMG001.JPG',size:100,contentSha256:existingHash},{filename:'IMG001.JPG',size:100,contentSha256:differentHash},{filename:'IMG001.JPG',size:100}]}))
  assert.equal(response.status,200)
  const result=await response.json()
  assert.deepEqual(result.existingHashes,[existingHash])
  assert.equal(result.duplicateCount,1)
  assert.equal(result.toUpload.length,2)
})

test('explicit photo retry uses owned reset RPC and enqueues a fresh worker identity',async()=>{
  const jobs: string[]=[]
  const post=route('app/api/photos/[id]/retry/route.ts',{
    '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},rpc:async(name:string,args:{p_photo_id:string})=>{assert.equal(name,'request_photo_retry');assert.equal(args.p_photo_id,imageId);return {data:[{id:imageId,batch_id:batchId,detection_status:'completed',variant_status:'pending'}],error:null}}})},
    '@trigger.dev/sdk/v3':{tasks:{trigger:async(name:string,_payload:unknown,options:{idempotencyKey:string})=>{jobs.push(name);assert.match(options.idempotencyKey,/^manual-preview:/)}}},
  })
  const response=await post(request({}),{params:Promise.resolve({id:imageId})})
  assert.equal(response.status,200);assert.deepEqual(jobs,['generate-image-variants'])
})
