# UI/UX Score Loop — Findings Log

**Date:** 2026-06-22
**Goal:** Goal 2 of the app-improvement program — "UI/UX works + user-friendly."
**Loop:** Forward Future UI/UX Score loop (`loops/ui-ux-score-loop/`).
**Method:** gstack `browse` (headless Chromium), viewport **390×844** (mobile-portrait primary), dark mode. Desktop (1280×720) as secondary spot-check.
**Auth:** logged in as `clachance14@hotmail.com` directly inside the headless session (form-fill, not cookie import). Session token `sb-fdwgmtzdjywvrnipatlk-auth-token` present.
**Checklist anchor:** `MVP Documents/TineSight_Design_System.md` v1.0 (Dec 2025). NOTE: doc predates the June mobile-core hardening, so divergences are logged as findings, not auto-applied.

## Severity scale
- **P0** — broken / blocks the journey (crash, dead end, data loss, unusable on mobile)
- **P1** — major friction or clear design-system violation a user will notice
- **P2** — polish / minor divergence / nice-to-have
- **OK** — verified working, no action

## Journeys
1. signup → login — **DONE** (fixes applied previous session, uncommitted)
2. upload → process
3. grid / lightbox
4. re-ID a buck (North Star)
5. Showcase create / share / revoke

---

## Journey 1 — signup → login (recap, from prior session)

Status: **fixes applied, uncommitted on branch `security/harden-definer-functions`.**

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| J1-1 | P1 | Signup page rendered a bare form — no `<h1>`, no brand header, not centered | Added centered layout + `<h1>TineSight</h1>` + tagline in `app/(auth)/signup/page.tsx` |
| J1-2 | P1 | Signup success was a dead-end "Check your email" card | Redirect to `/login?signup=success` (`signup-form.tsx`) |
| J1-3 | P1 | No confirmation of successful signup on login | Green success banner reading `?signup=success` (`login-form.tsx`) |
| J1-4 | P1 | Submit buttons below 44px touch target | Bumped login + signup submit buttons to `h-11` (~44px) |

---

## Journey 2 — upload → process

Route: `/upload`. Tested at 390×844. Both tabs (Bulk / Simple) and the dropzones render correctly; no console errors. Screenshots: `/tmp/uiux/j2-upload-clean.png`, `/tmp/uiux/j2-simple-upload.png`.

| # | Severity | Finding | Evidence | Proposed fix |
|---|----------|---------|----------|--------------|
| J2-1 | **P1** | Multiple touch targets below the 44px minimum (design §9.5) on mobile: Upload-method tabs **29px**, Select Folder/Files **36px**, header hamburger **36px**, avatar **40px**, "View Photos" **40px** | `getBoundingClientRect().height` measured live | Bump tab triggers + buttons + header controls to ≥44px (h-11) on mobile |
| J2-2 | P2 | "View Photos" button visually crowds the header description text at 390px (sits over the wrapping "...for AI processing" line) | `/tmp/uiux/j2-upload-clean.png` | Stack header action below the description on mobile, or shrink |
| J2-3 | OK | "Throttle Metrics" debug panel is correctly gated to `NODE_ENV==='development'` (`components/debug/throttle-metrics-panel.tsx:34`) — will NOT ship to users. (Occludes the header during dev QA only.) | code read | none |
| J2-4 | P2 | Mobile bottom nav has 3 tabs (Photos / Deer / Cameras); design doc §6.7 specifies 4 (Photos / Deer / Review / Profile). App reality diverged from the doc. | screenshot | Decide: update doc, or add Review/Profile tabs (product call) |

**Not exercised:** live upload → AI processing. Firing it triggers real Trigger.dev jobs + Gemini cost and writes junk photos to the real account. UI affordances verified up to file selection. **Needs user OK to run a real end-to-end upload.**

## Journey 3 — grid / lightbox

Route: `/photos` (708 photos, real data). Lightbox = navigates to `/photos/[id]` detail page (not an in-place modal). No console errors.

### J3-1 — **P0 — virtualized grid rows overlapped, hiding the subject of every photo** ✅ FIXED
**Symptom (user-reported, desktop):** thumbnails showed only a thin top band — sky / feeder-tops / treetops — with the deer (low in trail-cam frames) cropped out. Tiles looked like wide letterbox strips.

**Diagnosis (live DOM, 1440px):** scroll container 1136px wide → should be 5 columns, but `gridTemplateColumns` was stuck at **2**; row `height` stuck at **180px** with rows stepped 180px apart (translateY 0/180/360…), while tiles actually rendered **565×565**. Rows overlapped by ~**385px**; only a ~180px slice of each photo was visible before the next row painted over it. `object-cover` centers vertically, so the buck got buried.

**Root cause:** `components/photos/photo-grid.tsx` measured width in a `useLayoutEffect` reading `scrollRef.current`, but the `isLoading` / empty / error early-returns don't render the scroll container, so on first render the ref was null, the effect bailed (`if (!el) return`), and with `[]` deps it never re-ran once the real grid mounted. `columns` stayed at its initial `2` and `rowHeight` at `180` permanently. Mobile masked it (2 cols is correct there; 192 vs 180 ≈ tiny overlap); desktop was catastrophic.

**Fix:** replaced the `useLayoutEffect`+`useRef` measurement with a **callback ref** (`setScrollEl`) that runs measurement + attaches a `ResizeObserver` exactly when the scroll node mounts/unmounts. Also split `itemSize` (square tile edge) from `rowHeight` (tile + 6px gap = virtualizer step) so rows get a real gap instead of a 6px vertical stretch.

**Verified:** type-check green. Desktop 1440px → **5 cols, 222×222 squares**, rows stepped 228px, no overlap, full frame (deer) visible (`/tmp/uiux/j3-desktop-FIXED.png`). Mobile 390px → **2 cols, 176×176**, stepped 182px, no overlap (`/tmp/uiux/j3-mobile-FIXED.png`). Before: `/tmp/uiux/j3-desktop-grid.png`.

### Other Journey 3 findings
| # | Severity | Finding | Note |
|---|----------|---------|------|
| J3-2 | P2 | Thumbnails are 16:9 source shown in 1:1 squares (`object-cover` center). Center-crop is correct now, but trail-cam subjects near a horizontal edge can still be clipped. Design §7.3 specs 4:3 tiles. | Consider 4:3 tiles, or keep square (acceptable) |
| J3-3 | P2 | No classification badge (🦌 Buck / confidence %) overlaid on tiles, though data exists (detail page shows "Deer 98%"). Design §7.3 calls for it. | Add badge overlay |
| J3-4 | OK | All 14 first-page thumbnails load (`complete:true`), distinct content, served from Supabase `thumbnails/{id}.webp`. Variant pipeline (ADR 0003) working. | none |

**Codex spot-check (J3-1):** reviewed the `photo-grid.tsx` diff — *"No real issues found."* Confirmed callback ref re-measures on mount, ResizeObserver disconnected on ref replacement/unmount, no stale closure, virtualizer `getScrollElement` re-attaches correctly, itemSize/rowHeight split correct.
