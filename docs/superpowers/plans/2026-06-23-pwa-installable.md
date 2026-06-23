# PWA (Installable) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing TineSight Next.js web app installable to the iPhone/Android home screen so it launches in standalone mode (browser chrome removed) like a native app.

**Architecture:** Pure install-only PWA using the Next.js 16 native Metadata API — an `app/manifest.ts` route, branded PNG icons generated with `sharp`, `appleWebApp`/`viewport` metadata in the root layout, and a small client-side "Add to Home Screen" hint shown only to real iOS Safari. No service worker, no offline caching, no new runtime dependencies.

**Tech Stack:** Next.js 16.1 (App Router), React 19, TypeScript 5 (strict, `exactOptionalPropertyTypes`), `sharp@0.34.5` (build-time icon raster), `node:test` (unit tests per ADR 0002).

Spec: `docs/superpowers/specs/2026-06-23-pwa-installable-design.md`

---

## File Structure

- `lib/pwa/install-detection.ts` — **new.** Pure functions deciding whether to show the iOS install hint. No DOM/React — takes plain browser signals as args so it is unit-testable.
- `lib/pwa/install-detection.test.ts` — **new.** `node:test` unit tests for the pure functions.
- `scripts/generate-pwa-icons.mjs` — **new.** Build-time script: rasterizes an inline antler SVG to the four icon PNGs. No `env.mjs` import (pure asset generation).
- `public/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon-180.png` — **new (committed).** Generated, committed so a missing `node` step can never ship a broken manifest.
- `app/manifest.ts` — **new.** Next.js serves it at `/manifest.webmanifest`.
- `app/layout.tsx` — **modify.** Extend `metadata`, add a `viewport` export, render `<InstallHint />`.
- `components/pwa/install-hint.tsx` — **new.** `'use client'` component that gathers browser signals, calls the pure detection fn, and renders the dismissible banner.

---

## Task 1: Pure iOS-install detection module (TDD)

**Files:**
- Create: `lib/pwa/install-detection.ts`
- Test: `lib/pwa/install-detection.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/pwa/install-detection.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test lib/pwa/install-detection.test.ts`
Expected: FAIL — cannot resolve `./install-detection.ts` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `lib/pwa/install-detection.ts`:

```ts
/**
 * Pure, DOM-free logic for the iOS "Add to Home Screen" hint.
 * Browser signals are passed in as plain values so this is unit-testable.
 */

export interface InstallHintEnv {
  /** navigator.userAgent */
  userAgent: string
  /** navigator.platform (deprecated but still needed for iPadOS detection) */
  platform: string
  /** navigator.maxTouchPoints */
  maxTouchPoints: number
  /** window.matchMedia('(display-mode: standalone)').matches */
  matchStandalone: boolean
  /** navigator.standalone (iOS Safari only; undefined elsewhere) */
  navigatorStandalone: boolean | undefined
  /** persisted dismissal flag */
  dismissed: boolean
}

/**
 * True only for real iOS Safari (the one browser that can install a PWA on iOS).
 * Excludes Chrome/Firefox/Edge/Opera on iOS, which cannot. Handles the iPadOS
 * desktop user-agent case (reports as MacIntel with touch points).
 */
export function isIosSafari(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
): boolean {
  const isIDevice = /iPad|iPhone|iPod/.test(userAgent)
  const isIpadOsDesktop = platform === 'MacIntel' && maxTouchPoints > 1
  if (!isIDevice && !isIpadOsDesktop) return false

  // Other iOS browsers cannot install PWAs — never show them the hint.
  const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|mercury/i.test(userAgent)
  return !isOtherIosBrowser
}

/** True if the app is already running as an installed standalone PWA. */
export function isStandaloneDisplay(
  matchStandalone: boolean,
  navigatorStandalone: boolean | undefined,
): boolean {
  return matchStandalone || navigatorStandalone === true
}

/** Final decision: show the hint only for fresh, in-browser iOS Safari. */
export function shouldShowInstallHint(env: InstallHintEnv): boolean {
  if (env.dismissed) return false
  if (isStandaloneDisplay(env.matchStandalone, env.navigatorStandalone)) {
    return false
  }
  return isIosSafari(env.userAgent, env.platform, env.maxTouchPoints)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test lib/pwa/install-detection.test.ts`
Expected: PASS — all 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/pwa/install-detection.ts lib/pwa/install-detection.test.ts
git commit -m "feat(pwa): pure iOS install-hint detection + unit tests"
```

---

## Task 2: Icon generator script + committed PNGs

**Files:**
- Create: `scripts/generate-pwa-icons.mjs`
- Create (generated, committed): `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-512-maskable.png`, `public/icons/apple-touch-icon-180.png`

- [ ] **Step 1: Write the generator script**

Create `scripts/generate-pwa-icons.mjs` (note: NO `import './env.mjs'` — this is pure asset generation and must not require DB/API secrets):

```js
// Generates PWA icons from an inline antler SVG. Re-run any time the mark changes:
//   node scripts/generate-pwa-icons.mjs
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const BG = '#232B2D' // forest (DESIGN.md)
const GOLD = '#D6B16F' // score-gold (DESIGN.md)
const OUT_DIR = path.join(process.cwd(), 'public', 'icons')

// Stylized symmetric buck antlers in a 100x100 space, drawn as strokes.
// Left side only; mirrored at render time across x=50.
const ANTLER_LEFT = [
  'M50 82 C 45 64, 40 52, 33 40 C 30 35, 26 29, 21 24', // main beam -> tip
  'M47 72 C 45 66, 43 63, 39 59', // brow tine
  'M43 57 C 45 51, 47 47, 48 41', // inner tine
  'M36 45 C 35 38, 33 33, 30 27', // mid tine
].join(' ')

function svg({ size, markScale, radius }) {
  const offset = (100 * (1 - markScale)) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect x="0" y="0" width="100" height="100" rx="${radius}" fill="${BG}"/>
  <g transform="translate(${offset} ${offset}) scale(${markScale})" fill="none" stroke="${GOLD}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <path d="${ANTLER_LEFT}"/>
    <g transform="translate(100 0) scale(-1 1)"><path d="${ANTLER_LEFT}"/></g>
  </g>
</svg>`
}

async function render(name, opts) {
  const buf = Buffer.from(svg(opts))
  const out = path.join(OUT_DIR, name)
  await sharp(buf).png().toFile(out)
  console.log('wrote', out)
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  // `any` icons: rounded bg, generous mark
  await render('icon-192.png', { size: 192, markScale: 0.92, radius: 22 })
  await render('icon-512.png', { size: 512, markScale: 0.92, radius: 22 })
  // maskable: full-bleed square (OS applies the mask), mark inside the safe zone
  await render('icon-512-maskable.png', { size: 512, markScale: 0.62, radius: 0 })
  // apple-touch: opaque square, iOS rounds it; mark generous
  await render('apple-touch-icon-180.png', { size: 180, markScale: 0.86, radius: 0 })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Run the generator**

Run: `node scripts/generate-pwa-icons.mjs`
Expected output:
```
wrote .../public/icons/icon-192.png
wrote .../public/icons/icon-512.png
wrote .../public/icons/icon-512-maskable.png
wrote .../public/icons/apple-touch-icon-180.png
```

- [ ] **Step 3: Verify the files exist and are valid PNGs of the right size**

Run: `node -e "const s=require('sharp'); for (const f of ['icon-192','icon-512','icon-512-maskable','apple-touch-icon-180']) s('public/icons/'+f+'.png').metadata().then(m=>console.log(f, m.width+'x'+m.height, m.format))"`
Expected:
```
icon-192 192x192 png
icon-512 512x512 png
icon-512-maskable 512x512 png
apple-touch-icon-180 180x180 png
```

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-pwa-icons.mjs public/icons/
git commit -m "feat(pwa): branded antler icon generator + committed PNG assets"
```

---

## Task 3: Web app manifest route

**Files:**
- Create: `app/manifest.ts`

- [ ] **Step 1: Write the manifest**

Create `app/manifest.ts`:

```ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TineSight',
    short_name: 'TineSight',
    description:
      'Build a catalog of trophy bucks using AI-powered re-identification for your hunting lease.',
    start_url: '/',
    scope: '/',
    id: '/',
    display: 'standalone',
    background_color: '#232B2D',
    theme_color: '#232B2D',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
```

Note: if `tsc` rejects the `id` field on `MetadataRoute.Manifest` (older type defs), keep it — it is valid web-app-manifest. If and only if type-check fails on it, drop the `id` line (it is a nice-to-have, not required). Re-run type-check after.

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS (no new errors).

- [ ] **Step 3: Commit**

```bash
git add app/manifest.ts
git commit -m "feat(pwa): app manifest route (/manifest.webmanifest)"
```

---

## Task 4: Root layout metadata + viewport

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update imports and metadata, add viewport export**

In `app/layout.tsx`, change the type import line:

```ts
import type { Metadata } from 'next'
```

to:

```ts
import type { Metadata, Viewport } from 'next'
```

Then replace the existing `metadata` export:

```ts
export const metadata: Metadata = {
  title: 'TineSight - AI-Powered Deer Tracking',
  description: 'Build a catalog of trophy bucks using AI-powered re-identification for your hunting lease.',
}
```

with:

```ts
export const metadata: Metadata = {
  title: 'TineSight - AI-Powered Deer Tracking',
  description:
    'Build a catalog of trophy bucks using AI-powered re-identification for your hunting lease.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'TineSight',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon-180.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: '#232B2D',
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(pwa): manifest + appleWebApp + theme-color metadata in root layout"
```

---

## Task 5: iOS install-hint component + wiring

**Files:**
- Create: `components/pwa/install-hint.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Write the component**

Create `components/pwa/install-hint.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { shouldShowInstallHint } from '@/lib/pwa/install-detection'

const DISMISS_KEY = 'tinesight:pwa-install-hint-dismissed'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    // Safari private mode throws on localStorage access — treat as not dismissed.
    return false
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // Ignore — non-persistent dismissal is acceptable.
  }
}

export function InstallHint() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean }
    setShow(
      shouldShowInstallHint({
        userAgent: nav.userAgent,
        platform: nav.platform,
        maxTouchPoints: nav.maxTouchPoints,
        matchStandalone: window.matchMedia('(display-mode: standalone)').matches,
        navigatorStandalone: nav.standalone,
        dismissed: readDismissed(),
      }),
    )
  }, [])

  if (!show) return null

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 rounded-xl border border-brass/30 bg-forest/95 px-4 py-3 text-sm text-parchment shadow-lg backdrop-blur supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <span className="flex-1 leading-snug">
        Install TineSight: tap{' '}
        <span className="font-semibold text-score">Share</span>, then{' '}
        <span className="font-semibold text-score">Add to Home Screen</span>.
      </span>
      <button
        type="button"
        aria-label="Dismiss install hint"
        onClick={() => {
          writeDismissed()
          setShow(false)
        }}
        className="-mr-1 shrink-0 rounded-md px-2 py-1 text-parchment/70 hover:text-parchment"
      >
        ✕
      </button>
    </div>
  )
}
```

Note on classes: this reuses palette tokens already used elsewhere (`bg-forest`, `border-brass`, `text-parchment` appear in `app/layout.tsx`'s Toaster). `text-score` is the score-gold token. If `text-score` is not defined in the Tailwind config, substitute the score-gold token name used in `DESIGN.md`/`tailwind.config` (search: `grep -rn "D6B16F" tailwind.config.* app/globals.css`); do NOT invent a class.

- [ ] **Step 2: Wire it into the root layout**

In `app/layout.tsx`, add the import near the other component imports:

```ts
import { InstallHint } from '@/components/pwa/install-hint'
```

Then render it inside `<Providers>`, right after the existing `<Toaster ... />`:

```tsx
        <Providers>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: 'bg-forest border-brass/20 text-parchment',
            }}
          />
          <InstallHint />
        </Providers>
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/pwa/install-hint.tsx app/layout.tsx
git commit -m "feat(pwa): dismissible iOS Add-to-Home-Screen hint"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Unit tests green**

Run: `npm run test:unit`
Expected: all tests pass, including the 11 in `lib/pwa/install-detection.test.ts`.

- [ ] **Step 2: Type-check green**

Run: `npm run type-check`
Expected: PASS (no errors).

- [ ] **Step 3: Production build green**

Run: `npm run build`
Expected: build succeeds. In the route list, confirm a `/manifest.webmanifest` entry appears.

- [ ] **Step 4: Manifest + icons serve correctly**

Start the server in one shell: `npm run dev`
Then in another shell:

Run: `curl -s localhost:3000/manifest.webmanifest`
Expected: valid JSON containing `"display":"standalone"`, `"scope":"/"`, and the three icon entries.

Run: `for f in icon-192 icon-512 icon-512-maskable apple-touch-icon-180; do curl -s -o /dev/null -w "$f %{http_code} %{content_type}\n" localhost:3000/icons/$f.png; done`
Expected: each line ends `200 image/png`.

- [ ] **Step 5: Head tags emitted**

Run: `curl -s localhost:3000/ | grep -ioE '<link[^>]*rel="manifest"[^>]*>|<meta[^>]*apple-mobile-web-app-capable[^>]*>|<meta[^>]*name="theme-color"[^>]*>|<meta[^>]*apple-mobile-web-app-title[^>]*>'`
Expected: lines for the manifest link, `apple-mobile-web-app-capable`, `theme-color`, and `apple-mobile-web-app-title`.
If `apple-mobile-web-app-capable` is MISSING from the output, add it explicitly via `metadata.other = { 'apple-mobile-web-app-capable': 'yes' }` in `app/layout.tsx`, re-run the build, and re-check.

- [ ] **Step 6: Manual device check (user)**

On the user's iPhone in **Safari**: load the deployed URL → Share → Add to Home Screen → open the new icon. Confirm: launches with no Safari address bar (standalone), the antler icon is correct, and the install hint appears in Safari but NOT inside the installed app.

- [ ] **Step 7: Final commit (if Step 5 required the `metadata.other` fallback)**

```bash
git add app/layout.tsx
git commit -m "fix(pwa): emit apple-mobile-web-app-capable explicitly"
```

---

## Self-Review notes

- **Spec coverage:** manifest (Task 3), icons incl. separate maskable (Task 2), `scope`/`id` (Task 3), `themeColor` in `viewport` (Task 4), `appleWebApp` (Task 4), iOS-Safari-only hint with in-app-browser exclusion + iPadOS case (Task 1/5), `localStorage` try/catch (Task 5), robust verification incl. manifest/icon 200s + head tags (Task 6). All spec items mapped.
- **Type consistency:** `InstallHintEnv` fields (`userAgent`, `platform`, `maxTouchPoints`, `matchStandalone`, `navigatorStandalone`, `dismissed`) are identical across the test (Task 1), implementation (Task 1), and the component call site (Task 5). Function names `isIosSafari` / `isStandaloneDisplay` / `shouldShowInstallHint` are consistent throughout.
- **Strict TS:** `navigatorStandalone: boolean | undefined` is a required key whose value may be `undefined` — avoids the `exactOptionalPropertyTypes` pitfall (no optional `?` prop receiving explicit `undefined`).

---

## Execution Strategy

**MANDATORY: Use multi-agent parallel execution**

1. Analyze dependencies - identify independent vs dependent tasks
2. Group into parallel batches - cluster independent tasks
3. Execute with up to 5 agents in parallel via Task tool
4. Serialize only when dependencies require it

See CLAUDE.md "Execution Preferences" for parallelization rules.
