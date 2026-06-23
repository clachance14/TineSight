import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isIosSafari,
  isStandaloneDisplay,
  shouldShowInstallHint,
} from './install-detection.ts'

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'

test('isIosSafari: true for iPhone Safari', () => {
  assert.equal(isIosSafari(IPHONE_SAFARI, 'iPhone', 5), true)
})

test('isIosSafari: false for Chrome on iOS (CriOS) — cannot install PWAs', () => {
  assert.equal(isIosSafari(IPHONE_CHROME, 'iPhone', 5), false)
})

test('isIosSafari: true for iPadOS desktop-UA (MacIntel + touch)', () => {
  assert.equal(isIosSafari(MAC_SAFARI, 'MacIntel', 5), true)
})

test('isIosSafari: false for real Mac Safari (MacIntel, no touch)', () => {
  assert.equal(isIosSafari(MAC_SAFARI, 'MacIntel', 0), false)
})

test('isIosSafari: false for Android Chrome', () => {
  assert.equal(isIosSafari(ANDROID_CHROME, 'Linux armv8l', 5), false)
})

test('isStandaloneDisplay: true when media query matches', () => {
  assert.equal(isStandaloneDisplay(true, undefined), true)
})

test('isStandaloneDisplay: true when navigator.standalone is true', () => {
  assert.equal(isStandaloneDisplay(false, true), true)
})

test('isStandaloneDisplay: false when neither', () => {
  assert.equal(isStandaloneDisplay(false, false), false)
})

test('shouldShowInstallHint: true for fresh iPhone Safari in browser', () => {
  assert.equal(
    shouldShowInstallHint({
      userAgent: IPHONE_SAFARI,
      platform: 'iPhone',
      maxTouchPoints: 5,
      matchStandalone: false,
      navigatorStandalone: false,
      dismissed: false,
    }),
    true,
  )
})

test('shouldShowInstallHint: false when already dismissed', () => {
  assert.equal(
    shouldShowInstallHint({
      userAgent: IPHONE_SAFARI,
      platform: 'iPhone',
      maxTouchPoints: 5,
      matchStandalone: false,
      navigatorStandalone: false,
      dismissed: true,
    }),
    false,
  )
})

test('shouldShowInstallHint: false when already installed (standalone)', () => {
  assert.equal(
    shouldShowInstallHint({
      userAgent: IPHONE_SAFARI,
      platform: 'iPhone',
      maxTouchPoints: 5,
      matchStandalone: true,
      navigatorStandalone: true,
      dismissed: false,
    }),
    false,
  )
})
