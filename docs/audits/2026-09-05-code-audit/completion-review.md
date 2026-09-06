# Photo-triage remediation completion review

The local audit/remediation and isolated acceptance work is complete. Changes remain uncommitted and are not deployed. This report does not claim production bugs have disappeared before the migrations, web app, and Trigger workers ship together.

## Requirement evidence

The full requirement-by-requirement ledger is `docs/goals/photo-triage.json` (T01–T46); `node scripts/triage-goal.mjs status` prints it. The runbook is `docs/goals/photo-triage.md`.

| Scope | Authoritative evidence |
|---|---|
| Prior intent and Claude handoff | `planning-intent.md`, `operator-workflow.md`, upload/filter intent detail reports; current MIME/init-failure tests and browser failure/retry. Drew's historical repair remains attributed to Claude. Eighteen available top-level session transcripts were read;96 older indexed Claude transcripts were unavailable. |
| Import readiness, recovery, identity, source mapping and cancellation | `upload-completion.md`, actual route/transfer/worker/store regressions, current PostgreSQL harness, `browser-simulation.md`. Includes per-file hash failure isolation, acknowledged handoff, shared transfer limit, folder/camera/location mapping, exact-content duplicates, persistent processing budgets and authorized manual retries. |
| Triage, filtering, ordering, selection and review | `gallery-implementation.md`, actual service/query regressions, PGlite numeric-score/review invariants, browser archive/restore600 and Keep/Review Later50. Default Trophy/security prioritization, independent review state, saved relative views, coherent filter URLs, stable cursors and complete matching selection are implemented. |
| Security, export and background capacity | `security-completion.md`, `security-export-ai-validation.md`, actual cache/observer/API/archiver/Gemini adapter tests and PostgreSQL assertions. Privileged signing/ownership, account transitions, export error/progress/size behavior, numeric Trophy eligibility, retries/concurrency/idempotency and terminal recovery are covered. |
| Operator UX and capacity | `browser-simulation.md`; repeatable keyboard, navigation and cancellation acceptance scripts;1,000 real JPEG uploads,2.439GB large-file run with injected503s,10,000-record metadata ordering/selection, mobile filters and synthetic touch. |
| Optional product directions | `events-and-investigations.md` assesses burst grouping, camera comparisons, daylight/clock prerequisites and explicit selection semantics. New event-grouping/comparison/daylight features are proposals, not falsely labeled implemented. |

## Latest gates

- `.gstack/triage-runs/2026-09-05T16-51-29.968Z/checks.json`:162 tests pass, type-check pass, production build pass, changed-code lint pass. Existing429 lint findings outside changed lines remain; concurrent auth/landing changes are preserved and separately identified in the lint report.
- `.gstack/triage-runs/final/database-completion.log`: current actual054/058/059/060/061 PostgreSQL invariant harness. The disposable database supplies the relevant roles/tables; it is not a replay of every production migration or a multi-connection load test.
- `keyboard-acceptance.json`: keyboard open/next/back and mobile navigation/synthetic swipe preserve filters; named44px controls and inert offscreen slides.
- `navigation-acceptance.json`:50 originals continue through in-app navigation and complete without reselection.
- `cancel-acceptance.json`: cancel during50 originals;25 completed remain,25 unfinished stop, parent stays cancelled, no subsequent analysis handoff, no invalid retry button.
- `retry-ui-after.txt`: failed two-file Simple initialization recovers without reselection and clears stale errors.
- `latest-final-state.json`:1,000 originals complete with40 batches/jobs, peakfive transfers and21.984seconds under100ms artificial per-request latency. Earlier2.439GB loopback run recovered three503s. These timings do not estimate internet throughput; post-run heap is not peak device memory.

Browser and raw service artifacts above are under ignored `.gstack/triage-runs/simulator/`. Repeatable source scripts and the concise evidence reports are in the worktree.

## Live verification and rollout work

The correct live database was inspected in a matched-target read-only transaction with trusted Supabase CA and hostname verification. It reports latest migration053; sampled table RLS, policy definitions and RPC ACLs are recorded in `live-readonly-metadata.json`. No production data or schema was changed by this audit.

Before release, review the migration ledger and apply the intervening repository migrations in order through061. Coordinate compatible web/API and Trigger worker deployment, drain incompatible old workers, and enable the recovery schedule. A database-only or Vercel-only release is incomplete. Perform the two-account readiness/cancellation/retry/export smoke test described in `security-completion.md` on the intended deployment. Existing live grant findings are a pre-migration snapshot, not certification of undeployed guards.

Gemini project/model RPM/TPM, hosted Trigger scheduler/queue behavior, real-device memory, internet throughput, and Gemini classification accuracy remain deployment validation work. Vendor retries and queue exposure were tested deterministically without billable provider traffic. The1000-job/3000-attempt fixture is single-model; an optional fallback doubles default attempt exposure. These controls are not a dollar budget.

After browser closure, users must reselect local files; completed verified originals are skipped, incomplete reservations are not. Browser File objects and byte offsets are not persisted. Historical originals without content hashes are conservatively retained. Large exports remain subject to the existing500MiB ZIP/storage limit and500-photo selection cap, with explicit errors/split guidance. Simulated TouchEvents do not replace physical-device or assistive-technology testing. Concurrent score changes do not provide snapshot-isolated pagination, and multi-operator merge/split transactions remain outside the verified single-operation behavior.
