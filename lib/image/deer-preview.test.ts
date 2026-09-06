import test from 'node:test'
import assert from 'node:assert/strict'
import { deerPreviewFrame } from './deer-preview.ts'
test('frames an off-center deer using actual image aspect ratio',()=>{
  const frame=deerPreviewFrame({bboxX:7500,bboxY:5000,bboxWidth:2000,bboxHeight:4000},1200,800,220,176)
  assert(frame)
  assert(Math.abs(frame.left+900*(frame.width/1200)-110)<.001)
  assert(Math.abs(frame.top+400*(frame.height/800)-88)<.001)
})
test('invalid or missing detection coordinates show the whole preview',()=>{
  assert.equal(deerPreviewFrame({bboxX:null,bboxY:5000,bboxWidth:2000,bboxHeight:4000},1200,800,220,176),null)
  assert.equal(deerPreviewFrame({bboxX:5000,bboxY:5000,bboxWidth:0,bboxHeight:4000},1200,800,220,176),null)
})
test('regions crossing photo edges are clamped to existing image pixels',()=>{
  const frame=deerPreviewFrame({bboxX:0,bboxY:5000,bboxWidth:4000,bboxHeight:10000},1000,1000,200,200)
  assert(frame)
  assert.equal(frame.height,200)
  assert.equal(frame.top,0)
  assert.equal(frame.left,72)
})
