import { test } from 'node:test'
import assert from 'node:assert/strict'
import { authNextPath, loginErrorMessage, loginSuccessMessage } from './navigation.ts'

test('callback redirects reject external and browser-normalized destinations', () => {
  for (const value of [null, 'https://example.com', '//example.com', '/\\example.com', '@example.com', 'photos', '', '/\t/example.com', '/\n/example.com', '/\r/example.com', '/photos\u0000']) {
    assert.equal(authNextPath(value), '/photos')
  }
  // WHATWG URL parsing strips tab, LF and CR before resolving, so a control
  // character inside the path is how a single leading slash escapes the origin.
  for (const value of ['/\t/example.com', '/photos', '/%2F%2Fexample.com', '/reset-password?next=//x']) {
    assert.equal(new URL(authNextPath(value), 'https://tinesight.app').origin, 'https://tinesight.app')
  }
  assert.equal(authNextPath('/reset-password'), '/reset-password')
  assert.equal(authNextPath('/photos?triageView=all'), '/photos?triageView=all')
})

test('login feedback never displays arbitrary URL-supplied content', () => {
  for (const value of [null, 'Call this number to unlock your account', '<img src=x onerror=alert(1)>']) {
    assert.equal(loginSuccessMessage(value), null)
    assert.equal(loginErrorMessage(value), null)
  }
  assert.match(loginSuccessMessage('password-updated') ?? '', /Password updated successfully/)
  assert.match(loginErrorMessage('callback-failed') ?? '', /fresh link/)
  assert.match(loginErrorMessage('account-setup') ?? '', /profile/)
})
