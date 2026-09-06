import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {execFileSync} from 'node:child_process'
import vm from 'node:vm'
const require=createRequire(import.meta.url),ts=require('typescript')
function load(client:unknown) {
 const file='lib/services/matching.ts'
 const source=process.env['TINESIGHT_TEST_BASELINE']?execFileSync('git',['show',`HEAD:${file}`],{encoding:'utf8'}):readFileSync(new URL('../services/matching.ts',import.meta.url),'utf8')
 const exports:any={};const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
 vm.runInNewContext(code,{exports,console,require:(name:string)=>name.endsWith('/server')?{createClient:async()=>client}:{}})
 return exports
}
test('correcting a match never writes a foreign Buck ID',async()=>{
 let writes=0
 const client={from:(table:string)=>{let mutate=false;const query:any={select:()=>query,eq:()=>query,in:()=>query,is:()=>query,single:()=>query,maybeSingle:()=>query,update:()=>{mutate=true;return query},then:(resolve:any)=>{if(mutate)writes++;resolve({data:table==='deer'?null:{detection_id:'own-detection'},error:null})}};return query}}
 const result=await load(client).correctMatch('own-match','foreign-buck','owner')
 assert.equal(writes,0)
 assert.match(result.error?.message??'',/Buck not found/)
})
test('failed detection assignment cannot report match confirmation success',async()=>{
 const client={from:(table:string)=>{let mutate=false;const query:any={select:()=>query,eq:()=>query,neq:()=>query,is:()=>query,single:()=>query,maybeSingle:()=>query,update:()=>{mutate=true;return query},then:(resolve:any)=>resolve({data:table==='deer'?{id:'own-buck'}:{detection_id:'own-detection',candidate_deer_id:'own-buck'},error:mutate&&table==='detections'?Error('write failed'):null})};return query}}
 const result=await load(client).confirmMatch('own-match','owner')
 assert.match(result.error?.message??'',/write failed/)
})
