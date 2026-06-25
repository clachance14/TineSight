# Mobile Photo Pager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make photo-to-photo navigation on the mobile photo detail view feel native — the **photo zone** becomes a finger-following horizontal pager (drag tracks the thumb, snaps on distance + velocity, preloads neighbors) while the **info zone** (metadata strip + detections panel) stays put and simply swaps to the new photo's data. No full route reload per swipe.

**Architecture:** Today `/photos/[id]` is a server component that loads one photo (medium + full-res signed URLs, detections, `prevId`/`nextId` over the filtered set) and renders everything server-side; a swipe does `router.push` (full reload). This plan: (1) extract a shared `loadPhotoView()` server function returning a `PhotoViewDTO`, used by both the page and a new JSON route handler; (2) a client `PhotoViewer` owns the current DTO as state and renders the photo zone (mobile pager / desktop static) plus the info zone from that state; (3) the pager preloads `±1` neighbor DTOs via the route handler, follows the finger, snaps, prunes the window to `±1` medium images (ADR 0003 memory budget), and shallow-updates the URL via `history.replaceState`.

**Tech Stack:** Next.js 16.1 App Router (server components + Route Handlers), React 19, TypeScript 5 strict (`exactOptionalPropertyTypes`), Zustand (existing), plain `<img>` for signed Supabase URLs (`images.unoptimized: true` globally; next/image renders blank on signed URLs — see [[nextimage-signed-crop-urls]]), `node:test` (ADR 0002).

Design context: this was scoped in conversation on 2026-06-24 — "finger-follow on the photo only; the rest of the info stays the same." Palette tokens per [[palette-token-drift]] (`app/globals.css`).

---

## File Structure

- `lib/services/photo-view.ts` — **new.** `loadPhotoView(userId, id, filters)` → `PhotoViewDTO` (metadata + normalized detections + signed `imageUrl`/`fullResUrl` + `prevId`/`nextId`). DRY core reused by the page and the API. Plus a pure helper `resolveSwipe()` (unit-tested) for snap decisions.
- `lib/services/photo-view.test.ts` — **new.** `node:test` for `resolveSwipe()`.
- `app/api/photos/[id]/view/route.ts` — **new.** Auth-gated GET returning `PhotoViewDTO` JSON for one id (+ filters). The pager calls this to prefetch neighbors.
- `components/photos/photo-detail-viewer.tsx` — **new client.** (NOT `photo-viewer.tsx` — that name is already taken by the existing modal viewer.) Component `PhotoDetailViewer`. Owns `current: PhotoViewDTO` + the neighbor window IN STATE; renders the photo zone (pager on mobile, static on desktop), the info zone, AND the per-photo header actions (prev/next + delete) so they track the current photo.
- `components/photos/photo-pager.tsx` — **new client.** The finger-follow track (prev/current/next slides) for the photo zone only; runs the drag→settle state machine and emits `onSettle(direction)` only AFTER the slide animation completes. Mobile only.
- `components/photos/photo-info.tsx` — **new client.** The metadata strip + detections panel, rendered from a `PhotoViewDTO`. Moved out of the server page so it can swap without a reload.
- `lib/photos/detail-filters.ts` — **new (shared).** One `parseDetailFilters(searchParams)` used by the page AND the route handler, covering the FULL grid filter+sort set. Fixes a pre-existing mismatch (the page currently drops `sortBy/sortDirection/minScore/areaNames/otherAnimals`, so prev/next can already disagree with the grid).
- `app/(dashboard)/photos/[id]/page.tsx` — **modify.** Becomes thin: auth + `loadPhotoView()` for the initial id → render `<PhotoDetailViewer initial={dto} navQueryString={...} returnUrl={...} />`. Keeps ONLY the back button + title; prev/next + delete + image + info move into the client viewer.
- `components/photos/photo-detail-client.tsx` — **modify.** Keep the single-photo image+overlay+lightbox responsibilities, render ONE DTO passed in, drop the internal `router.push` swipe nav, and make `priority`/eager loading conditional on `interactive` (center slide only).

---

## Codex cross-reference revisions (BINDING — these override the task sketches below)

Codex reviewed this plan against the repo (2026-06-24). The task code blocks below are the starting shape; the following corrections are mandatory and supersede them where they conflict.

**R1 [P1] — Pager must animate to the neighbor, not snap back.** In Task 5, do NOT `setDx(0)` + `onSettle` on release. Implement a two-phase state machine inside `PhotoPager`:
- `phase: 'idle' | 'dragging' | 'settling'`, plus `settleOffset` (px target).
- On release, call `resolveSwipe`. If `current`, animate `dx → 0`. If `next`, animate the track to `translateX(-200%)`; if `prev`, to `translateX(0%)` (both with the 220ms transition).
- On the track's `onTransitionEnd` (only when `phase==='settling'` and it was a commit), call `onSettle(direction)`. The parent swaps `current`; because the new center slide is keyed by id, then the pager resets to the resting `-100%` with transition disabled for one frame (set a `noTransition` flag, clear it in a `requestAnimationFrame`/`useLayoutEffect`). This yields a continuous slide with no flash and no animate-in-then-snap.

**R2 [P1] — Neighbor window must live in STATE, not just a ref.** In Task 6 (`PhotoDetailViewer`), keep `const [window, setWindow] = useState<{prev?: PhotoViewDTO; current: PhotoViewDTO; next?: PhotoViewDTO}>(...)`. After a prefetch resolves, `setWindow(w => ({...w, prev/next: dto}))` so the slides actually re-render (a `ref` mutation will not). The `cacheRef` Map may stay as a dedup/prune cache, but rendering reads from `window` state. `renderSlide` reads `window.prev/current/next` — never a bare ref.

**R3 [P1] — Move per-photo actions into the client viewer (delete-targets-wrong-photo bug).** Because we use `history.replaceState`, any action built from the server `id` goes stale after a swipe. `PhotoDeleteButton photoId={id}` would delete the photo you swiped AWAY from. Render `PhotoDeleteButton` and the prev/next chevrons INSIDE `PhotoDetailViewer`, driven by `window.current.id` / `current.prevId` / `current.nextId`. The server page keeps only the back button + title. Pass `returnUrl` into the viewer.

**R4 [P1] — Rename to avoid collision.** `components/photos/photo-viewer.tsx` already exists (modal viewer using `usePhotoDetail`). Name the new one `photo-detail-viewer.tsx` / `PhotoDetailViewer`. Do not touch the existing file.

**R5 [P1] — Mirror the FULL grid filter+sort set.** Create `lib/photos/detail-filters.ts` exporting `parseDetailFilters(sp: URLSearchParams): ViewFilters` covering `status, hasDeer, qualityStatus, minConfidence, sex, minPoints, maxPoints, dateFrom, dateTo, sizeClass, cameraId, deerId` PLUS `minScore` (int), `areaNames` (array — repeated params), `otherAnimals` (array), `sortBy`, `sortDirection`. Use it in BOTH `page.tsx` and the route handler (replaces the inline parser in Task 3 and the page's lines 40-72). `PhotoFilters` already supports these (`lib/services/photos.ts:155-163`) and `getAdjacentPhotos` honors `sortBy/sortDirection` ordering — passing them fixes prev/next order, not just filtering. Confirm array param encoding matches the grid (`app/(dashboard)/photos/page.tsx:34-48`) and replicate it exactly.

**R6 [P2] — Signed-URL expiry.** Signed URLs live ~1h (`lib/services/photos.ts:1429`). Add `expiresAt: number` (epoch ms, ~`Date.now()+55*60_000`) to `PhotoViewDTO` in Task 2 — but note scripts/`new Date()` constraints don't apply here (runtime server code). Before `settle` consumes a cached neighbor DTO, if `expiresAt` is past, refetch it. Also add `onError` on each slide `<img>` that refetches the DTO once (covers an expired URL mid-session). 

**R7 [P2] — Image memory / priority.** Only the center slide may use `priority`/eager decoding; neighbor slides use `loading="lazy"` and `decoding="async"`. In Task 7, gate `priority` on `interactive`. Verify in Task 9 Step 3 by counting live `<img>` in the DOM (≈3) separately from heap — and note that pruning `window`/cache to ±1 bounds DTO refs, while the browser may still retain decoded bitmaps briefly; the DOM-count check is the real guard.

**R8 [P2] — `referenceCount` confirmed unused.** `PhotoDetailClient` already ignores it (`referenceCount: _referenceCount = 0`). Safe to drop from the DTO and props. No ROI regression.

---

## Task 1: `resolveSwipe` pure snap logic (TDD)

**Files:**
- Create: `lib/services/photo-view.ts` (this task adds only `resolveSwipe` + types; `loadPhotoView` comes in Task 2)
- Test: `lib/services/photo-view.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/services/photo-view.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveSwipe } from './photo-view.ts'

// width = slide width (px). dx = horizontal drag (px, + = drag right = go prev).
// vx = velocity px/ms at release. hasPrev/hasNext = window edges.
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test lib/services/photo-view.test.ts`
Expected: FAIL — `resolveSwipe` not exported.

- [ ] **Step 3: Write minimal implementation**

Create `lib/services/photo-view.ts` with the pure helper and shared types at the top:

```ts
import 'server-only'

export interface SwipeInput {
  /** slide width in px */
  width: number
  /** horizontal drag distance in px (+ = dragged right = toward prev) */
  dx: number
  /** release velocity in px/ms (+ = moving right) */
  vx: number
  hasPrev: boolean
  hasNext: boolean
}

export type SwipeResult = 'prev' | 'current' | 'next'

const DISTANCE_RATIO = 0.5 // must cross half the slide to commit on distance alone
const FLICK_VELOCITY = 0.4 // px/ms; a fast flick commits regardless of distance

/** Decide where a finger-follow drag should settle. Pure: no DOM. */
export function resolveSwipe({ width, dx, vx, hasPrev, hasNext }: SwipeInput): SwipeResult {
  const farEnough = Math.abs(dx) > width * DISTANCE_RATIO
  const fastEnough = Math.abs(vx) > FLICK_VELOCITY
  if (!farEnough && !fastEnough) return 'current'
  // Negative dx / vx = moving left = next photo.
  const goingNext = (dx + vx * 100) < 0
  if (goingNext) return hasNext ? 'next' : 'current'
  return hasPrev ? 'prev' : 'current'
}
```

Note: `import 'server-only'` would block importing `resolveSwipe` into a client component. Since the client pager needs `resolveSwipe`, put `resolveSwipe` + the `SwipeInput`/`SwipeResult` types in a SEPARATE client-safe module instead — see correction in Step 3b.

- [ ] **Step 3b: Move the pure helper to a client-safe module**

Create `lib/photo-pager/swipe.ts` (no `server-only`) holding `SwipeInput`, `SwipeResult`, and `resolveSwipe` exactly as above but WITHOUT the `import 'server-only'` line. Update the test import to `from '../photo-pager/swipe.ts'` and move the test to `lib/photo-pager/swipe.test.ts`. (Server code in `photo-view.ts` will import from here too.) This keeps the snap math usable on both sides.

Final test location: `lib/photo-pager/swipe.test.ts`; final impl: `lib/photo-pager/swipe.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test lib/photo-pager/swipe.test.ts`
Expected: PASS — all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/photo-pager/swipe.ts lib/photo-pager/swipe.test.ts
git commit -m "feat(photos): pure finger-follow snap logic + unit tests"
```

---

## Task 2: `loadPhotoView` shared server loader (DRY core)

**Files:**
- Create: `lib/services/photo-view.ts`
- Reference: `app/(dashboard)/photos/[id]/page.tsx:80-143` (the logic being extracted)

- [ ] **Step 1: Write `loadPhotoView` + the DTO type**

Create `lib/services/photo-view.ts`:

```ts
import 'server-only'
import { getPhoto, getSignedViewUrl, getAdjacentPhotos, type PhotoFilters } from '@/lib/services/photos'
import type { Detection } from '@/types/database'

export interface PhotoViewDetection {
  id: string
  bboxX: number
  bboxY: number
  bboxWidth: number
  bboxHeight: number
  confidence: number
  class: string | null
  deerId: string | null
  deerName: string | null
  qualityStatus: string | null
  qualityScore: number | null
  species: string | null
  sex: string | null
  sizeClass: string | null
  estimatedPointRange: string | null
  ageClass: string | null
}

export interface PhotoViewDTO {
  id: string
  imageUrl: string | null // medium variant signed URL (falls back to full-res)
  fullResUrl: string | null // full-res signed URL, for explicit zoom only
  detections: PhotoViewDetection[]
  detectionStatus: string
  classification: string | null
  confidence: number | null
  capturedAt: string | null
  importedAt: string
  fileSizeBytes: number | null
  prevId: string | null
  nextId: string | null
}

type ViewFilters = Omit<PhotoFilters, 'limit' | 'offset' | 'cursor'>

/**
 * Load the full view payload for one photo: signed image URLs, normalized
 * detections, and prev/next ids over the (optionally filtered) ordering.
 * Shared by the detail page (initial render) and the /view route handler
 * (neighbor prefetch). Returns null when the photo is missing or not the
 * caller's. Mirrors the prior inline logic in the detail page.
 */
export async function loadPhotoView(
  userId: string,
  id: string,
  filters?: ViewFilters,
): Promise<PhotoViewDTO | null> {
  const hasFilters = filters != null && Object.keys(filters).length > 0
  const [photoResult, adjacent] = await Promise.all([
    getPhoto(userId, id),
    getAdjacentPhotos(userId, id, hasFilters ? filters : undefined),
  ])
  const photo = photoResult.data
  if (photoResult.error || !photo) return null

  const [fullResResult, mediumResult] = await Promise.all([
    getSignedViewUrl(photo.file_path),
    photo.medium_path != null && photo.medium_path !== ''
      ? getSignedViewUrl(photo.medium_path)
      : Promise.resolve({ data: null, error: null }),
  ])
  const fullResUrl = fullResResult.data
  const imageUrl = mediumResult.data ?? fullResUrl

  const detections = (photo.detections as Array<Detection & {
    quality_status?: string | null
    quality_score?: number | null
    species?: string | null
    sex?: string | null
    size_class?: string | null
    estimated_point_range?: string | null
    age_class?: string | null
    deer?: { id: string; name: string | null } | null
  }>)
    .map((d) => ({
      id: d.id,
      bboxX: d.bbox_x ?? 0,
      bboxY: d.bbox_y ?? 0,
      bboxWidth: d.bbox_width ?? 0,
      bboxHeight: d.bbox_height ?? 0,
      confidence: d.confidence ?? 0,
      class: d.class,
      deerId: d.deer_id,
      deerName: d.deer?.name ?? null,
      qualityStatus: d.quality_status ?? null,
      qualityScore: d.quality_score ?? null,
      species: d.species ?? null,
      sex: d.sex ?? null,
      sizeClass: d.size_class ?? null,
      estimatedPointRange: d.estimated_point_range ?? null,
      ageClass: d.age_class ?? null,
    }))
    .sort((a, b) => b.confidence - a.confidence)

  return {
    id: photo.id,
    imageUrl: imageUrl ?? null,
    fullResUrl: fullResUrl ?? null,
    detections,
    detectionStatus: photo.detection_status,
    classification: photo.classification,
    confidence: photo.confidence,
    capturedAt: photo.captured_at,
    importedAt: photo.imported_at,
    fileSizeBytes: photo.file_size_bytes,
    prevId: adjacent.prevId,
    nextId: adjacent.nextId,
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/services/photo-view.ts
git commit -m "feat(photos): loadPhotoView shared DTO loader"
```

---

## Task 3: `/api/photos/[id]/view` route handler (neighbor prefetch)

**Files:**
- Create: `app/api/photos/[id]/view/route.ts`
- Reference: an existing route handler for the auth pattern — `app/api/photos/route.ts`

- [ ] **Step 1: Write the route handler**

Create `app/api/photos/[id]/view/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadPhotoView } from '@/lib/services/photo-view'
import type { PhotoFilters } from '@/lib/services/photos'

type ViewFilters = Omit<PhotoFilters, 'limit' | 'offset' | 'cursor'>

// Whitelist the filter keys the detail ordering understands (mirror the page).
const FILTER_KEYS = [
  'status', 'hasDeer', 'qualityStatus', 'minConfidence', 'sex',
  'minPoints', 'maxPoints', 'dateFrom', 'dateTo', 'sizeClass', 'cameraId', 'deerId',
] as const

function parseFilters(sp: URLSearchParams): ViewFilters {
  const f: Record<string, unknown> = {}
  for (const k of FILTER_KEYS) {
    const v = sp.get(k)
    if (v == null) continue
    if (k === 'hasDeer') f[k] = v === 'true'
    else if (k === 'minConfidence' || k === 'minPoints' || k === 'maxPoints') f[k] = parseInt(v, 10)
    else f[k] = v
  }
  return f as ViewFilters
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const filters = parseFilters(request.nextUrl.searchParams)
  const dto = await loadPhotoView(user.id, id, filters)
  if (!dto) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  // Signed URLs are short-lived; do not cache across users.
  return NextResponse.json(dto, { headers: { 'Cache-Control': 'private, no-store' } })
}
```

- [ ] **Step 2: Type-check + build**

Run: `npm run type-check && npm run build 2>&1 | grep -E "api/photos/\[id\]/view|error" | head`
Expected: type-check PASS; build shows the new `ƒ /api/photos/[id]/view` route.

- [ ] **Step 3: Manual smoke (authenticated)**

Run (dev server up, logged-in cookie not available via curl → expect 401, which proves auth gating):
`curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/photos/SOME-ID/view`
Expected: `401` (no cookie). The happy path is verified in Task 6 on-device / via the running app.

- [ ] **Step 4: Commit**

```bash
git add "app/api/photos/[id]/view/route.ts"
git commit -m "feat(photos): /api/photos/[id]/view neighbor-prefetch route"
```

---

## Task 4: `PhotoInfo` — info zone rendered from a DTO

**Files:**
- Create: `components/photos/photo-info.tsx`
- Reference: `app/(dashboard)/photos/[id]/page.tsx:273-330` (metadata strip + detections panel being moved)

- [ ] **Step 1: Write the component**

Create `components/photos/photo-info.tsx`. It renders the metadata strip + detections panel from a `PhotoViewDTO` (client component so the viewer can swap it without a reload). Reuses `DetectionCardWithFeedback` and the existing badge styles:

```tsx
'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DetectionCardWithFeedback } from '@/components/photos/detection-card-with-feedback'
import type { PhotoViewDTO } from '@/lib/services/photo-view'

function formatDate(s: string | null) {
  if (!s) return 'Unknown'
  return new Date(s).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function formatFileSize(bytes: number | null) {
  if (!bytes) return null
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
function statusBadge(status: string) {
  const badges: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-slate text-cream-dark' },
    processing: { label: 'Processing', className: 'bg-blue-500/20 text-blue-300' },
    completed: { label: 'Completed', className: 'bg-green-500/20 text-green-300' },
    failed: { label: 'Failed', className: 'bg-red-500/20 text-red-300' },
  }
  const b = badges[status] ?? badges['pending']
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${b.className}`}>{b.label}</span>
}
function classificationBadge(c: string | null) {
  if (!c) return <span className="text-cream-dark text-sm">No classification</span>
  const badges: Record<string, { label: string; className: string }> = {
    deer: { label: 'Deer', className: 'bg-copper/20 text-copper-light' },
    empty: { label: 'Empty', className: 'bg-slate text-cream-dark' },
    other: { label: 'Other Animal', className: 'bg-blue-500/20 text-blue-300' },
    person: { label: 'Person', className: 'bg-red-500/20 text-red-300' },
    vehicle: { label: 'Vehicle', className: 'bg-blue-500/20 text-blue-300' },
  }
  const b = badges[c] ?? badges['other']
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium ${b.className}`}>{b.label}</span>
}

export function PhotoInfo({ photo }: { photo: PhotoViewDTO }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 text-sm text-cream-dark">
        <span><span className="text-cream-dark">Captured</span> <span className="font-medium text-cream">{formatDate(photo.capturedAt)}</span></span>
        <span className="text-cream-dark/40">·</span>
        {statusBadge(photo.detectionStatus)}
        {classificationBadge(photo.classification)}
        {photo.confidence !== null && (<><span className="text-cream-dark/40">·</span><span className="text-cream">{Math.round(photo.confidence * 100)}%</span></>)}
        {formatFileSize(photo.fileSizeBytes) && (<><span className="text-cream-dark/40">·</span><span>{formatFileSize(photo.fileSizeBytes)}</span></>)}
      </div>

      <Card>
        <CardHeader className="pb-2 md:pb-4 px-3 md:px-6 pt-3 md:pt-6">
          <CardTitle className="text-base md:text-lg">Detections ({photo.detections.length})</CardTitle>
          <CardDescription className="hidden md:block">Tap to locate on the photo · tap again to adjust</CardDescription>
        </CardHeader>
        <CardContent className="px-3 md:px-6 pb-3 md:pb-6 pt-0">
          {photo.detections.length === 0 ? (
            <p className="text-sm text-cream-dark text-center py-2 md:py-4">No detections found</p>
          ) : (
            <div className="space-y-1.5 md:space-y-2">
              {photo.detections.map((detection, index) => (
                <DetectionCardWithFeedback key={detection.id} detection={detection} index={index} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
```

Note: confirm `DetectionCardWithFeedback`'s `detection` prop type accepts `PhotoViewDetection` (same fields as the page's inline shape). If its prop type is narrower, widen it or map — verify against `components/photos/detection-card-with-feedback.tsx` before finishing this task.

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/photos/photo-info.tsx
git commit -m "feat(photos): PhotoInfo (metadata + detections) from a DTO"
```

---

## Task 5: `PhotoPager` finger-follow track (mobile photo zone)

**Files:**
- Create: `components/photos/photo-pager.tsx`
- Reference: `lib/photo-pager/swipe.ts` (Task 1), `components/photos/photo-detail-client.tsx` (overlay/lightbox it wraps)

- [ ] **Step 1: Write the pager**

Create `components/photos/photo-pager.tsx`. It renders three slides (prev / current / next) in a `translateX` track, follows the finger via touch events, and calls `onSettle` after the snap animation. Each slide shows the photo via the existing `PhotoDetailClient` (single-DTO mode from Task 7). The track only covers the photo zone; the info zone lives outside it.

```tsx
'use client'

import { useRef, useState, useCallback, type ReactNode } from 'react'
import { resolveSwipe } from '@/lib/photo-pager/swipe'

interface PhotoPagerProps {
  hasPrev: boolean
  hasNext: boolean
  /** Render a slide given a relative offset: -1 prev, 0 current, +1 next. */
  renderSlide: (offset: -1 | 0 | 1) => ReactNode
  /** Called after the snap settles on a neighbor. */
  onSettle: (direction: 'prev' | 'next') => void
}

export function PhotoPager({ hasPrev, hasNext, renderSlide, onSettle }: PhotoPagerProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null)
  const lastRef = useRef<{ x: number; t: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [dx, setDx] = useState(0)
  const widthRef = useRef(0)
  const horizontalRef = useRef<boolean | null>(null)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    if (!t) return
    widthRef.current = trackRef.current?.clientWidth ?? window.innerWidth
    startRef.current = { x: t.clientX, y: t.clientY, t: e.timeStamp }
    lastRef.current = { x: t.clientX, t: e.timeStamp }
    horizontalRef.current = null
    setDragging(true)
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const s = startRef.current
    const t = e.touches[0]
    if (!s || !t) return
    const rawDx = t.clientX - s.x
    const rawDy = t.clientY - s.y
    // Lock axis on first significant movement: vertical → let the page scroll.
    if (horizontalRef.current === null && (Math.abs(rawDx) > 8 || Math.abs(rawDy) > 8)) {
      horizontalRef.current = Math.abs(rawDx) > Math.abs(rawDy)
    }
    if (horizontalRef.current !== true) return
    // Rubber-band when dragging past an unavailable edge.
    let d = rawDx
    if ((d > 0 && !hasPrev) || (d < 0 && !hasNext)) d = d * 0.25
    lastRef.current = { x: t.clientX, t: e.timeStamp }
    setDx(d)
  }, [hasPrev, hasNext])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const s = startRef.current
    const last = lastRef.current
    setDragging(false)
    startRef.current = null
    if (!s || horizontalRef.current !== true) { setDx(0); return }
    const end = e.changedTouches[0]
    const endX = end?.clientX ?? s.x
    const dt = Math.max(1, (last ? e.timeStamp - last.t : 16))
    const vx = last ? (endX - last.x) / dt : 0
    const result = resolveSwipe({ width: widthRef.current, dx: endX - s.x, vx, hasPrev, hasNext })
    setDx(0)
    if (result === 'next') onSettle('next')
    else if (result === 'prev') onSettle('prev')
  }, [hasPrev, hasNext, onSettle])

  // translateX: rest at -100% (current slide centered); add live drag.
  const style = {
    transform: `translateX(calc(-100% + ${dx}px))`,
    transition: dragging ? 'none' : 'transform 220ms cubic-bezier(0.22,0.61,0.36,1)',
  }

  return (
    <div
      className="relative w-full overflow-hidden touch-pan-y"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div ref={trackRef} className="flex w-full" style={style}>
        <div className="w-full shrink-0">{renderSlide(-1)}</div>
        <div className="w-full shrink-0">{renderSlide(0)}</div>
        <div className="w-full shrink-0">{renderSlide(1)}</div>
      </div>
    </div>
  )
}
```

Note on `onSettle`: the parent (Task 6) advances `current` to the neighbor and re-seeds the window, so after settle the track jumps back to the `-100%` resting position with the new current centered. Because the DOM slides are keyed by id (Task 6), React reconciles without a flash.

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/photos/photo-pager.tsx
git commit -m "feat(photos): PhotoPager finger-follow track"
```

---

## Task 6: `PhotoViewer` — state owner wiring pager + info + prefetch

**Files:**
- Create: `components/photos/photo-viewer.tsx`

- [ ] **Step 1: Write the viewer**

Create `components/photos/photo-viewer.tsx`. It owns the current DTO + a neighbor cache, renders the pager (mobile) / static slide (desktop) for the photo zone and `PhotoInfo` for the info zone, prefetches neighbors, and shallow-syncs the URL.

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { PhotoPager } from '@/components/photos/photo-pager'
import { PhotoDetailClient } from '@/components/photos/photo-detail-client'
import { PhotoInfo } from '@/components/photos/photo-info'
import type { PhotoViewDTO } from '@/lib/services/photo-view'

interface PhotoViewerProps {
  initial: PhotoViewDTO
  /** filter query string to preserve in the URL + prefetch calls */
  navQueryString: string
}

const IMG_W = 10000
const IMG_H = 10000

export function PhotoViewer({ initial, navQueryString }: PhotoViewerProps) {
  const [current, setCurrent] = useState<PhotoViewDTO>(initial)
  // id -> DTO cache (keep small; pruned to current ±1 below).
  const cacheRef = useRef<Map<string, PhotoViewDTO>>(new Map([[initial.id, initial]]))

  const fetchView = useCallback(async (id: string): Promise<PhotoViewDTO | null> => {
    const hit = cacheRef.current.get(id)
    if (hit) return hit
    const qs = navQueryString ? `?${navQueryString}` : ''
    const res = await fetch(`/api/photos/${id}/view${qs}`, { credentials: 'same-origin' })
    if (!res.ok) return null
    const dto = (await res.json()) as PhotoViewDTO
    cacheRef.current.set(id, dto)
    return dto
  }, [navQueryString])

  // Prefetch neighbors of `current`; prune cache to current ±1 (ADR 0003 budget).
  useEffect(() => {
    const ids = [current.prevId, current.nextId].filter((x): x is string => !!x)
    ids.forEach((id) => { void fetchView(id) })
    const keep = new Set([current.id, ...ids])
    for (const key of cacheRef.current.keys()) {
      if (!keep.has(key)) cacheRef.current.delete(key)
    }
  }, [current.id, current.prevId, current.nextId, fetchView])

  const settle = useCallback(async (direction: 'prev' | 'next') => {
    const targetId = direction === 'next' ? current.nextId : current.prevId
    if (!targetId) return
    const dto = (await fetchView(targetId)) ?? cacheRef.current.get(targetId)
    if (!dto) return
    setCurrent(dto)
    const qs = navQueryString ? `?${navQueryString}` : ''
    window.history.replaceState(window.history.state, '', `/photos/${dto.id}${qs}`)
  }, [current.nextId, current.prevId, fetchView, navQueryString])

  const renderSlide = useCallback((offset: -1 | 0 | 1) => {
    const id = offset === -1 ? current.prevId : offset === 1 ? current.nextId : current.id
    const dto = id ? (id === current.id ? current : cacheRef.current.get(id)) : null
    if (!dto) return <div className="aspect-video w-full bg-slate-deep" />
    return (
      <PhotoDetailClient
        key={dto.id}
        photo={dto}
        imageWidth={IMG_W}
        imageHeight={IMG_H}
        interactive={offset === 0}
      />
    )
  }, [current])

  return (
    <div className="space-y-3 md:space-y-4">
      {/* Photo zone: pager on mobile, static current slide on desktop */}
      <div className="md:hidden">
        <PhotoPager
          hasPrev={!!current.prevId}
          hasNext={!!current.nextId}
          renderSlide={renderSlide}
          onSettle={settle}
        />
      </div>
      <div className="hidden md:block">
        <PhotoDetailClient key={current.id} photo={current} imageWidth={IMG_W} imageHeight={IMG_H} interactive />
      </div>

      {/* Info zone: stays put, swaps content on settle */}
      <PhotoInfo photo={current} />
    </div>
  )
}
```

- [ ] **Step 2: Type-check (will fail until Task 7 updates PhotoDetailClient props)**

Run: `npm run type-check`
Expected: errors on `PhotoDetailClient` props (`photo`, `interactive`) — fixed in Task 7. Proceed.

- [ ] **Step 3: Commit**

```bash
git add components/photos/photo-viewer.tsx
git commit -m "feat(photos): PhotoViewer state owner (pager + info + prefetch)"
```

---

## Task 7: Refactor `PhotoDetailClient` to single-DTO mode

**Files:**
- Modify: `components/photos/photo-detail-client.tsx`

- [ ] **Step 1: Change the props to accept one DTO and drop internal swipe/route nav**

Replace the props interface and the swipe-nav block. The new prop shape:

```tsx
import type { PhotoViewDTO } from '@/lib/services/photo-view'

interface PhotoDetailClientProps {
  photo: PhotoViewDTO
  imageWidth: number
  imageHeight: number
  /** Only the centered slide is interactive (tap-to-zoom, detection editing). */
  interactive?: boolean
}
```

Inside the component:
- Derive `imageUrl = photo.imageUrl`, `fullResUrl = photo.fullResUrl`, `detections = photo.detections`, `showDetections = photo.detectionStatus === 'completed'`.
- DELETE `navTo`, `handleSwipeStart`, `handleSwipeEnd`, `prevId`, `nextId`, `navQueryString`, and the `useRouter` import — the pager owns navigation now.
- The mobile gesture overlay keeps ONLY tap-to-zoom; remove the swipe branch:

```tsx
<div
  className="absolute inset-0 z-10 md:hidden"
  onTouchEnd={(e) => {
    if (!interactive) return
    const t = e.changedTouches[0]
    const s = tapStartRef.current
    if (s && t && Math.abs(t.clientX - s.x) < 10 && Math.abs(t.clientY - s.y) < 10) {
      setIsLightboxOpen(true)
    }
    tapStartRef.current = null
  }}
  onTouchStart={(e) => {
    const t = e.touches[0]
    tapStartRef.current = t ? { x: t.clientX, y: t.clientY } : null
  }}
  role="button"
  aria-label="Tap to zoom"
/>
```

(Add `const tapStartRef = useRef<{ x: number; y: number } | null>(null)`.) The horizontal-swipe handling is gone because `PhotoPager` consumes horizontal drags; tap-to-zoom still works since the pager only acts on horizontal axis-locked drags and a tap produces no drag.

- Gate detection editing on `interactive` so off-screen slides are inert: in `handleDetectionClick`, early-return when `!interactive`.

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS (Task 6 + Task 7 now consistent).

- [ ] **Step 3: Commit**

```bash
git add components/photos/photo-detail-client.tsx
git commit -m "refactor(photos): PhotoDetailClient single-DTO, drop route-push swipe"
```

---

## Task 8: Wire the server page to the viewer

**Files:**
- Modify: `app/(dashboard)/photos/[id]/page.tsx`

- [ ] **Step 1: Slim the page to auth + loadPhotoView + viewer**

Replace the body of `PhotoDetailPage` so it:
- keeps the auth `getUser()` + `redirect('/login')`,
- parses filters into `filters` and builds `filterQueryString` (unchanged, lines 40-78),
- calls `loadPhotoView(user.id, id, hasFilters ? filters : undefined)`; `notFound()` if null,
- renders the header (back button + delete; the prev/next chevrons become desktop-only static links built from `dto.prevId/nextId`), then `<PhotoViewer initial={dto} navQueryString={filterQueryString} />` in the left column.

Concretely, replace lines 80-331 with:

```tsx
  const hasFilters = Object.keys(filters).length > 0
  const dto = await loadPhotoView(user.id, id, hasFilters ? filters : undefined)
  if (!dto) notFound()

  return (
    <div className="flex flex-col h-full overflow-y-auto space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 md:gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href={filterQueryString ? `/photos?${filterQueryString}` : '/photos'}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-cream">Photo Details</h1>
            <p className="hidden md:block mt-1 text-sm text-cream-dark">ID: {id}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 md:gap-2">
          {/* Desktop chevrons stay route-based; mobile uses the pager. */}
          <div className="hidden md:flex items-center gap-2">
            <Button variant="outline" size="icon" asChild disabled={!dto.prevId}>
              <Link href={dto.prevId ? (filterQueryString ? `/photos/${dto.prevId}?${filterQueryString}` : `/photos/${dto.prevId}`) : '#'}>
                <ChevronLeft className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="icon" asChild disabled={!dto.nextId}>
              <Link href={dto.nextId ? (filterQueryString ? `/photos/${dto.nextId}?${filterQueryString}` : `/photos/${dto.nextId}`) : '#'}>
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <PhotoDeleteButton photoId={id} returnUrl={filterQueryString ? `/photos?${filterQueryString}` : '/photos'} />
        </div>
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PhotoViewer initial={dto} navQueryString={filterQueryString} />
        </div>
        <div className="hidden lg:block" />
      </div>
    </div>
  )
```

Update imports: drop `getPhoto`, `getSignedViewUrl`, `getAdjacentPhotos`, `countReferenceROIs`, `PhotoDetailClient`, `DetectionCardWithFeedback`, `Card*` if now unused; add `loadPhotoView` and `PhotoViewer`. Keep `Button`, `Link`, icons, `PhotoDeleteButton`.

Note: the detections panel now lives inside `PhotoViewer` (via `PhotoInfo`), so the right-hand column is intentionally empty on desktop; if you prefer detections in the right column on desktop, that is a follow-up layout decision — out of scope here (info-zone-stays-put was the mobile requirement).

- [ ] **Step 2: Type-check + build**

Run: `npm run type-check && npm run build 2>&1 | grep -iE "error|/photos/\[id\]" | head`
Expected: type-check PASS; build green; `/photos/[id]` still listed.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/photos/[id]/page.tsx"
git commit -m "feat(photos): wire detail page to PhotoViewer (mobile pager)"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Unit + type + build**

Run: `npm run test:unit && npm run type-check && npm run build`
Expected: all unit tests pass (incl. `resolveSwipe`), type-check clean, build green.

- [ ] **Step 2: Runtime smoke (dev server)**

Start `npm run dev`, log in, open a `/photos/[id]` with a known filtered set. Verify:
- `GET /api/photos/<neighborId>/view` returns 200 JSON (Network tab) when landing on a photo.
- On mobile viewport (DevTools device mode): dragging the photo follows the finger; releasing past ~half or with a flick advances; the info zone (metadata + detections) swaps to the new photo with no full-page reload (no Next.js route transition spinner); the URL updates to the new id.
- At the first/last photo of the set, the drag rubber-bands and does not navigate.
- Tap (no drag) opens the zoom lightbox; pinch-zoom still works there.
- Desktop (≥768px): the static image + chevron links behave as before.

- [ ] **Step 3: Memory budget check (ADR 0003)**

In DevTools, page through ~15 photos on mobile emulation; confirm only ~3 medium `<img>` decode at once (cache pruned to current ±1) and memory does not climb unbounded.

- [ ] **Step 4: Commit any fixes, then done**

---

## Self-Review notes

- **Requirement coverage:** finger-follow on the photo zone only (Task 5 `PhotoPager`), info zone stays put + swaps (Task 4 `PhotoInfo` + Task 6 `PhotoViewer`), preload ±1 (Task 6 `useEffect` prefetch), shallow URL (Task 6 `history.replaceState`), neighbor data via API (Task 3), memory bound to current ±1 (Task 6 cache prune, Task 9 Step 3), no route reload per swipe (Task 7 drops `router.push`). All mapped.
- **Type consistency:** `PhotoViewDTO` / `PhotoViewDetection` defined in Task 2 and consumed identically in Tasks 4, 6, 7. `resolveSwipe(SwipeInput): SwipeResult` defined in Task 1, consumed in Task 5. `loadPhotoView` signature identical in Tasks 2, 3, 8.
- **Known boundary (documented, not a gap):** the pager walks within the loaded neighbor chain; each settle prefetches the new neighbors, so the chain extends as you go. There is no hard window edge until `prevId`/`nextId` is null (true end of the filtered set), which rubber-bands. No silent truncation.
- **Strict TS:** `interactive?: boolean` is the only optional prop; callers pass an explicit boolean, avoiding the `exactOptionalPropertyTypes` explicit-`undefined` pitfall.

---

## Execution Strategy

**MANDATORY: Use multi-agent parallel execution**

1. Analyze dependencies - identify independent vs dependent tasks
2. Group into parallel batches - cluster independent tasks
3. Execute with up to 5 agents in parallel via Task tool
4. Serialize only when dependencies require it

See CLAUDE.md "Execution Preferences" for parallelization rules.
