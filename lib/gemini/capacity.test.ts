import test from 'node:test'
import assert from 'node:assert/strict'
import { boundedSetting, modelChain } from './capacity.ts'
test('deployment concurrency configuration is finite and bounded',()=>{
 assert.equal(boundedSetting('NaN',5,20),5);assert.equal(boundedSetting('500',5,20),20)
 assert.equal(boundedSetting('-3',5,20),1);assert.equal(boundedSetting('',5,20),5)
})
test('fallback configuration excludes retired models and caps fanout',()=>{
 assert.deepEqual(modelChain('gemini-2.5-flash'),['gemini-2.5-flash'])
 assert.deepEqual(modelChain('gemini-3-flash-preview','gemini-2.5-flash,gemini-2.5-flash'),['gemini-3-flash-preview','gemini-2.5-flash'])
 assert.throws(()=>modelChain('gemini-2.5-flash','gemini-2.0-flash'),/retired/)
 assert.throws(()=>modelChain('gemini-2.5-flash','gemini-1.5-flash'),/retired/)
 assert.throws(()=>modelChain('a','b,c'),/at most one/)
})
