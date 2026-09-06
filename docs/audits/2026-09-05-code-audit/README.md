# TineSight code audit — September 5, 2026

**Remediation update:** See [completion review](completion-review.md) for the current implementation, verification and deployment requirements. The findings below are the initial audit snapshot; they are preserved as historical evidence, not a list of unresolved defects.

The main upload and photo-browsing flows contain significant runtime defects despite passing the build and type checks. The most immediate browsing defect is that infinite pagination ignores its cursor and repeatedly requests the first page. Uploads have several paths that report success without successfully starting processing, lose failed initialization work, or cannot resume interrupted transfers.

This is an audit and remediation backlog. Application code was not changed. Three specialist reviewers examined uploads, gallery/sorting, and security/exports; the lead reviewed history, verified evidence, ran repository checks, and checked Drew's account read-only. Code snapshot: `5d5f5ef`. Existing uncommitted landing-page work was preserved.

The user's clarified workload—dozens of cameras across multiple locations, with several bulk imports per week—also produced a concrete [operator workflow proposal](operator-workflow.md). It prioritizes source mapping, an import review inbox, reversible trash triage, event grouping, and reusable filters. It elevates another P1: the upload API assigns the first file's Camera to an entire mixed-source chunk, and same-model cameras without unique identifiers can collapse into one Camera. See the proposal's code evidence before building richer location/camera filters.

The follow-up [planning-intent map](planning-intent.md) grounds that proposal in the original PRD, foundation session, feature specs 002/004/005/010/012, and June ADRs. It separates unfinished requirements from new suggestions and resolves older defaults against the later trophy-first/security-surface decision.

**Concurrent work:** the user confirmed another session is editing application files. During this audit, changes appeared in both uploader components, upload progress, upload-session services, and new upload configuration/outcome/status helpers and tests. Findings and the 41-test/build results below describe the earlier reviewed snapshot, not a final assessment of those evolving fixes. In particular, MIME normalization and run/session outcomes are being changed. No application files were overwritten, committed, reset, or stashed by this audit. Reconcile the upload findings against the other session's finished diff before treating them as remaining blockers.

## Drew's incident: verified facts and remaining uncertainty

Read-only database queries on September 5 confirmed:

| Item | Observed state |
| --- | --- |
| July 26 session | Completed; 18 batches; session total 854 |
| Stored photos | 849; all `detection_status=completed`, all `variant_status=ready` |
| July 31 session | `uploading`; zero photos recorded in its total; zero batches both in totals and related batch rows |
| Capture timestamps | January 1–6, 2020 |

The stored July 26 photos are not waiting for AI processing. The July 31 session is stale, but zero batches alone cannot distinguish leaving the page from failed initialization. The five-photo difference between the older session total and stored rows also needs transfer-level evidence before attributing it to a specific defect.

The EXIF worker failure reproduced below happens before Bulk Upload creates a session, so it does **not** by itself explain a newly created empty session. Initialization failures after session creation are a relevant failure path, not a proven cause of Drew's incident. No browser trace or original failed request was available.

Capture-date ordering legitimately puts 2020 photos below recent captures. Whether the default should instead be **Recently uploaded** is a product choice. Do not silently replace camera timestamps to make sorting look correct; offer a separate import-date sort and, if desired, an explicit clock-correction workflow.

## Highest-priority findings

P1 means core-flow failure, data integrity, or account isolation; P2 means a narrower correctness/recovery issue. Evidence is labeled as runtime reproduction, source trace, or a deployment-dependent candidate in the detailed reports. Security source findings have not been exploited against live accounts.

| ID | Priority | Finding and impact | Evidence |
| --- | --- | --- | --- |
| G1 | P1 | Pagination never consumes the API cursor. Next-page requests repeat the first 50 photos; older photos cannot be reached normally. | [photos.ts](../../../lib/services/photos.ts#L621), [runtime proof](reproduce-gallery.cjs) |
| U1 | P1 | Both upload flows ignore unsuccessful `/upload/complete` responses. Successful storage transfers can be shown as complete while processing was never queued. | [BulkUploader](../../../components/upload/BulkUploader.tsx#L617), [simple upload](../../../app/(dashboard)/upload/page.tsx#L359) |
| U2 | P1 | Processing dispatch precedes transfer retries and includes pre-created rows whose originals are missing. Later successful transfer retries do not enqueue processing again. | [completion API](../../../app/api/photos/upload/complete/route.ts#L82), upload report #2 |
| U3 | P1 | Batch-initialization exceptions become `null` and disappear from the work list. Files can remain pending while the UI declares completion; empty sessions can remain uploading. | [BulkUploader](../../../components/upload/BulkUploader.tsx#L632), upload report #3 |
| U4 | P1 | Dedup treats reserved image rows as uploaded files. Reselecting a folder after interruption can skip originals that never reached storage. | [duplicate API](../../../app/api/photos/check-duplicates/route.ts#L106), upload report #4 |
| U5 | P1 | Worker errors do not settle EXIF promises. A failed worker script leaves preparation waiting indefinitely. | [ExifWorkerPool](../../../lib/upload/ExifWorkerPool.ts#L111), runtime harness in upload report |
| U6 | P1 | Duplicate filtering drops distinct same-basename files; new same-name files in one batch also share a storage path. Recursive folder uploads can lose or conflate photos. | [dedup consumer](../../../components/upload/BulkUploader.tsx#L493), [storage path](../../../lib/services/photos.ts#L1222) |
| G2 | P1 | Opening a tile discards filters, and the viewer independently hardcodes imported-date descending order. Browsing leaves the selected set or changes sequence. | [tile navigation](../../../app/(dashboard)/photos/page.tsx#L173), [adjacency](../../../lib/services/photos.ts#L973) |
| S1 | P1 | Detection confirmation accepts another account's Buck UUID. Checked-in policies validate the source photo but not the target Buck; definer readers can then miscount sightings and disclose the foreign Buck's name. | [confirm endpoint](../../../app/api/detections/[id]/confirm/route.ts#L95), security report |
| S2 | P1 | Upload initialization accepts a foreign session UUID. An owned batch can trigger privileged aggregation into another account's session. | [upload endpoint](../../../app/api/photos/upload/route.ts#L197), upload report #6 |
| E1 | P1 | Background exports call request-cookie helpers from a Trigger worker, which lacks an HTTP request context. Exports of 26–500 selected photos fail. | [export service](../../../lib/services/export.ts#L55), security report |
| E2 | P1 | After fixing E1, normal large ZIP exports can still deadlock: archive finalization is awaited before consuming its output stream. | [export worker](../../../trigger/jobs/export-photos.ts#L256), real-archiver reproduction in security report |

## Additional consequential findings

See the detailed reports for triggers, precise references, and proposed fixes. These are separate issues rather than alternate explanations of Drew's incident.

- **Progress accounting:** analysis attempts increment processed/failed counters before rethrowing for retries. One photo can count multiple times and complete a batch prematurely. Count terminal transitions once, not attempts. [Upload #8](upload.md)
- **Gallery cache limit:** `maxPages=10` holds the flattened count at 500, but the load-more latch keys only on that count. After cursor repair, loading still stops as pages are evicted; earlier pages have no restoration path. Network failure also leaves the latch without a retry path. [Gallery #4](gallery.md)
- **Dates:** Today becomes a single-midnight timestamp range; other presets exclude most of their final day. Custom dates cannot open because the parent drops controlled preset state. Use an explicit timezone and exclusive next-day upper bound. [Gallery #5–6](gallery.md)
- **Hidden failures:** the active gallery forces its child query error to null; failures can look like an empty account. Polling watches detection status but not independent preview generation, so a finished preview can remain visually pending. [Gallery #7–8](gallery.md)
- **Cancellation:** browser abort is disconnected from ongoing requests and loops; server cancellation does not fence pending or later-arriving batches. Switching tabs can leave uploads running from an unmounted component. [Upload #11–12](upload.md)
- **Memory/network pressure:** Simple Upload decodes full originals into unused thumbnails; chunk-level parallelism can launch up to 300 file XHRs. The gallery starts a second unused unfiltered query, and ordinary detail viewing can fall back to multiple full-resolution originals. [Upload #9–10](upload.md), [Gallery #10–11](gallery.md)
- **Bulk selection:** the API fast path ignores legacy `areaName` when combined with detection filters, selecting a broader set than the gallery. The relevant bulk UI appears unmounted, so this is an API defect rather than a claim that today's visible selection toolbar deletes extra photos. [Gallery #9](gallery.md)
- **Candidate groups:** merge/split reads `data` from a HEAD count query, so saved counts become zero. A partial split marks the remaining source group `split`, removing it from pending review despite remaining members. [Security and exports](security-and-exports.md)
- **Archive visibility:** the archive endpoint writes `is_archived=true`, but the active list API does not parse `isArchived` and normal browsing applies no exclusion. Archiving therefore does not remove frames from the default gallery. Its broad no-deer archive selector also needs reconciliation with the later separate people/vehicle surface before reconnecting that UI. [Filtering intent details](filter-intent-detail.md)
- **Trophy semantics remain inconsistent:** `lib/services/trophy.ts:76,84,96,111,178,426` and `lib/services/fingerprint.ts:68` still filter qualitative `size_class='trophy'`. This is already acknowledged as deferred work in CLAUDE.md; the numeric Score gate and these screens can disagree. Resolve the migration explicitly rather than labeling it a newly discovered regression.

## Two additional lead-review findings

**P1 — Account switching retains private query data.** The root provider survives client navigation, and `lib/query-client.ts:21–30` returns a browser singleton. `components/dashboard/header.tsx:41–44` signs out and navigates without clearing it; login also uses client navigation. Photo and catalog query keys omit account identity (`lib/hooks/use-photos.ts:256`, `lib/hooks/use-deer.ts:64,86`). A second account using the same tab can initially receive the previous account's cached rows and still-valid signed image URLs. This is browser-state exposure, not a server RLS bypass.

An isolated harness using the actual transpiled query-client module and installed TanStack client seeded account A's photo key, then fetched that key with an account B query function. Output: `sameClient=true`, returned owner `account-A`, `accountBNetworkCalls=0`. It verifies the cache mechanism; the complete browser logout/login sequence was not exercised. Clear/cancel user queries and upload/selection state on auth changes, and include account scope in query keys.

**P2 — Preview processing has no stale-claim recovery.** `trigger/jobs/generate-image-variants.ts:51–65` only claims `pending` or `failed`. A hard termination after claiming `processing`, or a failed error-status write at lines 120–123, leaves future jobs skipping that row. Ordinary caught errors do retry; this finding concerns a process death or failed persistence. Add a lease/start timestamp with stale reclaim and check failure-state writes. This was raised in June history and remains in current code. It does not explain Drew's existing 849 ready previews.

## Remediation sequence and acceptance criteria

1. **Secure tenant relationships.** Verify deployed policies, then enforce same-owner invariants for detection→Buck and batch→session in the database and API. Check mutable storage-path grants before resolving the separate path-signing candidate. Test two isolated accounts and ensure rejected relationships cannot affect counters or reader results.
2. **Make uploads recoverable.** Consolidate the two active orchestration paths around per-file identity and separate reserved/transferred/queued/processed states. Check every handoff result; retry idempotently; fence cancellation; reject worker failures or time out to metadata-free fallback. Validate interrupted transfer, init 500, completion 500, duplicate basenames, mixed MIME metadata, refresh/resume, and cancel during initialization.
3. **Repair browsing as one coherent flow.** Use the same filter and stable `(sort value, id)` order for grid, pager, and bulk ID selection. Handle null sort values explicitly. Preserve filter context; repair date controls; make cache eviction and load-more compatible. With 1,200 fixture photos, traverse the entire set with no repeated/missing IDs under newest, oldest, highest score, equal timestamps, and null scores.
4. **Repair secondary workflows.** Make background export helpers worker-safe and start stream consumption before finalizing. Verify 25-, 26-, and 500-photo boundaries. Fix group counts/partial splits, then finish Score-based review semantics.
5. **Add checks at failure boundaries.** Existing pure tests do not cover these service/worker/UI contracts. Preserve useful diagnostics as regression tests with correct-behavior assertions, and add focused browser checks using the repository's established QA approach. Avoid treating build success as end-to-end proof.

These are actionable work packages, not authorization to publish changes or write production data. The audit made no such changes.

## Verification and coverage

| Check | Result |
| --- | --- |
| `npm run type-check` | Passed |
| `npm run test:unit` | 41 passed, zero failed |
| `npm run build` | Passed, 47 static pages generated |
| `npm run lint` | Failed: 2,527 errors and 26 warnings; existing repo backlog, not audit-introduced |
| Actual photo service + installed Supabase builder | Reproduced identical first/next-page requests in both query branches; proved omitted area predicate in bulk-ID fast path |
| Actual EXIF worker pool + failing worker stub | Promise stayed pending after worker error |
| Installed Next cookies helper outside request | Reproduced request-scope exception |
| Installed archiver with 26 × 1 MB random buffers | Finalization blocked before consumption, completed after consumption |
| Actual query-client module | Reproduced reuse of previous account's fresh cached data |
| Drew's sessions and photo statuses | Read-only live verification described above |

Run `node docs/audits/2026-09-05-code-audit/reproduce-gallery.cjs` to replay the offline gallery diagnostic. Its successful exit **confirms current defects**, rather than validating correct behavior; it is deliberately not registered as a passing regression test. The upload/export reports include their reproduction commands. No AI calls, photo uploads, exports, production mutations, deployment, or authenticated browser/device QA were performed.

Ten Trigger job files use `@ts-nocheck`; unit tests cover six pure-logic files. The passing gates therefore provide limited evidence about the background processing contracts. No dependency vulnerability scan or complete live-grant audit was performed. Browser performance and actual iPhone memory behavior remain unmeasured in this audit. Dead/alternate routes and AI cost/accuracy behavior were sampled rather than exhaustively verified.

## Session-history coverage and historical findings

Reviewed available top-level TineSight conversation text from **18 pre-existing local transcripts**: one current Claude investigation and 17 older Codex sessions, plus the repository's historical audit/ADR documents. Excluded this audit's own five root/worker session files from that count. Read the metadata index for **96 older Claude sessions**, but their referenced transcript files are absent locally; those are summaries only. No claim is made to have reviewed unavailable/cloud-only conversations or every historical tool log.

Recurring themes were bulk SD-card imports, Safari image-memory crashes, photo visibility beyond database row limits, numeric Trophy Score versus qualitative classification, and review/navigation context. Prior findings were checked against current code rather than copied forward indiscriminately:

- Migration 048 addresses the prior public definer-RPC exposures. The older audit records live remediation; those old P0 findings are not presented as current defects here.
- Missing `WITH CHECK` alone is not a valid finding: PostgreSQL can reuse the policy's `USING` expression. The remaining relationship issues concern ownership of referenced entities.
- The public Showcase route matcher and token access controls were tightened; the accepted five-minute signed-image revocation window is not a new bug.
- The shared photo-filter refactor and bounded ID collection repaired several July row-limit issues, but did not preserve cursor pagination in `getPhotos`.
- Some earlier pager event/retry/edit-state issues have fixes in the June commit history. The surviving filter/order defects are documented separately.

Detailed evidence: [uploads](upload.md), [gallery and sorting](gallery.md), [security, exports, and candidate groups](security-and-exports.md).
