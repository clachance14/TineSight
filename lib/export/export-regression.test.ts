import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import vm from 'node:vm'
import {randomBytes} from 'node:crypto'
const require=createRequire(import.meta.url)
const ts=require('typescript')
function load(path: URL, mocks: Record<string,unknown>={}) {
 const exports:Record<string,any>={}
 const code=ts.transpileModule(readFileSync(process.env['EXPORT_ROUTE_SOURCE'] && path.pathname.endsWith('/api/photos/export/route.ts') ? process.env['EXPORT_ROUTE_SOURCE'] : path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText
 vm.runInNewContext(code,{exports,Buffer,console,Headers,ReadableStream,require:(name:string)=>mocks[name]??(name.startsWith('./')?load(new URL(name+'.ts',path)):name.startsWith('@/')?load(new URL('../../'+name.slice(2)+'.ts',import.meta.url)):require(name))})
 return exports
}
test('worker export helpers accept explicit client without accessing request cookies',async()=>{
 const query:any={limit:()=>query,eq:()=>query,in:()=>query,is:()=>query,order:()=>query,range:()=>query,select:()=>query,then:(resolve:any)=>resolve({data:[],error:null})}
 const client={from:()=>query}
 const service=load(new URL('../services/export.ts',import.meta.url),{'@/lib/supabase/server':{createClient:()=>{throw Error('cookies outside request')}}})
 const result=await service.getPhotosForExport('owner',['photo'],client)
 assert.equal(result.error,null)
 assert.equal(result.data.length,0)
})
test('ZIP completes beyond stream high-water marks using bounded temporary file',async()=>{
 const archiver=require('archiver'),archive=archiver('zip')
 const helper=load(new URL('./archive-file.ts',import.meta.url))
 const file=await helper.createArchiveFile(archive)
 let timeout:ReturnType<typeof setTimeout>|undefined
 try {
  const operation=(async()=>{
   for(let n=0;n<26;n++)await file.append(randomBytes(1024*1024),`photo${n}.jpg`)
   const zip=await file.finish();let bytes=0
   for await(const chunk of zip.stream)bytes+=chunk.length
   assert(bytes>26*1024*1024)
  })()
  await Promise.race([operation,new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(Error('archive output deadlocked')),5000)})])
 } finally {clearTimeout(timeout);await file.cleanup()}
})
test('unknown-size content exceeding archive hard limit fails without unbounded allocation',async()=>{
 const helper=load(new URL('./archive-file.ts',import.meta.url));const file=await helper.createArchiveFile(require('archiver')('zip'),1024)
 try {await assert.rejects((async()=>{await file.append(randomBytes(1024*1024),'photo.jpg');await file.finish()})(),/500 MB export limit/)} finally {await file.cleanup()}
})
test('500-photo export bounds each UUID query and preserves every photo',async()=>{
 const sizes:number[]=[]
 const client={from:()=>{let ids:string[]=[];const query:any={select:()=>query,eq:()=>query,is:()=>query,order:()=>query,limit:()=>query,in:(_:string,values:string[])=>{ids=values;sizes.push(ids.length);return query},then:(resolve:any)=>resolve({data:ids.map(id=>({id,file_path:`owner/${id}.jpg`,detections:[],camera:null})),error:null})};return query}}
 const service=load(new URL('../services/export.ts',import.meta.url),{'@/lib/supabase/server':{createClient:()=>{throw Error('cookies outside request')}}})
 const result=await service.getPhotosForExport('owner',Array.from({length:500},(_,n)=>String(n)),client)
 assert.equal(result.error,null);assert.equal(result.data.length,500);assert.equal(Math.max(...sizes),100)
})
for(const [output,expected] of [[{success:false,error:'No photos found for export'},'failed'],[{success:true,downloadUrl:'https://download.invalid'},'completed']] as const){
 test(`export polling reports nested progress and ${expected} output`,async()=>{
  const route=load(new URL('../../app/api/photos/export/[jobId]/status/route.ts',import.meta.url),{
   'next/server':{NextResponse:{json:(body:unknown)=>body}},
   '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})}})},
   '@trigger.dev/sdk/v3':{runs:{retrieve:async()=>({status:'COMPLETED',payload:{userId:'owner'},metadata:{progress:{current:26,total:26}},output})}},
  })
  const response=await route.GET(null,{params:Promise.resolve({jobId:'run_test'})})
  assert.equal(response.status,expected);assert.equal(response.progress.current,26);assert.equal(response.current,26);assert.equal(response.total,26)
 })
}

function exportRoute(count:number, failDownload=false) {
 const ids=Array.from({length:count},(_,i)=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`)
 let jobs=0,downloads=0
 const route=load(new URL('../../app/api/photos/export/route.ts',import.meta.url),{
  '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})}})},
  '@/lib/services/export':{getPhotosForExport:async()=>({data:ids.map(id=>({id,file_path:`owner/${id}.jpg`})),error:null}),generateExportFilename:(p:any)=>p.id+'.jpg',downloadPhotoBuffer:async()=>{downloads++;return failDownload?{data:null,error:Error('missing original')}:{data:Buffer.from('original'),error:null}}},
  '@trigger.dev/sdk/v3':{tasks:{trigger:async()=>{jobs++;return{id:'job'}}}},
 })
 return {post:()=>route.POST(new Request('http://localhost/export',{method:'POST',body:JSON.stringify({photoIds:ids})})),jobs:()=>jobs,downloads:()=>downloads}
}
test('25-photo ZIP fails visibly when an original cannot be downloaded',async()=>{
 const route=exportRoute(25,true),response=await route.post();assert.equal(response.status,500)
 assert.match((await response.json()).error,/download/i)
})
test('25/26/500/501 route boundaries preserve download versus job behavior',async()=>{
 const small=exportRoute(25),zip=await small.post();assert.equal(zip.status,200);assert.equal(zip.headers.get('content-type'),'application/zip');const bytes=Buffer.from(await zip.arrayBuffer());assert.equal(bytes.readUInt32LE(bytes.length-22),0x06054b50);assert.equal(bytes.readUInt16LE(bytes.length-12),25);assert.equal(small.downloads(),25);assert.equal(small.jobs(),0)
 for(const count of [26,500]){const large=exportRoute(count);assert.equal((await (await large.post()).json()).jobId,'job');assert.equal(large.jobs(),1);assert.equal(large.downloads(),0)}
 const tooLarge=exportRoute(501);assert.equal((await tooLarge.post()).status,400);assert.equal(tooLarge.jobs(),0)
})
test('background export never reports a partial missing-original ZIP as completed',async()=>{
 let uploads=0,cleanups=0
 const worker=load(new URL('../../trigger/jobs/export-photos.ts',import.meta.url),{
  '@trigger.dev/sdk/v3':{task:(value:unknown)=>value,logger:{info:()=>{},error:()=>{}},metadata:{set:()=>{}}},
  '@/lib/supabase/admin':{createAdminClient:()=>({})},
  '@/lib/services/export':{getPhotosForExport:async()=>({data:[{id:'ok',file_path:'ok'},{id:'missing',file_path:'missing'}],error:null}),downloadPhotoBuffer:async(path:string)=>path==='missing'?{data:null,error:Error('missing')}:{data:Buffer.from('photo'),error:null},generateExportFilename:(p:any)=>p.id,uploadZipToStorage:async()=>{uploads++;return{path:'zip'}},getExportDownloadUrl:async()=>({data:'signed'})},
  '@/lib/export/archive-file':{createArchiveFile:async()=>({append:async()=>{},finish:async()=>({stream:null,bytes:1}),cleanup:async()=>{cleanups++}})},
 })
 const result=await worker.exportPhotosTask.run({userId:'owner',photoIds:['ok','missing']})
 assert.equal(result.success,false);assert.equal(result.failedCount,1);assert.equal(uploads,0);assert.equal(cleanups,1);assert.match(result.error,/retry/i)
})
