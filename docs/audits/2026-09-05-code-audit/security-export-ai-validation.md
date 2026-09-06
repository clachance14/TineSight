# Security, exports, candidates, and AI capacity — remediation verification

Changes are local and reviewable. No production database changes, deployed workers, billable model calls, or external-user mutations were performed.

## Implemented

- Migration 054 rejects cross-account Detection→Buck, Match→Buck, Buck reference, Photo→batch/camera/location, and batch→upload-session relationships. RPC catalog aggregates and detection/deer joins remain account-scoped even if historical bad rows exist. Catalog date columns are explicitly cast to the declared timestamp return type.
- Crop pointers are worker-managed: authenticated callers cannot create or change them. Legacy crops used a UUID different from their Detection row; these remain supported. New analysis rows persist the crop's Detection ID. Flat crop-only paths are validated before service signing. Photo variant paths must match their Photo ID; originals must stay within the owner's prefix without path traversal. Showcase hero paths derive from owned Photo IDs and choose the best live authoritative score.
- Direct and corrected match confirmation validate target Buck ownership. Failed Detection writes no longer report successful match confirmation. Batch confirmation rejects contradictory choices for the same Detection. Manual sighting search excludes soft-deleted Detections and actually pages its intentional 2000-fingerprint bound, including all recorded decisions.
- Candidate-group merge reads HEAD `count`, not null `data`; partial splits preserve the remaining reviewable group and select a remaining representative.
- Worker export helpers accept an explicit Supabase client instead of accessing request cookies. Queries chunk UUID lists to 100 and retrieve each Photo's best live Detection without global truncation.
- Background exports drain ZIP output to bounded temporary disk and stream the finished file to Storage. Each append waits for its entry to finish, bounding source buffers. Temporary files and streams are cleaned on failure/success. This removes the finalize-before-consume deadlock and the whole-ZIP memory allocation.
- Export size preflight preserves the existing 500 MiB bucket cap (migration 036), allowing for ZIP overhead. Known oversized selections return 413 with "Split them into smaller exports." Unknown metadata is permitted and bounded by actual ZIP bytes. Polling maps failed output correctly and provides both nested progress and the top-level counters consumed by the existing modal.
- Gemini calls use structured transient status handling, Retry-After and SDK RetryInfo hints, exponential backoff with jitter, per-attempt abort deadlines, and total retry budgets. Permanent errors do not retry. Implicit retired 1.5/2.0 fallbacks are removed; at most one explicitly configured fallback is allowed. Detection now uses the configured fallback too.
- Paid analyze/fingerprint/compare jobs share one named Trigger queue: default 5 tasks and 2 crop calls per analysis task, for default 10 concurrent provider calls instead of the old 50×10 analysis fanout. Settings are bounded (max 20 jobs×4 crop calls). Existing TRIGGER_CONCURRENCY_LIMIT remains accepted with the new maximum.

## Runtime evidence

Targeted suite:

```sh
node --experimental-strip-types --test lib/export/export-regression.test.ts lib/export/limits.test.ts lib/security/candidate-regression.test.ts lib/security/matching-regression.test.ts lib/gemini/retry.test.ts lib/gemini/capacity.test.ts
```

Red→green cases included request-cookie use outside an HTTP request, a 26 MiB real archiver deadlock, merge count 0, hidden partial split remainder, unauthorized match correction, ignored write failure, structured 429/503 handling, and hung provider requests. Additional tests cover the actual client passing abort signals/model fallback,1000 simultaneous simulated retrying tasks limited to 3000 total attempts,500-photo query chunking, unknown export size and archive limit failures, and both progress DTO formats. No Gemini requests are sent.

Disposable PostgreSQL runtime (PGlite package installed outside the repository):

```sh
npm install --prefix /tmp/tinesight-db-tests --no-audit --no-fund @electric-sql/pglite
TINESIGHT_TEST_UPLOAD=1 TINESIGHT_PGLITE_MODULE=/tmp/tinesight-db-tests/node_modules/@electric-sql/pglite/dist/index.js node scripts/verify-security-invariants.mjs
```

The harness first reproduces the original RLS hole, then loads 054/058/059/060 against realistic small tables with authenticated RLS. It verifies forbidden/allowed foreign-key writes, immutable legacy crop pointers, photo path traversal rejection, scoped RPCs, Showcase path derivation, object existence/size finalization, worker-only claim grants, duplicate claims, terminal counters/retries, cancellation, score vs estimate, soft-delete/reparent/hard-delete/threshold tier updates, security+trophy overlap, review tenant isolation, and owned ready-content-hash dedup. It never opens a production connection. This is executable SQL validation, not a full Supabase/PostgREST deployment certification.

## Provider facts and remaining deployment limits

Gemini quotas apply per project and vary by model/tier across RPM, TPM and other dimensions; concurrent calls are not the same as a quota guarantee. Actual account capacity must be read in AI Studio. [Official rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

Google documents Gemini 2.0 shutdown on June 1, 2026; the current deprecation table lists no shutdown for Gemini 2.5 Flash. Existing calibrated 2.5 remains the default, with supported alternate models explicitly configurable. [Official deprecations](https://ai.google.dev/gemini-api/docs/deprecations?hl=en).

The retry behavior follows Google's advice to retry transient 429/408/5xx failures with bounded backoff and jitter, rather than retrying permission/validation errors. [Official troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting).

These simulations establish bounded behavior under synthetic faults, not vendor throughput or cost guarantees. Request cancellation bounds client wait, but the provider may still charge for server work already accepted. Trigger code requires its own deployment, separate from Vercel. Migrations must be applied together with the matching application/worker rollout after reviewing existing schema-ledger drift.

## Account boundary follow-up (T31)

Reproduced three failures with real TanStack QueryClient/QueryObserver instances: first auth notification retained unscoped cache, effect remount forgot the identity attached to the persistent client, and clearing the cache left mounted observers displaying the old account. The boundary now retains identity per QueryClient, clears unknown state on initialization without reloading, and resets/remounts the initial account subtree. A real identity change synchronously hides the subtree and performs document navigation, dropping server-rendered private props, local component state, and mutation closures. Same-user refresh preserves state. Header async profile results are ignored after unmount. Batch selection and hovered/pinned detections reset alongside upload/photo/edit state.

The server signed URL cache previously keyed only by path: a second account requesting a path already signed for the first received its token without another storage authorization check. Single and batch regression tests reproduced this and now pass with required authenticated user IDs in cache keys and all four API call sites. Legacy original/medium fallback is preserved; invalidation removes a path across all account partitions.

Upload account-change integration additionally exposed a beforeunload trap: aborted runs retained the navigation warning until async finally blocks. Upload agent changed cancellation to synchronously release that guard and added signal/late-response guards around session creation and control-plane calls. A real EventTarget regression verifies both concurrent run controllers abort, beforeunload is released immediately, and the next account can start a fresh run.

Validation: 28 security/export/Gemini/auth/cache node tests pass, plus the active-run event regression; `npx tsc --noEmit --pretty false` passes. Commands and output: `/tmp/tinesight-security-final-tests.log`; auth/cache tests under `lib/auth` and `lib/cache`, active-run under `lib/upload`. Browser behavior still requires the root full-app simulation; these tests exercise real Query observers and browser-style events but do not claim production token revocation or actual browser navigation timing.

Migration061 also passes disposable PGlite verification: qualitative trophy/gross100 stays excluded; qualitative standard/gross180 is included even if caller supplies false; changing owner threshold190 then130 updates flags; authoritative stats stay owner-scoped. Harness `scripts/verify-security-invariants.mjs` runs054/058/059/060/061 together with `TINESIGHT_TEST_UPLOAD=1`; latest output `/tmp/tinesight-db-validation.log`. This validates PostgreSQL behavior against a minimal fixture, not live hosted schema deployment.

## Open photo refresh and pager recovery (T21/T17)

The detail viewer previously treated its signed URL expiry (about an hour) as the lifetime of the whole photo DTO. Opening a pending variant could therefore keep showing Preparing after processing completed, and later score edits stayed stale. The viewer now refreshes visible pending work every five seconds for the first minute, then every thirty seconds; settled views refresh every sixty seconds for score changes. Hidden tabs pause scheduling, returning tabs refresh immediately, requests cannot overlap within a polling cycle, and each fetch has a fifteen-second abort timeout. Account changes/unmount stop future work and abort current requests. Current-photo guards prevent results for a previous slide replacing the next one.

A small request loader deduplicates prefetches and aborts superseded requests before forced refresh; late responses cannot overwrite newer cached DTOs. Failed pager loads no longer silently return stale/null content: the viewer shows a Retry action, including retrying the originally attempted direction. Automatic image-error refresh remains limited once per photo to avoid broken-object loops; manual retry is explicit.

`node --experimental-strip-types --test lib/photos/view-refresh.test.ts` passes three regression cases: pending DTO with hour-long expiry becomes ready through forced refresh, late prefetch cannot overwrite a newer response, account/unmount abort prevents late cache writes and 503 is retryable. Viewer/helper ESLint is clean. Full browser pending-to-ready/pager recovery is delegated to the root integration simulation; these unit cases do not claim browser gesture coverage.
