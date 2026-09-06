import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import vm from 'node:vm'
const require=createRequire(import.meta.url),ts=require('typescript')
test('account change aborts every active upload and releases unload guard synchronously',()=>{
 const window=new EventTarget(),exports:any={}
 const code=ts.transpileModule(readFileSync(new URL('./active-run.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
 vm.runInNewContext(code,{exports,window,AbortController})
 const first=exports.registerUploadRun('simple'),second=exports.registerUploadRun('bulk')
 const before=new Event('beforeunload',{cancelable:true});Object.defineProperty(before,'returnValue',{value:'',writable:true});window.dispatchEvent(before);assert.equal(before.defaultPrevented,true)
 window.dispatchEvent(new Event('tinesight:account-changed'))
 assert.equal(first.signal.aborted,true);assert.equal(second.signal.aborted,true)
 const after=new Event('beforeunload',{cancelable:true});window.dispatchEvent(after);assert.equal(after.defaultPrevented,false)
 exports.releaseUploadRun('simple');exports.releaseUploadRun('bulk')
 const next=exports.registerUploadRun('new-account');assert.equal(next.signal.aborted,false);exports.releaseUploadRun('new-account')
})
