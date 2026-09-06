import test from 'node:test'
import assert from 'node:assert/strict'
import { ExifWorkerPool } from './ExifWorkerPool.ts'

test('worker module failure rejects extraction instead of leaving preparation stuck', async () => {
  const workers: Array<{ onerror: ((event: {message: string}) => void) | null }> = []
  const previous = globalThis.Worker
  class FakeWorker {
    onerror: ((event: {message: string}) => void) | null = null
    onmessage = null
    constructor() { workers.push(this) }
    postMessage() {}
    terminate() {}
  }
  Object.assign(globalThis, { Worker: FakeWorker })
  const pool = new ExifWorkerPool(1)
  try {
    const pending = pool.extractExif('photo', new ArrayBuffer(1))
    workers[0]!.onerror!({message:'Worker module failed'})
    const result = await Promise.race([pending.then(()=>'resolved',()=> 'rejected'),new Promise(resolve=>setTimeout(()=>resolve('stuck'),50))])
    assert.equal(result, 'rejected')
    assert.equal(pool.getStats().pendingTasks,0)
  } finally {
    pool.terminate()
    Object.assign(globalThis, { Worker: previous })
  }
})

 test('worker deadline terminates pool so later files immediately fall back', async t => {
  const previous = globalThis.Worker
  class FakeWorker { onerror = null; onmessage = null; postMessage() {}; terminate() {} }
  Object.assign(globalThis, { Worker: FakeWorker })
  const originalTimeout = globalThis.setTimeout
  t.mock.method(globalThis, 'setTimeout', (callback: (...args: unknown[]) => void, _delay?: number, ...args: unknown[]) => originalTimeout(callback, 0, ...args))
  const pool = new ExifWorkerPool(1)
  try {
    await assert.rejects(pool.extractExif('first', new ArrayBuffer(1)), /timed out/)
    assert.equal(pool.getStats().isTerminated, true)
    await assert.rejects(pool.extractExif('second', new ArrayBuffer(1)), /terminated/)
    assert.equal(pool.getStats().pendingTasks, 0)
  } finally { pool.terminate(); Object.assign(globalThis, { Worker: previous }) }
})
