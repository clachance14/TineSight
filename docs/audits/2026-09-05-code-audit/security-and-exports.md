# Broader read-only audit — 2026-09-05

Reviewed CONTEXT.md, CLAUDE.md, ADRs 0001/0004/0005, historical security audit, migrations 001/039/046/047/048/049 and relevant auth, matching, cluster, public showcase, export code. No app edits or production writes. Priority below provisional; upload primary audit is separate.

## P1: Background exports always use request-only cookie client
- trigger/jobs/export-photos.ts:106 calls getPhotosForExport, which calls createClient at lib/services/export.ts:55.
- lib/supabase/server.ts:6 calls Next cookies(). Trigger workers have no HTTP request context. Download/upload/sign export helpers repeat the same issue at export.ts:181,210,236.
- app/api/photos/export/route.ts dispatches 26–500 selected photos into this worker. Thus large exports fail while 1–25 can work.
- Local evidence: `node --input-type=module` importing `{cookies}` from `next/headers.js` and awaiting cookies() outside a request prints: "`cookies` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context".
- Fix: inject a worker-safe service client into all export helpers, retaining explicit user_id scope; do not merely change the first helper.

## P1: Export archive deadlock after cookie-client issue is fixed
- trigger/jobs/export-photos.ts:256 awaits archive.finalize(); only at :259 starts streamToBuffer(bufferStream).
- Unconsumed PassThrough blocks ZIP output under backpressure. For normal multi-MB photo collections finalize cannot finish, so consumer never starts.
- Verified with installed real archiver, no mock/network:
```sh
node --input-type=module <<'NODE'
import archiver from 'archiver'; import {PassThrough} from 'node:stream'; import {randomBytes} from 'node:crypto';
const archive=archiver('zip'); const stream=new PassThrough(); archive.pipe(stream); for(let i=0;i<26;i++)archive.append(randomBytes(1024*1024),{name:`photo${i}.jpg`});
let finalized=false; const p=archive.finalize().then(()=>{finalized=true}); await new Promise(r=>setTimeout(r,1500));console.log(JSON.stringify({finalizedBeforeConsuming:finalized,readableLength:stream.readableLength}));stream.resume();await p;console.log(JSON.stringify({finalizedAfterConsuming:finalized}));
NODE
```
Output: `{"finalizedBeforeConsuming":false,"readableLength":65576}` then `{"finalizedAfterConsuming":true}`. A single 1MB case finishes due to intermediate buffering, so tiny fixtures would miss it.
- Fix: consume concurrently before finalizing; ideally stream ZIP upload to avoid holding entire archive plus original buffers in RAM.

## P1 security: Cross-account Buck assignment is accepted
- app/api/detections/[id]/confirm/route.ts:95–99 writes arbitrary valid deerId into caller-owned Detection with no target-owner lookup. lib/services/matching.ts:235 (`correctMatch`) has same flaw; _userId ignored.
- supabase/migrations/001_initial_schema.sql:318–326 detection UPDATE policy verifies only images.user_id. Foreign key on deer_id (:104) proves existence, not ownership; no later same-owner trigger found for detections/deer.
- Trigger: authenticated owner submits own detection ID and another account's known Buck UUID (a public Showcase deliberately exposes curated Buck IDs). This writes a cross-tenant relationship.
- Impact: victim catalog sighting_count poisoned because get_deer_catalog's SECURITY DEFINER aggregate groups ALL detections by deer_id, migration 048:77–83. Caller can then invoke filter_detections_with_images with their OWN user_id and get victim deer.name because the definer LEFT JOIN deer at 048:151 lacks owner guard. Thus actual integrity + private-name disclosure, not merely theoretical RLS style issue.
- Fix: owner check on both sides in API plus DB invariant for all direct PostgREST mutations, and scoped joins/aggregates in definer readers.
- Static proof against checked-in schema; no unauthorized live cross-account writes attempted. Unknown live policies outside migrations remain a validation gap.

## P1 security candidate requiring live grant verification: service-role signs owner-editable arbitrary paths
- lib/services/matching.ts:719–724 signs crop_file_path with admin after checking source Detection belongs to user. Own-row UPDATE policy does not restrict crop_file_path column.
- An authenticated user with direct PostgREST UPDATE permission can set an owned, fingerprinted detection's crop_file_path to a known victim object path, then request Find sightings and receive service-signed access to victim object. Source-row ownership does not prove referenced blob ownership.
- Similar issue possible with owner-updatable images.medium_path, public Showcase RPC returning that path, public page admin signing it (app/showcase/[token]/page.tsx:39–42). Existing storage policy 047 also trusts mutable image path pointers.
- Fix derive deterministic expected crop/variant path from authorized entity ID, or database constraints and restricted column grants that prevent clients changing storage pointers. Verify deployed column grants first. No cross-tenant live exploit attempted.

## P2: Merge sets candidate group count to zero
- lib/services/clusters.ts:293–301 destructures `data` from `select(...,{count:'exact',head:true})` instead of `count`. HEAD data is null, so member_count always overwritten with 0 after a successful merge.
- Same mistake in split at :386–394. UI uses member_count in components/trophy/cluster-card.tsx:39 and naming UI trophy-dashboard.tsx:346.
- Fix use count and check error; verify resulting memberships count.

## P2: Partial split makes remaining candidate group unreviewable
- lib/services/clusters.ts:395 sets source status='split' even when only subset moved. getPendingClusters filters status='pending' (:93), nameCluster rejects non-pending (:476 approximately; verify exact line before final report). Remaining source detections stay member-linked to hidden source.
- Trigger: split two members out of a five-member candidate. New two-member group remains visible; original three cannot be named/merged through candidate UI. Unsorted view may show them individually (trophy.ts filters only pending memberships), but clustering RPC excludes ANY existing membership (048:214,223), so they cannot become a new candidate automatically.
- Fix keep source pending and correct representative/count while any members remain, or deliberately release remaining memberships.

## P2: Pending-match crop URLs still use storage policy that denies crop objects
- lib/services/matching.ts:76 signs crop_file_path using session client. Crops stored flat crops/{detectionId}.jpg. Migration 004 allows own userId prefix; 047 adds thumbnails/medium only, not crops. New Find sightings path explicitly switches admin to workaround this (matching.ts:713–718) but older getPendingMatches does not.
- Trigger: Buck profile pending matches list uses getPendingMatches; URLs null, no visual confirmation crop. Verify live storage policy before classifying fully confirmed; extra live policy may exist.

## Additional lower-priority observations
- Export worker writes metadata.progress={current,total}; status endpoint reads metadata.current/metadata.total (app/api/photos/export/[jobId]/status/route.ts:111 onward): progress never returned.
- Export worker can return success:false without throwing; endpoint maps Trigger COMPLETED to completed and ignores output.success/error, yielding completion without download URL.
- findSightingCandidates pool lacks deleted_at filter (matching.ts:676–682), so previously soft-deleted detections can resurface; hardcoded limit(2000) cannot override actual 1000-row PostgREST ceiling, and decided match list unpaged.
- confirmMatch/correctMatch/batchConfirmMatches ignore database mutation errors and lack atomicity; broad finding needs focused failure injection before expanding priority report.
- Showcase RPC takes hero image only from reference_detection_id, contrary ADR0004 max-scoring hero invariant; if reference gets deleted it renders placeholder even when live sightings remain.

## Historical findings reassessed
- 048 fixes prior public SECURITY DEFINER exposures; do NOT repeat old P0 list as current. Historical audit says live verified, no new live verification here.
- Historical audit claims missing WITH CHECK automatically permits reparenting user_id; that is WRONG because Postgres reuses USING when WITH CHECK omitted. Foreign-reference ownership is the real missing invariant, not textual absence of WITH CHECK.
- compare-deer/reverse-reid-scan now prefetch decided statuses before upserting. Old deterministic rejection-resurrection bug is fixed in non-concurrent cases; there remains read/write race but did not prioritize absent focused reproduction.
- Public Showcase token/noindex/dynamic/owner joins/revocation behavior matches ADR0001; 300s previously issued URL TTL explicitly accepted, not a new defect.

## Coverage gaps
No live DB policy/column grants read, no browser QA, no real ML calls, no production export/tenant mutation tests. Background AI consistency sampled, not exhaustively audited. Destructive photo deletion handled by other agent if within upload scope; did not cover all cancellation/cleanup paths. Scope findings should be described as read-only source audit plus two local runtime harnesses, not complete production certification.
