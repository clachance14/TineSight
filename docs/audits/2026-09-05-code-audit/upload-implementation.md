# Upload reliability implementation and verification

Implementation preserves the other session's MIME normalization, failed initialization outcomes, failed empty-session updates, and error display. No live data, migrations, jobs, deploys, or commits were executed.

## Changes

- Both uploaders use a shared five-file limiter across transport chunks. Each file retries before batch handoff. Processing receives only transferred originals; HTTP handoff success is required before local completion.
- Completion is a repeatable PostgreSQL transaction: validates ownership, session cancellation, photo membership, and matching original object size; persists upload_completed_at; derives batch totals from actual image rows. Trigger enqueue uses stable confirmed-ID-set/per-photo idempotency keys.
- Sessions explicitly finish uploading after the last chunk. Database aggregation cannot prematurely mark them completed, and cancelled batches/sessions cannot be reopened by older aggregation logic. Photo terminal-state transitions maintain counters exactly once, including withdrawal of a prior failure when retrying. Old increment RPC becomes a compatibility no-op because the trigger owns counting.
- Failed files retain their File handles for explicit Retry failed photos. Existing reservations retry in place; already-transferred originals are not uploaded again. Retried missing originals return to pending and a changed confirmed-ID set can enqueue new work without duplicating prior per-photo jobs.
- SHA256 of original bytes replaces filename/size identity in both upload flows. Equal names and equal sizes with different content remain separate photos. Already-uploaded equal hashes (including renamed copies) skip; unuploaded reservations and legacy photos without a verified hash do not. Full-file hash buffers are bounded to two concurrent preparation files in Simple and one in Bulk (maximum accepted input 50 MB).
- UUID storage path prefixes prevent same-basename collisions. original_filename and content_sha256 are persisted separately. Upload response mappings use unique storage paths rather than relying on insert response order.
- Bulk offers per-folder camera and historical-location assignment. Batches group files by chosen location before transport chunking; metadata camera detection uses physical serials per file, never one first-file camera for the whole chunk or make/model as physical identity. Unknown cameras remain unassigned. A common optional map location remains available.
- Upload lifetime and cancellation belong to a module-level registry, so in-app gallery navigation preserves active uploads. Explicit cancellation aborts active XHRs and queued work; account-change events abort all runs. beforeunload warns throughout a registered run. Store callbacks ignore missing or already-terminal IDs.
- EXIF worker errors reject pending tasks and fail the broken pool promptly; requests also have a deadline. Simple no longer decodes full-resolution originals into unused browser thumbnails.
- Analysis and variant jobs use fenced, expiring database claims. A scheduled recover-photo-work coordinator re-enqueues ready originals whose handoff was lost or whose worker lease became stale. Analysis persists the Stage1 detection result and uses deterministic detection IDs plus idempotent inserts/enqueues across retries; IDs now match their crop paths. Partial detection failures trigger retry rather than falsely completing the photo.
- Bulk has live analysis status alongside transfer progress. Debug metrics were removed from the operator UI. Completed progress no longer schedules navigation; View photos is explicit. Simple only mounts its progress after a Simple run starts. An all-duplicate import says Already uploaded.

## API/database rollout contract

Apply migrations 054 security invariants, 058 readiness/lifecycle, 059 shared gallery work, and 060 content hashes before shipping dependent application/worker code. Vercel and Trigger.dev deploy separately. This workspace has not applied any migration or deployed any worker.

- POST /api/photos/upload accepts files[].contentSha256 and optional owned files[].cameraId; batch-level location applies to a location-homogeneous chunk.
- POST /api/photos/upload/complete accepts batchId, uploadedImageIds, failedImageIds. Calls finalize_upload_batch(p_batch_id,p_uploaded_ids,p_failed_ids), returning {image_ids:[...]}; SQL verifies storage.objects metadata.size. An all-failed batch returns status failed without enqueue.
- POST /api/upload-sessions/[id]/complete calls finish_upload_session(p_session_id).
- POST /api/photos/check-duplicates accepts contentSha256 on each file and returns existingHashes (plus legacy response fields). It calls get_uploaded_content_hashes(p_hashes), returning only confirmed hashes for the authenticated account. Arrays travel in the RPC body, avoiding PostgREST URL-length limits.
- Worker claim_photo_work(p_image_id,p_kind,p_claim_at) is service-role only. New persisted fields include upload_completed_at, content_sha256, analysis_claimed_at, analysis_result, variant_claimed_at, and session upload_finished_at.

## Executed checks

`node --test lib/upload/*.test.ts`: **36 passed** (includes existing other-session regressions). New checks exercise actual Next route modules with backend/Trigger adapters stubbed, actual shared transfer orchestration, original-byte hashes, the actual worker pool, and actual progress component effects.

Covered: 1000 scheduled transfers never exceed five active; initial transfer retry precedes handoff; 429/503/timeout failures retry three total attempts; exhausted transfers are excluded from processing; failed handoff never reports completion; 503 handoff retries preserve acknowledgment ordering; cancelled queued files all settle without storage/enqueue; invalid init requests fail before batch creation; missing originals do not enqueue; lost Trigger response retries use the same idempotency key; owner-scoped session completion; different content under equal filename/size does not dedup; same content reselects identically; legacy absent hash does not auto-skip; failed EXIF worker settles.

`npm run type-check`: **passed** after implementation and peer changes.

`TINESIGHT_TEST_UPLOAD=1 TINESIGHT_PGLITE_MODULE=/tmp/tinesight-db-tests/node_modules/@electric-sql/pglite/dist/index.js node scripts/verify-security-invariants.mjs`: disposable PostgreSQL checks passed for storage-missing/wrong-size rejection; confirmed readiness; authenticated denial of worker claims; duplicate active claim denial; repeated terminal update counted once; failed→processing contribution withdrawal; absorbing cancellation and late-finalization rejection. Security agent owns the expanded hash/tenant suite.

Root-agent browser evidence (independently reported; this agent did not mutate that browser fixture): real Next UI/API against isolated Supabase/Trigger simulation uploaded **1000 distinct JPEG originals**, generated **2000 simulated variants**, completed **40 batches/40 jobs**, observed **maximum five transfers**. Re-selecting identical originals created **zero additional originals, sessions, or jobs** and skipped all 1000. These are simulation/functionality results, not real Gemini accuracy, production throughput, or device memory claims.

## Captured red-to-green progress regression

Root observed Bulk complete→Simple tab unexpectedly navigate to /photos while selecting files. The component-level regression replays a completed shared queue and executes effects/timers.

```
git show HEAD:components/photos/upload-progress-panel.tsx > /tmp/tinesight-old-upload-progress.tsx
UPLOAD_PROGRESS_SOURCE=/tmp/tinesight-old-upload-progress.tsx node --test lib/upload/progress-regression.test.ts
# RED: scheduled navigation count 1 !== 0
node --test lib/upload/progress-regression.test.ts
# GREEN: no scheduled navigation and no router.push
```

The earlier real-worker harness similarly reproduced an unresolved promise after worker module error; the worker-pool test now rejects promptly.

## Limits to keep explicit

- Legacy originals lack SHA256 until separately hashed/re-imported; they are conservatively retained rather than guessed duplicates.
- Hash preparation currently precedes transfer, so first-preview latency includes preparation of the selected set. Browser1000 fixture does not prove the old impossible 30GB/100Mbps/<15-minute target; its physical lower bound is 40 minutes.
- Per-folder assignments are explicit for the current import. Physical cameras without serial metadata require a user-selected existing camera; folder names are not silently assumed to be camera identity.
- Scheduled recovery requires deploying the new Trigger.dev coordinator. A database-only or Vercel-only rollout does not activate it.

Additional browser evidence from root: Bulk-complete→Simple now stays on Upload; forced initialization400 marks the session failed with completion timestamp and explains each failed file. Added actual shared-store retry tests verify reservation reuse, no retransmission of saved bytes, File retention after initialization failure, and ignored late old-account callbacks.

Final resilience checks cover a stalled worker deadline terminating its pool and control-plane deadlines remaining active with caller cancellation signals. Cancellation enumerates batches in pages and mutates 100 batch IDs per request, with exact counts to avoid response truncation on large imports.

Cancellation regressions: actual service mock covers 1,201 batches / 30,025 photos, verifies all batch pages and mutation URL caps/exact counts. Account-change event aborts all runs and removes unload prompt synchronously before auth reload.

Final scoped ESLint: 15 upload runtime files, zero findings (`/tmp/upload-lint-now.json`), including nullable API response typing, physical metadata unknown validation, explicit function results, and original File availability checks. Root separately owns final lint of active-session hook/progress panel. Upload suite final output: `/tmp/tinesight-upload-final-tests.log`, 36 passed. Whole-project typecheck passed before peer final lint edits; final combined gate belongs to root.

Completion audit follow-ups: persisted worker budgets cap automatic work at three lifetime claims; owner-requested retry resets only failed work via dedicated RPC. Exhausted final leases settle once. Bulk unreadable originals remain failed/retryable while readable peers proceed. Full latest PGlite log `/tmp/tinesight-db-budget-validation.log`; item-specific evidence `upload-completion.md`.
