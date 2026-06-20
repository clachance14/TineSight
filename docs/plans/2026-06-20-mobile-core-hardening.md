# Mobile Core Hardening — Autonomous Loop Charter

Date: 2026-06-20
Status: Ready to execute
Branch: `mobile-core-hardening` (off `master`)

## North star

Make the **mobile core bulletproof**: the surfaces a lease operator (and a
prospective lessee) touch on a phone must be crash-free, fast, and — where it
sells — polished. Pre-launch dogfood; no external users yet, so we can refactor
aggressively.

Glossary: see [CONTEXT.md](../../CONTEXT.md). Decisions: see
[ADR 0001](../adr/0001-public-showcase-links.md),
[ADR 0002](../adr/0002-verification-via-gstack-and-budgets.md).

## Scope

**In (core, mobile-first):**
1. **Photos** — browse / filter / view (the iOS-crash epicenter).
2. **Deer catalog + re-ID** — catalog browsing, Buck profiles, AND match
   confirmation (swipe-to-approve) on mobile.
3. **Showcase** — new public, no-login, token-gated marketing surface.

Then: **one codebase-health pass.**

**Out (leave functional-as-is):** desktop import/upload (SD-card → laptop;
mobile never imports), cameras, locations, settings, dashboard. Stability only,
no polish, no redesign.

## Mobile / desktop split

- **Desktop:** import photos, processing. (Unchanged.)
- **Mobile:** view, filter, browse Catalog, confirm re-ID matches, build & share
  Showcases.

## Mobile platform constraint (web, not native)

"Mobile" means a **mobile web app running in the phone browser** (iOS Safari /
Android Chrome) — **not** a native/React Native app, for now. Therefore:

- **Build nothing that isn't phone-browser-friendly.** Touch-first interactions,
  ≥44px tap targets, no hover-dependent UI (no `:hover`-only menus/tooltips),
  no mouse-only patterns (e.g. desktop drag-to-select, right-click menus).
- Use **web-standard** capabilities only: Web Share API (not native share
  sheets), `<input capture>` where relevant, IntersectionObserver, etc. — and
  degrade gracefully where a browser lacks them.
- Respect mobile-browser realities: iOS Safari memory limits (the crash),
  100vh/safe-area quirks, momentum scroll, no reliable background tasks.
- **Clean up existing touch-hostile patterns** as part of the work (and called
  out in the health pass) — audit the core surfaces for hover-only controls,
  tiny targets, drag/drop that needs a mouse, desktop-width layouts, etc.,
  and make them touch-friendly or remove them.

## Root cause being fixed

`thumbnail_path` is a DB column that is **never written** — no thumbnail
generation exists (only a 32×32 blurhash). The grid fell back to full-resolution
trail-cam JPEGs, and the crash "fix" switched to native `<img>` (bypassing
Next.js `/_next/image` downscaling). iOS Safari decoded dozens of multi-megapixel
images at once → memory crash. Scale is **tens of thousands+** photos/account,
so the fix needs the full stack.

Note: `@tanstack/react-virtual` and `blurhash` are **already dependencies** —
the windowing infra was ripped out during the crash panic, not absent.

## Verification gate (per ADR 0002)

No Playwright/Vitest. A surface is "done" when:
- **Performance/memory budgets pass** (the real guardrail — makes the crash
  class impossible by construction):
  - Thumbnails: ≤400px longest edge, WebP, target <40 KB each.
  - Photo grid: **virtualized**; cap live DOM nodes (~2–3 viewports); decoded
    image memory kept far under the iOS Safari per-tab budget.
  - Lightbox/Showcase: progressive load (blurhash → thumbnail → medium ~1080px
    on demand); never full-res in any list.
  - Mobile-core route JS bundle / LCP within budget (tune during grounding).
- **gstack browser QA** passes for the flow on a mobile viewport.
- Real-iPhone spot-check optional, not required.

## Execution model

- **Fully autonomous (AFK).** Run the whole backlog end-to-end via the
  `/feature` loop per surface (Explore→Grill→Ground→Cross-check w/ Codex→Decide→
  Record→Build→Verify→Sweep).
- **Only hard-stop: production deploy.** Loop builds + verifies on the branch;
  operator reviews and triggers the Vercel prod deploy.
- **Full send otherwise** — decide forks (via /feature + Codex), run migrations
  (additive and destructive schema changes OK).
- **Absolute constraint: never delete Photos.** Photo rows and storage objects
  (the operator's real Catalog) are sacrosanct. Schema may change; image data
  must not be lost.
- Commit per work-item with clean messages on the branch.

## Backlog (dependency-ordered)

### 0. Branch + git hygiene
- Create `mobile-core-hardening` off `master`.
- Delete the 10 stale local feature branches (work already on master).
- Remove `deer.ts.backup`. Leave `master` history untouched.

### 1. Thumbnail pipeline (foundation — unblocks everything)
- Generate server-side thumbnails (WebP, ≤400px) during photo processing; write
  `thumbnail_path`.
- Backfill thumbnails for existing photos (additive job; never deletes originals).
- Also generate a "medium" (~1080px) variant for lightbox/Showcase.

### 2. Photos surface (the crash fix)
- Serve thumbnails in the grid; re-introduce **virtualization**
  (`@tanstack/react-virtual`) + the in-progress infinite scroll.
- Blurhash placeholders. Responsive mobile-first grid (2 cols on phone).
- Enforce + measure the budgets above.
- Mobile lightbox polish: swipe between photos, pinch/zoom, smooth.

### 3. Trophy-gated AI cost cascade (backend) — per ADR 0004
Added to the loop 2026-06-20 by operator request. Full plan:
`docs/superpowers/plans/2026-06-20-trophy-score-gate.md` (READ IT before building
this step). ADR: `docs/adr/0004-trophy-gated-ai-cost-cascade.md`.
- Restructure the Gemini pipeline into a cost-tiered cascade: detect → size
  glance (drop spikes only) → NEW mid-cost score-estimate → fingerprint (within
  confirm band) → automatic re-ID on confirmed trophies → cluster → operator
  promote. Trophy = Score ≥ `account.trophy_threshold` (default 130″), NOT the
  `size_class="trophy"` glance (fixes the CONTEXT.md conflation).
- **CHANGE-WITH-CARE (Constitution P2):** touches the re-ID North Star pipeline
  (compare-deer, cluster-trophy-detections, lib/gemini/*, lib/services/matching).
  No auto-merge of identities (human-in-the-loop). Prove on real corpus by hand.
- **COST GUARDRAIL:** new paid Gemini call types + reprocessing existing 4,114
  photos = real $. Build + apply to NEW photos automatically; prove on a small
  bounded sample; do NOT silently reprocess the whole corpus. Estimate full
  reprocess cost and surface it in the SUMMARY for the operator's explicit go
  (or run within a sane bounded cap). This is the one place "full authority" is
  tempered by not spending unbounded money unflagged.
- Must precede Steps 4 and 5: Showcase curates **trophy** bucks, and mobile
  re-ID UI consumes the **match candidates** this cascade emits.

### 4. Deer catalog + re-ID (mobile)
- Mobile Catalog browsing + Buck profiles (uses thumbnails).
- Match-review on mobile: swipe-to-approve/reject Match candidates
  (human-in-the-loop). North Star event: First Buck Re-Identified.
- Consumes the Match candidates emitted by Step 3's cascade.
- Stability-first; light polish.

### 5. Showcase (new feature — per ADR 0001)
- Curate **trophy** Bucks (Score-confirmed, per Step 3) into a Showcase; generate
  unguessable, revocable token link.
- Public, no-login, mobile-polished Showcase page (reuses thumbnails/medium).
- Token-gated read path kept strictly separate from account-scoped RLS; noindex.
- Operator revoke/regenerate.

### 6. Health pass
- Remove orphaned Playwright specs, `playwright.config.ts`, `SETUP_TESTS.md`.
- Rewrite the badly-stale CLAUDE.md (it still claims "no code yet" + Vitest/
  Playwright). Reflect real architecture + ADR 0002.
- Dependency / security check (Next 16 / React 19 already current).
- **Touch-hostility audit** of the core surfaces: find/fix hover-only controls,
  sub-44px tap targets, mouse-only drag/drop, desktop-width layouts, right-click
  menus — make touch-friendly or remove.
- `/quality-sweep` the full diff (Codex + Claude structural review).

## Follow-ups logged by the Step 1 quality sweep (dual-model)

Robustness items deferred from the variant pipeline (not blocking; need schema/
design changes — kept out of the increment to avoid scope creep):

- **Stuck-`processing` reclaim**: a worker crash after the claim strands a row in
  `processing` forever (no path reclaims it). Add a claim timestamp
  (`variant_claimed_at`) + a stale-reclaim sweep, or have the backfill pick up
  `processing` rows older than a threshold. (Both models, P1.)
- **Cross-nudge attempt cap**: `failed` is re-claimable by any later nudge, so a
  permanently-corrupt original can be retried 3-at-a-time indefinitely. Add a
  `variant_attempts` counter to make `failed` terminal after N. (Both models.)
- **Kill `.mjs`/`.ts` drift**: `scripts/backfill-variants.mjs` duplicates
  `lib/image/variants.ts` (already drifted). Extract a Node-importable
  `lib/image/variants.core.mjs` shared by both. (Both models, P2 — deferred:
  module-resolution risk to the green build.)
- **RPC-ize keyset pagination**: replace the hand-built PostgREST `.or()` cursor
  in `backfill-variants.ts` with a typed SQL RPC + matching index. (Codex, P2.)
- **route.ts dead arrays**: `imagePaths`/`thumbnailPaths` are built but unused
  (pre-existing). Remove. (Claude, P3.) — DONE in Step 2 sweep.

## Follow-ups logged by the Step 2 quality sweep (dual-model)

- **Split the grid into query vs pure component**: `PhotoGrid` still calls
  `usePhotosInfinite` even when `externalData` owns the data (unused internal
  query path). Extract `PhotoGridWithQuery` + pure `VirtualPhotoGrid`, or add
  `enabled: !externalData` to the hook. (Both models, P2 — deferred: refactor.)
- **Consolidate the detail swipe/tap gesture classification**: `touchStartRef`
  is read in both the overlay `onTouchEnd` and inside `handleSwipeEnd` with an
  implicit ordering contract; thresholds split across two functions. Extract one
  `classifyGesture(start,end) -> 'tap'|'prev'|'next'|'none'`. (Both models, P2 —
  works today, fragile.)

## Open items to resolve during grounding (loop decides via /feature)
- Exact budget numbers (thumbnail bytes, DOM cap, LCP) — measure real data.
- Whether to salvage `fix/photo-grid-scroll-performance` (2 commits) for the
  virtualization work.
- Showcase data shape (which Buck fields/photos are public).

---

## Execution Strategy

**MANDATORY: Use multi-agent parallel execution**

1. Analyze dependencies - identify independent vs dependent tasks
2. Group into parallel batches - cluster independent tasks
3. Execute with up to 5 agents in parallel via Task tool
4. Serialize only when dependencies require it

See CLAUDE.md "Execution Preferences" for parallelization rules.
