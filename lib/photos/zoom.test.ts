import test from 'node:test'
import assert from 'node:assert/strict'
import { clampPhotoZoom, zoomPhotoAt, fitPhoto } from './zoom.ts'
const bounds={width:800,height:600,imageWidth:800,imageHeight:400}
test('zoom anchors the image point under the cursor',()=>{
  const next=zoomPhotoAt(fitPhoto,2,{x:100,y:50},bounds)
  assert.deepEqual(next,{scale:2,x:-100,y:-50})
  assert.equal((100-next.x)/next.scale,100)
})
test('pan uses actual contained image edges, including letterboxing',()=>{
  assert.deepEqual(clampPhotoZoom({scale:2,x:900,y:-900},bounds),{scale:2,x:400,y:-100})
  assert.deepEqual(clampPhotoZoom({scale:1.2,x:0,y:50},bounds),{scale:1.2,x:0,y:0})
})
test('reset fits the image and maximum magnification is bounded',()=>{
  assert.deepEqual(zoomPhotoAt({scale:3,x:200,y:-100},.5,{x:50,y:20},bounds),fitPhoto)
  assert.equal(zoomPhotoAt(fitPhoto,20,{x:0,y:0},bounds).scale,5)
})
