import test from 'node:test'
import assert from 'node:assert/strict'
import { hashPhotoContent } from './content-hash.ts'

test('same camera filename and byte count do not equate different original content',async()=>{
  const first=new File(['abc'],'IMG0001.JPG'),second=new File(['def'],'IMG0001.JPG')
  assert.equal(first.name,second.name);assert.equal(first.size,second.size)
  assert.notEqual(await hashPhotoContent(first),await hashPhotoContent(second))
})
test('reselecting the same original yields the same identity, including renamed copies',async()=>{
  assert.equal(await hashPhotoContent(new File(['abc'],'IMG0001.JPG')),await hashPhotoContent(new File(['abc'],'other.JPG')))
})
