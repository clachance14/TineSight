import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import vm from 'node:vm'
const require=createRequire(import.meta.url),ts=require('typescript')
function fixture() {
 const clusters:any[]=[{id:'source',user_id:'owner',status:'pending',representative_detection_id:'d1',member_count:3},{id:'target',user_id:'owner',status:'pending',representative_detection_id:'d4',member_count:1}]
 const members:any[]=[1,2,3].map(n=>({id:`m${n}`,cluster_id:'source',detection_id:`d${n}`})).concat([{id:'m4',cluster_id:'target',detection_id:'d4'}])
 const client={from:(table:string)=>{
  const rows=table==='trophy_clusters'?clusters:members;const filters:((row:any)=>boolean)[]=[];let update:any,insert:any,head=false,single=false
  const query:any={order:()=>query,limit:()=>query,select:(_:unknown,options:any)=>{head=options?.head;return query},eq:(k:string,v:unknown)=>{filters.push(row=>row[k]===v);return query},in:(k:string,v:unknown[])=>{filters.push(row=>v.includes(row[k]));return query},update:(v:any)=>{update=v;return query},insert:(v:any)=>{insert=v;return query},single:()=>{single=true;return query},then:(resolve:any)=>{if(insert)rows.push({id:'new',...insert});const matching=rows.filter(row=>filters.every(f=>f(row)));if(update)matching.forEach(row=>Object.assign(row,update));resolve({data:head?null:single?(insert?rows.at(-1):matching[0]):matching,error:null,count:matching.length})}}
  return query
 }}
 const exports:any={};const code=ts.transpileModule(readFileSync(new URL('../services/clusters.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
 vm.runInNewContext(code,{exports,console,require:()=>({createClient:async()=>client})})
 return {service:exports,clusters,members}
}
test('merge keeps exact target member count',async()=>{const f=fixture();assert.equal((await f.service.mergeCluster('source','target')).error,null);assert.equal(f.clusters[1].member_count,4)})
test('partial split leaves remaining candidate reviewable with live representative',async()=>{const f=fixture();assert.equal((await f.service.splitCluster('source',['d1'])).error,null);assert.equal(f.clusters[0].status,'pending');assert.equal(f.clusters[0].member_count,2);assert.equal(f.clusters[0].representative_detection_id,'d2')})
