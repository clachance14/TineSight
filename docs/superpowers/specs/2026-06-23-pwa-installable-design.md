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

Next.js serves this at `/manifest.webmanifest` (verify the emitted route + the
`<link rel="manifest">` in `next build` output — do not assume). Fields:

- `name: "TineSight"`, `short_name: "TineSight"`
- `description`: reuse the product one-liner.
- `display: "standalone"` — removes browser chrome when installed (the native
  feel). NOT true fullscreen: the OS status/nav bars remain.
- `start_url: "/"`, `scope: "/"`, `id: "/"` (stable installed-app identity even if
  `start_url` later changes).
- `background_color: "#232B2D"`, `theme_color: "#232B2D"` (forest bg from DESIGN.md).
- `icons`: reference the generated PNGs — `icon-192.png` and `icon-512.png` with
  `purpose: "any"`, plus a dedicated `icon-512-maskable.png` with `purpose:
  "maskable"`. Separate maskable file so Android masking can't clip the antler
  (the `any` icons keep full artwork; the maskable one has extra safe-area padding).

Note: HTTPS is required off-localhost (we have it via Vercel). Asset/manifest
paths are absolute (`/icons/...`, `/`, `/manifest.webmanifest`) — fine unless a
`basePath` is ever introduced (none today).

### 2. Branded icon — generated with `sharp`

`sharp` is already a dependency (image-variant pipeline), so no new install.

- A generator script `scripts/generate-pwa-icons.mjs` rasterizes an inline SVG to
  PNGs. It does **not** import `./env.mjs` — this is pure asset generation and must
  not require DB/API secrets (would needlessly fail CI/local runs).
- Icon design: forest `#232B2D` rounded-square background with a simple
  **tine/antler mark** in score-gold `#D6B16F` (per DESIGN.md palette). Keep the
  mark within the center ~80% so the maskable variant survives Android cropping.
- Outputs **committed** to `public/icons/` (so a missing `node` step can never ship
  a broken manifest):
  - `icon-192.png` (192×192, `purpose: any`)
  - `icon-512.png` (512×512, `purpose: any`)
  - `icon-512-maskable.png` (512×512, extra safe-area padding, `purpose: maskable`)
  - `apple-touch-icon-180.png` (180×180, opaque bg — iOS ignores transparency)
- Re-runnable so the icon can be tweaked or replaced with a real logo later.

### 3. iOS metadata + install hint

- In `app/layout.tsx`, extend the `metadata` export with `manifest:
  "/manifest.webmanifest"`, `appleWebApp: { capable: true, statusBarStyle:
  "default", title: "TineSight" }`, and `icons` (incl. `apple-touch-icon`). Add a
  separate `viewport` export (`export const viewport: Viewport`) with `themeColor:
  "#232B2D"` — `themeColor` belongs in `viewport`, not `metadata`, in Next 16.
  `appleWebApp.capable` makes iPhone launch the app in standalone mode.
  - **Build-time verification:** confirm the rendered `<head>` actually emits
    `apple-mobile-web-app-capable`. If Next omits it, add it via `metadata.other`.
- A small dismissible **"Install TineSight" hint** component, rendered client-side
  only when ALL of:
  - the browser is **real iOS Safari** — detect iOS (`/iPad|iPhone|iPod/` on UA,
    PLUS the iPadOS desktop-UA case: `navigator.platform === "MacIntel" &&
    navigator.maxTouchPoints > 1`) AND **exclude in-app browsers that can't install
    PWAs** (`CriOS` Chrome, `FxiOS` Firefox, `EdgiOS` Edge → no hint), AND
  - the app is **not already in standalone mode**
    (`window.navigator.standalone !== true` and the `display-mode: standalone`
    media query is false), AND
  - the user hasn't dismissed it before (`localStorage` flag, read/written inside a
    **`try/catch`** — Safari private mode throws on `localStorage` and must not
    crash hydration).
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
- Against the running dev/prod server, assert:
  - `GET /manifest.webmanifest` → 200, valid JSON, expected fields present.
  - Every icon URL in the manifest → 200 (`/icons/icon-192.png`, `icon-512.png`,
    `icon-512-maskable.png`, `apple-touch-icon-180.png`).
  - Rendered `<head>` contains the `manifest` link, `apple-mobile-web-app-capable`,
    `apple-mobile-web-app-title`, and the `theme-color` meta.
- All four icon files exist under `public/icons/` and are committed.
- Manual: on the user's iPhone via Safari — Share → Add to Home Screen → launch →
  confirm standalone (no Safari address bar) and correct icon. Confirm the install
  hint shows in Safari and is absent in standalone mode and in Chrome-on-iOS.

## Known limitations (documented, accepted)

- Android's *automatic* install banner (`beforeinstallprompt`) requires a service
  worker with a fetch handler; install-only has none, so Android users install via
  the Chrome menu manually. Acceptable for this scope; revisited when offline shell
  is added.
- No offline support — the app needs network exactly as the site does today.
