# Browser simulation evidence — September 5, 2026

## Scope and isolation

The actual Next application ran at `127.0.0.1:3410`; an isolated HTTP simulator at `127.0.0.1:9410` handled Supabase Auth/PostgREST/Storage and Trigger handoffs. All identities, objects, and analysis outcomes were synthetic. No production uploads, Gemini calls, or remote database writes were made by this simulation. It exercises the browser, upload code, Next route handlers, installed client SDKs, and gallery. It does not prove PostgreSQL/RLS behavior, distributed Trigger execution, Gemini accuracy, or real service quotas. SQL invariants are checked separately in disposable PGlite.

Scripts: `scripts/triage-sim/{fixtures,server,start-app,select-files}.mjs` and `gallery-observer.js`. Browser: existing gstack browse daemon with independent state `/tmp/tinesight-goal-browser/browse.json`. Detailed artifacts are under ignored `.gstack/triage-runs/simulator/`.

## Verified baseline

- Selected 1,000 actual JPEG files using the browser file input. Files are approximately 2.3 KB each; this is an object-count baseline, not a realistic bandwidth benchmark.
- Started Bulk Upload and skipped the optional location picker.
- Observed 40 batches and 40 processing handoffs through the actual Next API.
- Simulator recorded 1,000 unique original paths, 1,000 completed photo rows, and 3,000 objects (original + thumbnail + medium).
- Measured peak of five concurrent original transfers. Session creation to browser upload finalization was approximately 6.6 seconds under loopback conditions.
- Browser showed “Upload complete!” and “1000 photos uploaded successfully”.
- Gallery showed “1,000 photos · 200 with deer”. Distribution is deliberately synthetic: 600 empty, 100 doe, 100 buck, 100 people, 100 vehicle.
- Fetched 20 real gallery API pages: 1,000 IDs, all unique, no API errors.
- Scrolled to “Showing 1000 of 1000 photos”. Final DOM had 261 elements and 20 images, confirming the virtual grid did not mount all 1,000 images.
- At 390px mobile viewport, document width stayed 390px. Found missing navigation-button accessible name and fixed it; more mobile checks remain.
- Current unit suite at this checkpoint: 98/98 passing. This is not the final suite/build gate; agents are still implementing additional requirements.

## Simulator defects corrected during setup

The first run failed most chunks because the emulator treated PostgREST's bulk-insert `columns` parameter as a predicate. It also did not decode Trigger's serialized payload envelope. Both emulator issues were corrected before the successful baseline. The UI reported chunk errors on that failed setup run rather than silently showing success. These are simulator defects, not claimed production defects.

Realtime WebSocket transport is not implemented by the emulator. The browser completed its polling fallback. Real reconnect/subscription behavior needs separate verification.

## Outstanding evidence

Realistic large files, throttled-network latency, fault matrix, mixed folder/camera/location mapping, repeat import/resume, mobile bulk actions, saved views, Keep/Review Later, final filter consistency and all final checks remain tracked in `docs/goals/photo-triage.json`. The 1,000-count baseline does not complete those requirements.

## Large-file retry run

A second Bulk run selected 1,000 JPEGs of 2,439,169 bytes each (2,439,169,000 bytes total; deterministic 2048×1536 noise images, reused content per synthetic camera). Three storage PUT requests deliberately returned HTTP503. All three faults were consumed and all 1,000 photos completed; combined simulator state now held 2,000 completed photos, 80 handoffs and 6,000 objects. Peak concurrent transfers remained five. Session creation to upload finalization was 12.918 seconds on loopback; this is not a real-world network speed estimate. Post-completion Chromium-reported JS heap was approximately26MB with202 DOM elements; this is a post-run observation, not a peak-memory measurement. The simulator itself retained originals in RAM (~2.5GB), which is test infrastructure overhead. Screenshot: `upload-large-retry.png`; detailed results: `large-retry-report.json` under the ignored artifact directory.

## Simple Upload failure and mode-switch finding

After Bulk success, switching to Simple mounted the previous run's completion panel and automatically navigated away while selecting files. This was reproduced in the browser and sent to the upload implementation agent. The fix removes automatic completion navigation, provides an explicit View photos action, and scopes Simple progress to a Simple run. Browser re-verification remains required after the hash changes settle.

A fresh Simple run with three selected files and an injected batch-insert400 showed “Upload Failed”, “0 of3 complete (3 failed)”, and a reason beside every filename; it stayed on the upload page. The simulator received the failed-session PATCH (completion timestamp recorded), but its aggregate helper incorrectly rewrote zero-batch failure to uploading on every table operation. That emulator bug is fixed in source and must be re-run after simulator restart; the captured simulator session status is not evidence against production lifecycle SQL.

## Content-hash repeat import

After SHA256 wiring, regenerated all1,000 small fixtures with a unique valid JPEG comment for each capture. The real Bulk flow produced1,000 completed photos and40 handoffs. Selecting the exact same1,000 files again showed1,000 duplicates skipped and made no new session, photo, or processing handoff (still1session/1,000photos/40jobs). The fixture change prevents deliberately repeated synthetic content from accidentally collapsing a count test. Existing historical photos without a verified content hash are not silently treated as exact duplicates.

## Folder/camera/location attribution

Selected a real directory containing20 files in four camera subfolders spanning two locations; each camera reused the same five basenames. Used visible per-folder selectors to assign Cameras1–4 and Locations1–2. All20 files survived and completed. Each image's camera ID and preserved source folder matched its chosen source; the app created two transport batches separated by the chosen location, each retaining the location ID and area snapshot. This exercises per-file camera assignment even when two cameras share a transport chunk. Evidence: `source-mapping.json` and `source-mapping.png`.

## Triage and reversible bulk actions

With1,000 regenerated fixtures the default priority view returned300 photos:100 authoritative-score trophies and200 people/vehicle photos. Separate group counts showed600 empty and100 does. Selecting all600 matching empty photos and archiving left400 active records, with trophy100/security200 unchanged. Selecting Archived photos and restoring all600 returned the full set. Found an orthogonal-filter bug (archive visibility cleared the Empty group) and requested correction plus regression.

Selecting the50 loaded trophy photos and choosing Keep produced exactly50 review_status=keep rows. Changing the same50 to Review Later exercised a distinct human-review state, leaving photos and analysis intact. These are actual browser actions and Next API requests against the isolated synthetic data, not SQL/RLS proof. Database review isolation is tested separately.

## Saved views and mobile filters

Saved a Trophy view, switched to All photos, reopened the saved view, and verified the restored URL (`triageView=trophy&sortBy=captured_at&sortDirection=desc`) and100 matching photos. On390px mobile, opened the filter bottom sheet, selected Archived, and confirmed it preserved the Trophy group. The settled dialog stayed within the844px viewport; document width remained390px.

Selected Last7days and saved “Weekly trophy review”. The actual preset API stored `datePreset:last7days`, triageView and sort, with no fixed dateFrom/dateTo. This supports rolling saved intervals rather than freezing the week at save time. The current view URL retained resolved local-day bounds. Cross-day computation is covered separately by the date-preset regression.

## Production build checkpoint and remaining acceptance

The isolated production build at `127.0.0.1:5410` completed a fresh content-tagged 1,000-JPEG run: 40 batches, 1,000 completed photos, zero failed photos, and at most five concurrent transfers. Session creation to upload finalization was 5.133 seconds on loopback. Evidence: `production-final-state.json` and `production-final-upload.png`. Simulator completion timestamps are incomplete emulation; database terminal timestamps are validated separately.

The combined check run `.gstack/triage-runs/2026-09-05T16-21-02.067Z/` passed 145 tests, type-check, production build, and changed-line lint. This is a timestamped checkpoint; later completion-audit fixes require fresh checks. Whole-repository lint is not clean, and concurrent auth/landing changes are preserved and excluded from the changed-line audit scope.

Keyboard activation (focus then Enter) opened a trophy photo and preserved `triageView=trophy`, `sortBy=captured_at`, and `sortDirection=desc`. The accessibility tree exposed unnamed Back, Previous, Next, and Delete controls. Added names, made Previous/Next available on mobile as alternatives to swiping, and made neighboring offscreen pager slides inert. `detail-accessibility-before.txt` records the failure; rendered verification of the updated build remains pending.

The earlier pending-preview browser check observed “Preview preparing” change to the usable Zoom control after synthetic preview completion, without reloading. Detail refresh now bypasses the stale view cache on its bounded polling cadence; independent cache-sequencing regressions cover pending and settled states.

The explicit Simple retry completed retained files without reselection. This revealed stale failure messages next to successful rows; `retry-message-red.log` and `retry-message-green.log` record the regression and correction. A fresh rendered check remains pending.

## Gallery outage and recovery

Injected HTTP503 for image reads while opening the Security view. The real page showed “Failed to load photos” with “Try again”; group counts independently showed unavailable. After ending the outage, clicking Try again restored “Showing 50 of 400 photos” with the same Security/imported ascending URL. Screenshot: `gallery-error.png`; service events are in JSONL. The counts use a separate polling query, so added an explicit Retry counts button to avoid waiting up to a minute. That new button awaits rendered verification with the final build.

## Latest complete build and navigation acceptance

Combined gate `.gstack/triage-runs/2026-09-05T16-38-44.356Z/checks.json`: all four commands passed, including **159 unit/regression tests**, type-check, production build, and changed-line lint. Existing lint findings outside changed lines remain429.

The resulting production build completed another1,000 unique originals with100ms artificial delay per Storage request:40 batches/jobs,1,000 completed photos, zero failures, peakfive transfers,21.984seconds from session creation to upload finalization (`latest-final-state.json`). This measures the intentionally delayed loopback fixture, not internet throughput.

`node scripts/triage-sim/keyboard-acceptance.mjs` passed: keyboard Enter opens a photo, all icon navigation/delete controls have accessible names, keyboard Next/Back preserve Trophy and sort scope, mobile has44px Previous/Next buttons, and synthetic browser TouchEvents advance the pager while retaining filters. Evidence: `keyboard-acceptance.json` and `detail-accessibility-after.png`. Synthetic touch is not physical-device gesture testing or a complete assistive-technology audit. Neighboring offscreen slides are inert. The initial screenshot's Other Animal badge was an emulator classification mismatch (buck/doe in the image classification rather than deer); corrected emulator data/schema.

`node scripts/triage-sim/navigation-acceptance.mjs` passed with50 fresh originals and2seconds delay per transfer. Navigated via the app sidebar while the session was uploading with0processed, then returned. The upload page still showed “Uploading photos…0 of50 complete”; all50 completed across2batches without restarting selection. This verifies in-app ownership across route unmount; it does not assert File persistence after browser closure. Evidence: `navigation-acceptance.json` and `navigation-active.png`.

## Final retry and counts recovery

On the latest production build, two fresh Simple originals encountered an injected batch-insert400. Clicking Retry failed photos without selecting files again produced “Upload Complete /2 of2 complete” with no old failure strings beside either filename. Assertions and browser text: `retry-ui-before.txt`, `retry-ui-after.txt`; server state: `post-retry-state.json`.

A separate image-read503 outage showed both gallery failure and Retry counts. After restoring the fixture service, clicking Retry counts and Try again recovered the independent count/list queries. `gallery-retry-after.txt` records the restored Security view.

## Cancellation acceptance finding

With50 originals and3seconds latency per Storage request, opened Cancel and confirmed the default pending-only cancellation. One25-photo batch had completed; the other was cancelled. The parent session remained cancelled with completion time. The only task after the initial batch processor was the expected cleanup-cancelled-images job, not another analysis handoff. This is HTTP/browser adapter evidence; actual SQL cancellation invariants are separately tested.

The UI incorrectly showed “Upload failed /signal is aborted without reason /Retry failed photos” after this intentional action. `cancel-ui-before.png` and `cancel-active-state.json` capture the red finding. The upload agent is implementing a distinct cancelled outcome with no retry against the cancelled session; final rendered verification remains pending. Cleanup job execution itself is not emulated or claimed verified here.

Following cancellation, the global header still counted all50 rows while the visible catalog contained25 retained photos. Source inspection confirmed both migration061 stats overloads also include cancelled rows: cancelled pending images can remain in pending counts until cleanup succeeds. A separate SQL regression/fix is underway to exclude cancelled child photos while retaining completed photos in a cancelled parent session. This finding is not treated as just emulator behavior.

Account-menu Sign Out navigated to `/login` and removed the private upload UI (`signed-out.txt`); signing back into the isolated fixture account succeeded. Cross-account cache and late-result races are additionally tested with actual QueryClient/QueryObserver instances.

## Cancellation fix verified and final gates

`node scripts/triage-sim/cancel-acceptance.mjs` passed on the rebuilt app. Cancelled a50-photo run after25 completed; the25 completed outcomes remained, no later analysis batch was dispatched, the parent stayed cancelled, and the page showed “Upload cancelled” with Choose new photos and no invalid Retry failed photos action. Evidence: `cancel-acceptance.json` and visually inspected `cancel-ui-after.png`.

Final application gate `.gstack/triage-runs/2026-09-05T16-51-29.968Z/checks.json` passed162 tests, type-check, production build and changed-code lint. The subsequent SQL-only correction passed the current full actual PostgreSQL harness in `.gstack/triage-runs/final/database-completion.log`: both stats overloads exclude cancelled images/detections, keep retained completed children of cancelled parents, and preserve archive-inclusive global totals. Cancellation no longer depends on asynchronous cleanup to remove pending counts.
