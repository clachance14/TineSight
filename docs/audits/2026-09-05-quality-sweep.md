# Quality sweep — uncommitted photo-triage remediation (2026-09-05)

Dual-model structural audit (`/quality-sweep`) of the working tree vs `5d5f5ef`:
129 tracked files changed plus 97 new source files (about 6,750 additions and
4,600 deletions once the CRLF-to-LF churn in 85 files is ignored). Codex ran in a
read-only sandbox; a fresh Claude subagent got the identical brief and seven
stress questions. Neither saw the build conversation. Full outputs are under
`.gstack/quality-sweep/` (ignored).

## Gate status

| Gate | Before sweep | After sweep |
|---|---|---|
| `npm run type-check` | 16 errors (2 Trigger jobs) | 0 |
| `npm run test:unit` | 186/186 | 186/186 |
| `npm run build` | fails: prerender of `/login` | fails: same, pre-existing (see B1) |
| ESLint, source paths only | 2,042 errors (HEAD: 2,525) | touched files 206 → 48 |
| `scripts/verify-security-invariants.mjs` (PGlite, `TINESIGHT_TEST_UPLOAD=1`) | 31 PASS | 31 PASS, identical set |
| `npm run test:ui` (Vitest) | 5 fail / 49 pass | unchanged (see B2) |

The 16 type errors came from a new import inserted above the line-1
`// @ts-nocheck` in `analyze-photo.ts` and `generate-fingerprint.ts`, which
silently disables the directive. Reordered; no behavior change.

## Cross-model findings (29 unique, 12 shared, 41% agreement)

| # | Sev | Finding | Codex | Claude | Decision |
|---|---|---|---|---|---|
| 1 | P1 | Trophy rule implemented three times: 061 trigger, 059 `derive_photo_triage`, TS `isTrophyScore` in the fingerprint worker. Trigger recomputes from the rounded `score_gross`, so the worker's fractional verdict is overwritten and can disagree near the threshold. | yes | yes | **Applied** worker side: dead profile read + gate removed (`generate-fingerprint.ts`). SQL consolidation logged (F1). |
| 2 | P1 | Checkpoint re-read (`images.analysis_result`) bypassed `detectionOnlySchema` and replayed the original call's `batch_metrics` row on retry. | yes | yes | **Applied**: both paths funnel through the schema; only the validated result is persisted; metrics inserted for fresh calls only. |
| 3 | P1 | `/api/photos/ids` validated JSON filters by stringifying them into URL params, so malformed array fields were dropped and the bulk selection widened. | yes | partial | **Applied**: `photoFilterParams` rejects non-array/object-shaped fields (`Invalid <key>`), matching the URL decoder. |
| 4 | P1 | Detection-only id shortcut returned RPC ids without the 058 readiness guard the images path applies. | yes | no | **Applied**: migration 062 adds `upload_completed_at IS NOT NULL` to `get_filtered_detection_images`; proven in PGlite with a before/after control. |
| 5 | P1 | `/api/photos/review` shipped an unbounded `.in('id', …)`; archive/location already chunk in the service. | yes | yes (Q5) | **Applied**: `setPhotoReviewStatus` in `lib/services/photos.ts`, chunked and readiness-guarded; route calls it. |
| 6 | P1 | "Empty photo" defined three ways; batch-archive hand-rolled the predicate and ignored live non-deer detections. | no | yes | **Applied** for the archive route: `.eq('triage_tier','empty')`. Service `emptyOnly` left (UI still uses it) — F6. |
| 7 | P1/P2 | Bulk and Simple upload still run two lockstep orchestrations (session, init, rounds, completion, cancel, XHR, `chunkArray`). | P2 | P1 | Logged F2 (large). |
| 8 | P2 | Triage counts enumerate every matching id then RPC the array back; should be one filtered aggregate. | yes | yes (Q5) | Logged F3. |
| 9 | P2 | `photo-more-filters-sheet.tsx` `setField` deletes every non-status field right after assigning it; deer select mutates eight keys inline. | yes | yes | Logged F4 — **live bug**, see B3. |
| 10 | P2 | `providers.tsx` subscribes to Supabase auth and enumerates five stores directly. | yes | yes | Logged F7. |
| 11 | P2 | Vitest/jsdom/testing-library added while ADR 0002 says no Vitest; node:test files embed a hand-rolled PostgREST emulator. | yes | yes | Logged F8 (architecture decision). |
| 12 | P2 | Dead helpers: `incrementBatchCounters` (no-op RPC), `getBatch`, `updateBatchStatus`, `completeBatch`. | yes (Q3) | yes | **Applied**: deleted (zero callers). `getBatches` is also uncalled — F9. |
| 13 | P3 | `as never` on RPC calls that `types/database.ts` already types; two RPCs missing from `Functions`. | yes | yes | **Applied**: added `expire_photo_work_budgets`, `request_photo_retry`; removed casts in 5 call sites. |
| 14 | P3 | `recover-photo-work.ts` awaits each photo's two enqueues serially. | yes | yes | **Applied**: per-page `batchTrigger` pairs under `Promise.all`; recovery test stubs updated to the batch API. |
| 15 | P3 | Fingerprint provenance smuggled into `antler_fingerprint` JSON via `as any`. | yes (Q6) | yes | Logged F10. |
| 16 | P2 | `hasText`/`readErrorMessage` helpers would remove ~40 lines of mechanical null/empty checks and four error-extraction copies. | no | yes | Logged F11. |
| 17 | P2 | `needsXFilter` booleans recomputed in three functions with drift (`getPhotoIds` honors `status !== 'all'`, `getPhotos` does not). | no | yes | Logged F12 (drift is a correctness risk). |
| 18 | P2 | `cancelSession` pages batch ids then ships them back in 100-id chunks; belongs in one RPC. | no | yes | Logged F13. |
| 19 | P2 | `transfer.ts` reinvents p-limit and backoff already in `lib/upload/config.ts`. | no | yes | Logged F14. |
| 20 | P2 | UUID regex copied four times; upload/complete re-validates ids inline instead of `parsePhotoIdBatch`. | no | yes | Logged F15. |
| 21 | P2 | Crop-path regex pasted twice in TS and once in SQL. | no | yes | Logged F16. |
| 22 | P2 | `session-status.ts` PATCH path vs `finish_upload_session` POST path; trigger can never yield `failed`. | no | yes | Logged F17. |
| 23 | P2 | Gallery defaults and `datePreset` resolution live only in `photos/page.tsx`; API consumers never resolve a preset. | no | yes | Logged F18 (behavior gap). |
| 24 | P2 | `photo-triage-groups.tsx` deletes six sibling keys inline in two places. | no | yes | Logged F4. |
| 25 | P2 | Dashboard layout reads `profiles` then upserts only if missing; table access in a layout. | no | yes | Logged F19. |
| 26 | P3 | `PhotoQuery` alias plus `as unknown as PhotoQuery` lies for non-`*` selects. | no | yes | Logged F20. |
| 27 | P3 | `retry-failed.ts` `?? ''` after a null guard; `'contentSha256' in file` probing; duplicates route response shape. | no | yes | Logged F21. |
| 28 | P3 | `get_photo_stats` overloads carry identical 55-line bodies. | no | yes | Logged F22. |
| 29 | P3 | File size: `BulkUploader.tsx` 1,187, `photos.ts` 1,732, `locations-map.tsx` 664; pasted `<details>` block. | partial | yes | Logged F2/F23. |

Stress-question consensus: Q1 duplicated (both). Q2 decoder is unified; secondary
paths remain in the ids route (fixed), the sheet/groups handlers, and unresolved
`datePreset`. Q3 dead helpers (fixed); all DEFINER RPCs enforce `auth.uid()` or
are `service_role`-only. Q4 two orchestrations remain. Q5 aggregate wanted;
review route unbounded (fixed). Q6 checkpoint bypass (fixed); pricing table belongs
in data. Q7 migration 054 does not widen the Showcase DTO; owner scoping preserved
and tightened in the catalog/filter readers.

## Blockers found on the way (not sweep scope)

- **B1 Build fails.** The unstaged edit to `app/(auth)/login/page.tsx` dropped the
  server-side `searchParams` read; `LoginForm` now calls `useSearchParams()` with
  no `<Suspense>` boundary, so static prerender of `/login` aborts the build.
  Wrap `<LoginForm />` in `<Suspense>` (or `export const dynamic = 'force-dynamic'`).
  File is mid-edit in another session.
- **B2 Vitest suite.** Five tests in `deer-details-content` and `deer-details-first`
  fail with `ResizeObserver is not defined`; `tests/ui/setup.ts` needs a stub.
  Earlier runs also timed out at 5 s under CPU load.
- **B3 Live bug.** `photo-more-filters-sheet.tsx` `setField`: camera, session and
  quality filters can never be set (assign then unconditional `delete`). Two-line
  fix: `if (value) next[key] = value; else delete next[key]; if (key === 'status') next.triageView = 'all'`.

Resolved 2026-09-05 (evening, `/investigate`). B1: `<LoginForm />` is wrapped in
`<Suspense fallback={null}>` on the page; `/login` prerenders as a static route and
`npm run build` is green. The dropped page-level error banner was not a regression:
the callback route only emits `account-setup` and `callback-failed`, which the form
already renders. B3: the transition now lives in `withSourceField` in
`lib/photos/filters.ts` (the dangling `else` also meant "Any status" could never
clear `status`); regression test in `lib/photos/filters.test.ts`. B2: `ResizeObserver`
stubbed in `tests/ui/setup.ts`, 54/54 with no timeouts at 5 s. F8 (Vitest vs
ADR 0002) is still an open decision for the user.

## Follow-ups (logged, not applied)

Resolved later on 2026-09-05 via `/feature` (see the "Duplicated runs and SQL
functions" section at the end): F1, F2, F22, and the dormant `UploadManager`.

- F1 Single trophy predicate in SQL: make 059 `derive_photo_triage` read
  `bool_or(d.is_trophy)`, add `is_trophy` to the `detection_photo_triage` trigger's
  `UPDATE OF` list so 061's backfill re-derives tiers, demote `isTrophyScore` to a
  display helper. Verify with the PGlite harness.
- F2 One `runUploadSession()` orchestrator in `lib/upload`; both uploaders keep
  selection and rendering only. Also extracts the pasted "Assign by folder" block.
- F3 `get_photo_triage_counts` as a filtered aggregate over the same predicate
  (or a `GROUP BY triage_tier` variant of the 053 RPC).
- F4 Typed filter transitions (`withDeerContent`, `withPointBand`, `withSourceField`,
  `withTriageView`, `countActiveDims`) beside `withArchiveState`; fixes B3 by construction.
- F6 Replace service `emptyOnly` and the UI's Empty option with `triageView=empty`.
- F7 `subscribeAccountBoundary(queryClient)` in `lib/auth`; provider becomes one effect.
- F8 Decide Vitest: amend ADR 0002 or drop `tests/ui`; move the PostgREST emulator
  to one `tests/support` module.
- F9 Delete uncalled `getBatches`.
- F10 Persist fingerprint provenance in `batch_metrics` or a typed `fingerprint_meta`.
- F11–F17, F19–F23 as in the table (mechanical; each under an hour).
- F18 Resolve `datePreset` inside `parsePhotoFilters` and move gallery defaults to
  `applyGalleryDefaults`.
- F24 Ten Trigger jobs run under whole-file `@ts-nocheck`; `analyze-photo.ts` alone
  hides ~15 real type errors. Type the admin client and remove the directive.
- F25 Move Gemini price tables (`usage.ts`) to a versioned data module.

## Duplicated runs and SQL functions (resolved 2026-09-05, `/feature` loop)

- **F2 — one upload run.** `lib/upload/run.ts#runUploadSession` now owns session
  creation, grouping/chunking, batch initialization, the pipelined transfer rounds,
  the processing handoff, the session close, cancellation teardown, and the store
  transitions; `lib/upload/xhr-transfer.ts#createXhrTransfer` is the one storage
  transfer (progress, throttle accounting, optional per-attempt hooks). Bulk keeps
  preparation and stage presentation; Simple keeps its debug logger/metrics wired
  through hooks. The dormant `lib/upload/uploader.ts` (UploadManager, 454 lines, no
  callers) is deleted. Sizes: BulkUploader 1,187 → 944 lines, upload page 560 → 278.
  Unified policies (Codex cross-checked): a lost session close is a `finalization`
  failure that preserves completed photos; a generic error drains and marks the
  run's non-terminal files failed; the throttle gate applies to both uploaders;
  storage Content-Type comes from the same resolver batch initialization uses.
- **F1 — one trophy predicate.** Migration 061 now also switches
  `derive_photo_triage` to `bool_or(d.is_trophy)`, adds `is_trophy` to the
  `detection_photo_triage` trigger so flag changes cascade into tiers, and drops
  059's separate threshold sweep. 059 stays score-based so no applied state has the
  tier reading a flag its trigger does not yet maintain. `isTrophyScore` rounds first
  to mirror the integer predicate and is documented as a preview helper.
- **F22 — one stats reader.** The two-argument `get_photo_stats` overload is
  dropped (it duplicated the body and was ambiguous to call positionally; the only
  caller passes all three named arguments).
- **Evidence.** `lib/upload/run.test.ts` (8 node:test cases: pipeline order,
  grouping/serialization, all-inits-failed, lost close, user cancel, generic error,
  observer containment, sessionless run); node:test 194/194; Vitest upload suites
  green (5 pre-existing ResizeObserver failures unchanged); PGlite harness 32/32
  including tier/flag agreement across threshold changes and the single reader;
  browser acceptance on the loopback simulator (`scripts/triage-sim/*-acceptance.mjs`,
  updated to the current dialog flow; logs under `.gstack/triage-runs/refactor/`):
  Bulk 50-photo run survives SPA navigation and completes 50/50; cancellation at 25
  keeps 25, stops 25, offers no retry, exactly one handoff; Simple ("Choose photos")
  completes 30/30 and closes its session. The simulator now honors upsert semantics
  (`on_conflict` + `Prefer: resolution=`) so the new login profile setup cannot
  duplicate the fixture row.

### Sweep of this increment (Codex + blind Claude subagent, same brief)

Codex: 1 P1 / 4 P2 / 1 P3. Claude: 1 P1 / 12 P2 / 19 P3. 39 unique findings, 9 raised
by both (23% agreement). Both-found: the Bulk failure list duplicates the store; the
retry coordinator and the runner repeat lifecycle glue; active-session tracking sits in
both adapters; the threshold refresh repeated the predicate; the throttle contract was
partial; the timeout policy was reinvented; the serializer emitted explicit undefined;
transfer types pointed the wrong way; the Simple location spread was redundant.

**Applied (behavior-preserving, re-verified):** reservation retries now pass the same
throttle admission gate as a fresh run (Codex P1); XHR hooks are isolated like runner
observers so a debug hook can never hang a transfer (Codex); a preparation-phase abort
now clears the preparing flag, which the runner's guard could not do for files that
never entered the store (Claude P1); the run result carries `handedOff` so both
adapters refresh galleries the same way; the timeout policy lives in
`UPLOAD_CONFIG` (60 s/MB, 120 s floor); throttle types come from `lib/throttle`;
`finishUploadSession` is the close call; XHR failure paths share one helper; the
serializer uses conditional spreads; `UploadRunLocation` is the store's `LocationData`;
batch fields are typed; the barrel no longer re-exports runner internals; Bulk gained
`showCancelled`, compares the cancel reason to the exported constant, and lost a dead
ref; the page resolves logger/metrics from the registry; migration 061 is one
transaction, its triggers are idempotent, the threshold refresh touches the flag only
(the BEFORE trigger owns the predicate) and skips NULL scores, and the 130 fallback
appears once.

**Logged:** derive Bulk's failure list from the store and drop `onFileFailed`; move
`setActiveUploadSessionId` into the runner; extract `settleRun`/`transferBatches` so
`retry-failed.ts` shares the runner's lifecycle glue; route the batch-init POST through
`acknowledgedFetch`; the three selection-accept copies and the duplicated "Assign by
folder" block in BulkUploader; normalize the `''`/`'__none__'` location sentinels at
the select; hash originals in the EXIF worker with bounded parallelism; one shared
`UploadFileRequest` wire type; a shared UI throttle mock; move preparation into
`lib/upload/preparation.ts`; a `RunContext` decomposition of `runUploadSession`;
harness `scenario()` steps and a shared acceptance-script preamble; delete
`passesScoreEstimateBand` and the three scripts' dead `is_trophy` writes.
