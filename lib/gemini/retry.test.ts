import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
import {createRequire} from 'node:module'
import vm from 'node:vm'
const require=createRequire(import.meta.url),ts=require('typescript')
function loadRetry(){
 const next=new URL('./retry.ts',import.meta.url);const modern=existsSync(next)
 const text=readFileSync(modern?next:new URL('./client.ts',import.meta.url),'utf8')
 const code=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const exports:any={}
 vm.runInNewContext(code+(modern?'':'\nexports.withRetry=withRetry;'),{exports,console,process:{env:{}},Error,Date,Math,AbortController,setTimeout,clearTimeout,require:()=>({})})
 return exports
}
const api=loadRetry()
test('structured 429 honors Retry-After with bounded retries',async()=>{
 let attempts=0;const delays:number[]=[]
 const result=await api.withRetry(async()=>{if(++attempts===1)throw {status:429,headers:{'retry-after':'2'}};return 'ok'}, {sleep:async(ms:number)=>{delays.push(ms)},random:()=>0,now:()=>0})
 assert.equal(attempts,2);assert.equal(delays[0],2000);assert.equal(result.wasRateLimited,true)
})
test('structured 503 without message retries, while 403 does not',async()=>{
 let attempts=0
 const result=await api.withRetry(async()=>{if(++attempts<3)throw {status:503};return 'ok'}, {sleep:async()=>{},random:()=>0,now:()=>0})
 assert.equal(result.retryCount,2)
 let forbidden=0;await assert.rejects(api.withRetry(async()=>{forbidden++;throw {status:403}},{sleep:async()=>{}}));assert.equal(forbidden,1)
})
test('stalled provider call is aborted and finishes within bounded attempts',async()=>{
 let calls=0,aborted=0
 await assert.rejects(Promise.race([
  api.withRetry((signal:AbortSignal)=>{calls++;signal?.addEventListener('abort',()=>aborted++);return new Promise(()=>{})},{timeoutMs:10,maxAttempts:2,initialDelayMs:1,sleep:async()=>{},maxElapsedMs:100}),
  new Promise((_,reject)=>setTimeout(()=>reject(Error('unbounded provider hang')),200)),
 ]),/timed out/)
 assert.equal(calls,2);assert.equal(aborted,2)
})
test('SDK RetryInfo and HTTP-date hints are honored without exceeding budget',async()=>{
 assert.equal(api.retryAfterMs({status:429,message:JSON.stringify({error:{details:[{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:'1.25s'}]}})}),1250)
 assert.equal(api.retryAfterMs({headers:{'retry-after':'Thu, 01 Jan 1970 00:00:10 GMT'}},0),10000)
 let calls=0
 await assert.rejects(api.withRetry(async()=>{calls++;throw {status:429,headers:{'retry-after':'600'}}},{maxElapsedMs:1000,sleep:async()=>{throw Error('must not sleep beyond budget')}}))
 assert.equal(calls,1)
})
test('1000 simultaneous jobs each stop at configured retry budget',async()=>{
 let requests=0
 const results=await Promise.allSettled(Array.from({length:1000},()=>api.withRetry(async()=>{requests++;throw {status:503}},{maxAttempts:3,sleep:async()=>{},now:()=>0,random:()=>0.25})))
 assert.equal(requests,3000);assert(results.every(r=>r.status==='rejected'))
})
test('actual detection client passes abort signal and configured supported fallback',async()=>{
 const requests:any[]=[];let options:any
 const usage = await import('./usage.ts')
 const events: import('./usage.ts').GeminiUsageEvent[] = []
 const mocks:any={
  '@google/genai':{GoogleGenAI:class {constructor(config:any){options=config} models={generateContent:async(request:any)=>{requests.push(request);if(request.model==='gemini-3-flash-preview')throw {status:503};return {text:'{}',usageMetadata:{}}}}}},
  './retry':api,
  './usage':{...usage,createUsageRecorder:(operation:string)=>usage.createUsageRecorder(operation,event=>events.push(event))},
  './capacity':{modelChain:()=>['gemini-3-flash-preview','gemini-2.5-flash'],GEMINI_TIMEOUT_MS:100,GEMINI_MAX_ATTEMPTS:1},
  './types':{detectionOnlySchema:{parse:(value:unknown)=>value}},'./prompts':{},'./schemas':{},
 }
 const source=readFileSync(new URL('./client.ts',import.meta.url),'utf8')
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const exports:any={}
 vm.runInNewContext(code,{exports,console:{log:()=>{}},process:{env:{GEMINI_API_KEY:'fake',GEMINI_MODEL:'gemini-3-flash-preview'}},AbortController,require:(name:string)=>mocks[name]})
 const result=await exports.detectDeer('fake','image/jpeg')
 assert.deepEqual(requests.map(r=>r.model),['gemini-3-flash-preview','gemini-2.5-flash'])
 assert(requests.every(r=>r.config.abortSignal instanceof AbortSignal))
 assert.equal(options.httpOptions.timeout,100);assert.equal(result.metrics.modelUsed,'gemini-2.5-flash')
 assert.deepEqual(events.map(e=>[e.model,e.status]),[['gemini-3-flash-preview','error'],['gemini-2.5-flash','response']])
 assert.equal(events[0]?.callId,events[1]?.callId)
})

test('fingerprint uses Gemini 3.8 independently with compatible config and usage logging', async () => {
 const usage = await import('./usage.ts')
 const capacity = await import('./capacity.ts')
 const requests:any[]=[]
 const events: import('./usage.ts').GeminiUsageEvent[]=[]
 const fingerprint={scores:{score_class:'140s',gross_score:145,net_score:140},measurements:{total_points:10},features:{has_drop_tine:false},confidence:{overall:0.8}}
 const mocks:any={
  '@google/genai':{GoogleGenAI:class {models={generateContent:async(request:any)=>{
   requests.push(request)
   return {text:JSON.stringify(fingerprint),usageMetadata:{promptTokenCount:100,candidatesTokenCount:30,thoughtsTokenCount:50,totalTokenCount:180}}
  }}}},
  './retry':api,
  './usage':{...usage,createUsageRecorder:(operation:string)=>usage.createUsageRecorder(operation,event=>events.push(event))},
  './capacity':{...capacity,GEMINI_TIMEOUT_MS:100,GEMINI_MAX_ATTEMPTS:1},
  './types':{antlerFingerprintSchema:{parse:(value:unknown)=>value}},
  './prompts':{ANTLER_FINGERPRINT_PROMPT:'fingerprint prompt'},'./schemas':{ANTLER_FINGERPRINT_SCHEMA:{type:'OBJECT'}},
 }
 const source=readFileSync(new URL('./client.ts',import.meta.url),'utf8')
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const exports:any={}
 vm.runInNewContext(code,{exports,console:{log:()=>{}},process:{env:{GEMINI_API_KEY:'fake',GEMINI_MODEL:'gemini-3-flash-preview',GEMINI_FALLBACK_MODELS:'gemini-2.5-flash'}},AbortController,require:(name:string)=>mocks[name]})
 const result=await exports.extractAntlerFingerprint(Buffer.from('fake image'))
 assert.equal(requests.length,1)
 assert.equal(requests[0].model,'gemini-3.8-flash')
 assert.equal(requests[0].config.temperature,undefined)
 assert.equal(requests[0].config.thinkingConfig.thinkingBudget,undefined)
 assert.equal(requests[0].config.thinkingConfig.includeThoughts,false)
 assert.equal(requests[0].config.responseMimeType,'application/json')
 assert.equal(result.metrics.modelUsed,'gemini-3.8-flash')
 assert.equal(events[0]?.thoughtsTokens,50)
})
