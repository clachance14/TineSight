import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSwipe } from './swipe.ts'

const base = { width: 360, hasPrev: true, hasNext: true }

test('small slow drag returns to current', () => {
  assert.equal(resolveSwipe({ ...base, dx: -40, vx: 0 }), 'current')
})
test('drag past 50% distance advances to next', () => {
  assert.equal(resolveSwipe({ ...base, dx: -200, vx: 0 }), 'next')
})
test('fast flick advances even on a short drag', () => {
  assert.equal(resolveSwipe({ ...base, dx: -50, vx: -0.6 }), 'next')
})
test('drag right past threshold goes to prev', () => {
  assert.equal(resolveSwipe({ ...base, dx: 220, vx: 0 }), 'prev')
})
test('cannot go next at the end of the window (rubber-band)', () => {
  assert.equal(resolveSwipe({ ...base, hasNext: false, dx: -300, vx: -1 }), 'current')
})
test('cannot go prev at the start of the window', () => {
  assert.equal(resolveSwipe({ ...base, hasPrev: false, dx: 300, vx: 1 }), 'current')
})
