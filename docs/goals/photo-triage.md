# Photo triage execution goal

**Completed locally on September 5, 2026.** The [completion review](../audits/2026-09-05-code-audit/completion-review.md) links the requirement evidence and remaining deployment/provider validation. Changes are uncommitted and not deployed. This runbook remains available for repeatable verification.

Implement the September audit and recovered operator intent: frequent imports from dozens of cameras across multiple locations, fast removal of noise, trustworthy filtering and human-confirmed Buck identities. The full item inventory is [photo-triage.json](photo-triage.json); every item needs evidence or an explicit remaining dependency. No finding silently disappears because another feature received attention.

Run `node scripts/triage-goal.mjs status` for the complete backlog, `next` for pending items, `record T01 active "evidence"` to update it, and `verify` for logged unit/type/build checks. A passing check does not automatically close the goal. Mark an item done only when its specific acceptance conditions have evidence.

## Baseline and work ownership

Claude's finished uncommitted work fixes MIME fallback, batch initialization errors, empty-session failure handling, failed-run messaging, and dropdown visibility. Its report records browser reproduction for both flows and live repair of Drew's stale session. Preserve those changes and unrelated landing-page work. Recheck the finished code; the unrecoverable July 31 initiating request remains unknown.

Root owns this ledger, simulation/observability, browser QA, auth-cache handling, and integration. Assigned workers own gallery correctness, remaining upload/job reliability, and security/export/candidate consistency. File ownership is coordinated before edits; no broad reset/stash or overwriting another worker's changes.

## Required run matrix

Use 1,000 synthetic image files across 20 Cameras and five Locations. Include capture-time ties, null dates, old camera clocks, known source metadata, duplicate basenames, exact reselections, bucks/does/other wildlife/empty/people/vehicles, varied score/quality and uncertain detections. Simulated AI results have known expected membership; they do not measure Gemini recognition accuracy.

Exercise the real uploader UI and Next API against isolated fixture persistence/storage/provider adapters. Capture every file's state transitions, HTTP status/latency, queue/concurrency/retry totals, console errors, screenshots, DOM/image counts and browser memory where available. Logs must exclude credentials, cookies, full signed URLs, original private photos and unrelated user data. Keep generated artifacts under ignored `.gstack/triage-runs`.

Happy path must account for 1,000 unique intended inputs without repeated/missing records and show usable previews/results while processing continues. Failure matrix: empty MIME, malformed EXIF, worker failure, init 400/500, storage timeout/disconnect, handoff failure, partial successful chunks, page navigation/reload/reselection, cancellation before/during/after dispatch, authentication expiry, duplicate callbacks, provider 429/Retry-After/503/timeouts, exhausted retries and late job completion.

Check every filter, sort, pager, count and bulk action against the same expected IDs. Probe 1,001/1,200/10,000 metadata rows, tied and null cursors, large source selections/URL length, archive/restore, security frames, uncertain photos and account switching. Verify desktop keyboard and mobile touch flows, clear empty/error states, progress/retry affordances and saved views.

## Limits and evidence labels

Docker is unavailable in this WSL environment, so a local Supabase stack is not currently runnable. The HTTP simulator is an explicitly simulated dependency layer, not evidence of real Postgres/RLS or production provider capacity. Validate SQL invariants separately where possible. Every report distinguishes: actual app/SDK execution, simulated persistence/provider behavior, measured local performance, and unverified live limits.

Keep Google Gemini and Trigger.dev. Inspect current official rate/model/queue limits; do not copy old hardcoded quotas or benchmark paid providers by blindly sending 1,000 AI calls. Use deterministic fault injection first. Live provider probes must be bounded, named, cost-aware and have a stop condition. No unbounded reprocessing of existing photos. Production deployment/migration remains a separate final operation after reviewable code and verification.

Relevant sources: [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [Gemini troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting), [Trigger limits](https://trigger.dev/docs/limits), [Trigger idempotency](https://trigger.dev/docs/idempotency). Account-specific limits require checking the configured project; public documentation does not establish its capacity.

## Definition of complete

All tracked defects are fixed and verified, or precisely documented as externally blocked with an actionable dependency. Core upload→triage passes the 1,000-file browser run and failure matrix. No missing/duplicate outcomes, stale terminal states, silent errors, incorrect source relationships, pagination gaps, cross-account references/cache exposure or destructive filter mismatches. UI improvements follow DESIGN.md and the later Score/security-surface intent. Meaningful regression tests, changed-code lint, type check and production build pass. Record remaining deployment requirements and external live-validation limits honestly. Preserve red and green evidence and a final concise operator-facing summary.
