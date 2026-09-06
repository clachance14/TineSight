import test from 'node:test'
import assert from 'node:assert/strict'
import { assertExportSize, MAX_EXPORT_BYTES } from './limits.ts'
test('known oversized selection gets actionable split message before any download',()=>{
 assert.throws(()=>assertExportSize([{file_size_bytes:MAX_EXPORT_BYTES}]),/Split them into smaller exports/)
 assert.doesNotThrow(()=>assertExportSize(Array.from({length:100},()=>({file_size_bytes:2*1024*1024}))))
})
test('unknown metadata requires runtime stream guard rather than a guessed size',()=>{
 assert.doesNotThrow(()=>assertExportSize([{file_size_bytes:null},{file_size_bytes:NaN},{}]))
 assert.throws(()=>assertExportSize([{file_size_bytes:null},{file_size_bytes:MAX_EXPORT_BYTES}]),/500 MB/)
})
