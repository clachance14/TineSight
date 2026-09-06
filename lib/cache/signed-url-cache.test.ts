import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import vm from 'node:vm'
const require=createRequire(import.meta.url),ts=require('typescript')
function fixture(){
 let actor='A',calls=0;const exports:any={}
 const code=ts.transpileModule(readFileSync(new URL('./signed-url-cache.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
 vm.runInNewContext(code,{exports,require:()=>({getSignedViewUrl:async()=>{calls++;return {data:actor==='A'?'signed-A':null}},getSignedViewUrls:async(paths:string[])=>{calls++;return {data:new Map(actor==='A'?paths.map(p=>[p,'signed-A']):[])}}})})
 return {cache:exports,actor:(value:string)=>{actor=value},calls:()=>calls}
}
test('cached single signed URL cannot bypass another account storage policy',async()=>{
 const f=fixture();assert.equal(await f.cache.getCachedSignedUrl('legacy/original.jpg','A'),'signed-A')
 assert.equal(await f.cache.getCachedSignedUrl('legacy/original.jpg','A'),'signed-A');assert.equal(f.calls(),1)
 f.actor('B');assert.equal(await f.cache.getCachedSignedUrl('legacy/original.jpg','B'),null)
})
test('batch cache isolates account and invalidation removes all copies',async()=>{
 const f=fixture();await f.cache.getCachedSignedUrls(['medium/uuid.webp'],'A');f.actor('B')
 assert.equal((await f.cache.getCachedSignedUrls(['medium/uuid.webp'],'B'))[0],null)
 f.actor('A');f.cache.invalidateSignedUrl('medium/uuid.webp');await f.cache.getCachedSignedUrls(['medium/uuid.webp'],'A');assert.equal(f.calls(),3)
})
