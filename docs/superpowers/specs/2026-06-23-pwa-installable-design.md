# PWA (Installable) — Design

**Date:** 2026-06-23
**Status:** Approved
**Scope:** Make TineSight installable to the home screen on iPhone and Android,
opening fullscreen like a native app. **Install-only** — no offline data caching,
no service worker.

## Goal

Let a hunting-lease operator install the existing mobile-first Next.js web app to
their phone home screen so it launches fullscreen (no browser chrome) and feels
like a native app. Primary target device: iPhone (Safari). Secondary: Android
(Chrome).

Non-goals (explicitly deferred):

- Offline data/photo caching and service worker (future: "+ offline shell", then
  "full offline data").
- App Store / Play Store distribution (future: Capacitor + cloud iOS build).
- Push notifications.

## Approach

Use the **Next.js 16 native Metadata API** — built-in special files generate the
manifest and icon links. No new runtime dependencies and no service worker, which
is all that install-only requires. (`next-pwa` / `@serwist/next` are rejected:
they exist to manage service workers / offline caching, which is out of scope.)

## Components

### 1. Web app manifest — `app/manifest.ts`

Next.js serves this at `/manifest.webmanifest`. Fields:

- `name: "TineSight"`, `short_name: "TineSight"`
- `description`: reuse the product one-liner.
- `display: "standalone"` — fullscreen, no browser bar (the native feel).
- `start_url: "/"`
- `background_color: "#232B2D"`, `theme_color: "#232B2D"` (forest bg from DESIGN.md).
- `icons`: reference the generated PNGs (192, 512; 512 also marked `purpose:
  "maskable"` so Android masks it cleanly).

### 2. Branded icon — generated with `sharp`

`sharp` is already a dependency (image-variant pipeline), so no new install.

- A throwaway generator script `scripts/generate-pwa-icons.mjs` (loads
  `./env.mjs` first per repo convention) rasterizes an inline SVG to PNGs.
- Icon design: forest `#232B2D` rounded-square background with a simple
  **tine/antler mark** in score-gold `#D6B16F` (per DESIGN.md palette).
- Outputs committed to `public/icons/`:
  - `icon-192.png` (192×192)
  - `icon-512.png` (512×512)
  - `apple-touch-icon-180.png` (180×180, opaque bg — iOS ignores transparency)
- Re-runnable so the icon can be tweaked or replaced with a real logo later.

### 3. iOS metadata + install hint

- In `app/layout.tsx`, extend the `metadata` export with `manifest:
  "/manifest.webmanifest"`, `appleWebApp: { capable: true, statusBarStyle:
  "default", title: "TineSight" }`, and `icons` (incl. `apple-touch-icon`). Add a
  `viewport` export with `themeColor: "#232B2D"`. `appleWebApp.capable` is what
  makes iPhone launch the app fullscreen.
- A small dismissible **"Install TineSight" hint** component, rendered client-side
  only when:
  - the browser is **iOS Safari**, AND
  - the app is **not already in standalone mode**
    (`window.navigator.standalone !== true` and the `display-mode: standalone`
    media query is false), AND
  - the user hasn't dismissed it before (`localStorage` flag).
  - Content: "Install TineSight — tap Share, then 'Add to Home Screen'." Styled
    per DESIGN.md (forest surface, brass border, cream text). Dismiss "×" sets the
    localStorage flag.
- Android needs no hint for install-only (manual add via Chrome menu); the hint is
  iOS-specific because iOS hides the flow.

## Data flow

Static only. The manifest and icons are served as static assets; the install hint
reads/writes a single `localStorage` key client-side. No API, no DB, no auth
changes.

## Error handling

- Install hint is purely additive and fail-safe: if feature detection is uncertain
  it simply does not render. No throw paths.
- Icon generation is a build-time/dev script; failures surface as missing files
  caught by the build verification step.

## Testing & verification (per ADR 0002)

- `npm run type-check` green (the real gate).
- `npm run build` green.
- Confirm `/manifest.webmanifest` serves valid JSON and the three icon files exist
  under `public/icons/`.
- Manual: on the user's iPhone via Safari — Share → Add to Home Screen → launch →
  confirm fullscreen (no Safari bar) and correct icon. Confirm the install hint
  shows in Safari and not in standalone mode.

## Known limitations (documented, accepted)

- Android's *automatic* install banner (`beforeinstallprompt`) requires a service
  worker with a fetch handler; install-only has none, so Android users install via
  the Chrome menu manually. Acceptable for this scope; revisited when offline shell
  is added.
- No offline support — the app needs network exactly as the site does today.
