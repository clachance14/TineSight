import test from 'node:test'
import assert from 'node:assert/strict'
import {createViewLoader, photoRefreshDelay} from './view-refresh.ts'
import type {PhotoViewDTO} from '@/lib/services/photo-view'
const photo=(id:string,imageUrl:string|null=null):PhotoViewDTO=>({id,imageUrl,expiresAt:Date.now()+3_600_000,variantStatus:imageUrl===null?'pending':'completed',detectionStatus:'processing'} as PhotoViewDTO)
test('pending view refresh bypasses hour-long URL cache and later backs off',async()=>{
 const initial=photo('A'),cache=new Map([['A',initial]])
 let calls=0;const loader=createViewLoader(cache,'',async()=>{calls++;return Response.json(photo('A','ready'))})
 assert.equal((await loader.load('A')).imageUrl,null)
 assert.equal((await loader.load('A',true)).imageUrl,'ready');assert.equal(calls,1)
 assert.equal(photoRefreshDelay(initial,0),5000);assert.equal(photoRefreshDelay(initial,12),30000)
 assert.equal(photoRefreshDelay({variantStatus:'completed',detectionStatus:'completed'},0),60000)
})
test('late prefetch cannot overwrite a newer forced refresh',async()=>{
 const cache=new Map<string,PhotoViewDTO>();let resolve!:(r:Response)=>void;let calls=0
 const loader=createViewLoader(cache,'',async()=>++calls===1?await new Promise<Response>(r=>{resolve=r}):Response.json(photo('A','new')))
 const old=loader.load('A').catch(()=>null);await loader.load('A',true);resolve(Response.json(photo('A','old')));await old
 assert.equal(cache.get('A')?.imageUrl,'new')
})
test('account/unmount abort prevents late cache writes and errors remain retryable',async()=>{
 const cache=new Map<string,PhotoViewDTO>();let resolve!:(r:Response)=>void
 const loader=createViewLoader(cache,'',async()=>await new Promise<Response>(r=>{resolve=r}))
 const pending=loader.load('A').catch(()=>null);loader.abort();resolve(Response.json(photo('A')));await pending;assert.equal(cache.size,0)
 let attempts=0;const retry=createViewLoader(cache,'',async()=>++attempts===1?new Response('',{status:503}):Response.json(photo('A','ready')))
 await assert.rejects(retry.load('A'),/retry/);assert.equal((await retry.load('A')).imageUrl,'ready')
})
