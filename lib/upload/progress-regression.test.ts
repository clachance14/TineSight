import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'

test('mounting shared completed progress after Bulk→Simple never schedules navigation',()=>{
  const source=fs.readFileSync(process.env['UPLOAD_PROGRESS_SOURCE'] ?? new URL('../../components/photos/upload-progress-panel.tsx',import.meta.url),'utf8')
  const effects:Array<()=>unknown>=[],navigations:string[]=[]
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
  const exports:Record<string,()=>unknown>={}
  const element=(type:unknown,props:unknown)=>({type,props})
  const state={uploadQueue:[{id:'previous',filename:'bulk.jpg',status:'completed',progress:100}],isPreparing:false,isUploading:false,overallProgress:100,completedCount:1,failedCount:0,totalCount:1,reset:()=>{},clearCompletedFiles:()=>{}}
  new Function('exports','require',compiled)(exports,(name:string)=>{
    if(name==='react')return {useRef:()=>({current:null}),memo:(component:unknown)=>component,useEffect:(effect:()=>unknown)=>effects.push(effect)}
    if(name==='react/jsx-runtime')return {jsx:element,jsxs:element,Fragment:'fragment'}
    if(name==='next/navigation')return {useRouter:()=>({push:(url:string)=>navigations.push(url)})}
    if(name==='next/link')return {default:'a'}
    if(name==='@tanstack/react-virtual')return {useVirtualizer:()=>({getVirtualItems:()=>[],getTotalSize:()=>0})}
    if(name==='@/lib/stores/upload')return {useUploadStore:()=>state}
    if(name==='@/lib/utils')return {cn:()=>''}
    return new Proxy({},{get:(_target,key)=>String(key)})
  })
  const previousTimeout=globalThis.setTimeout
  let scheduled=0
  globalThis.setTimeout=((fn:()=>void)=>{scheduled++;fn();return 1}) as typeof setTimeout
  try {exports['UploadProgressPanel']!();effects.forEach(effect=>effect())}
  finally {globalThis.setTimeout=previousTimeout}
  assert.equal(scheduled,0)
  assert.deepEqual(navigations,[])
})

test('cancelled progress displays a cancellation outcome without failed-photo retry',()=>{
 const source=fs.readFileSync(new URL('../../components/photos/upload-progress-panel.tsx',import.meta.url),'utf8')
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
 const exports:any={}
 const element=(type:unknown,props:unknown)=>({type,props})
 new Function('exports','require',compiled)(exports,(name:string)=>{
  if(name==='react')return {useRef:()=>({current:null}),memo:(component:unknown)=>component}
  if(name==='react/jsx-runtime')return {jsx:element,jsxs:element}
  if(name==='@/lib/stores/upload')return {useUploadStore:()=>({uploadQueue:[],isCancelled:true,isPreparing:false,isUploading:false,totalCount:0,completedCount:0,failedCount:0,reset:()=>{}})}
  if(name==='@tanstack/react-virtual')return {useVirtualizer:()=>({})}
  if(name==='next/link')return {default:'a'}
  return new Proxy({},{get:(_target,key)=>String(key)})
 })
 const output=JSON.stringify(exports.UploadProgressPanel({onRetry:()=>assert.fail('Retry offered after cancellation')}))
 assert.match(output,/Upload cancelled/)
 assert.doesNotMatch(output,/Retry failed|Upload Failed|aborted without reason/)
})
