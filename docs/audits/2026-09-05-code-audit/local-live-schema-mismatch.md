# Local photo loading failure: database release dependency

Reported URL: `http://localhost:3410/photos?triageView=all&sortBy=best_score&sortDirection=desc`.

The running local app uses the shared live Supabase database, at migration053 when reported. Its real server log records HTTP500 and PostgreSQL42703 for missing `images.upload_completed_at`; the default Priority view additionally fails on missing `images.triage_tier`.

A matched-target, trusted-TLS, read-only SQL reproduction confirms that `upload_completed_at`, `triage_tier`, `review_status` and `content_sha256` are all absent. The preflight counted4,101 photos and zero non-cancelled pending/processing photos. No live writes were performed during that initial diagnosis. The direct reproduction is `/tmp/tinesight-readonly-db/photo-schema-check.mjs`, run with `NODE_EXTRA_CA_CERTS=/tmp/tinesight-readonly-db/supabase-root.crt`; it exits1 with42703 until the required schema exists.

The earlier successful browser tests used the migrated simulator/disposable PostgreSQL schema. They did not prove that the unrolled-out app could run against schema053. The completion report's deployment prerequisite is the cause of this actual local failure, not an intermittent network error.

## Prepared correction

Reviewed migration files:054 security reference invariants;058 original readiness, lifecycle and processing budgets;059 triage/review;060 content hashes;061 numeric Trophy readers and cancellation-safe stats. Their invariant harness passes against a disposable PostgreSQL engine. The matching web/API and Trigger jobs must ship coherently; an old uploader cannot establish the new readiness contract for new workers. Recheck active work immediately before any release, apply migrations in order, deploy compatible app/workers/recovery schedule, reload the PostgREST schema cache, then repeat this actual database check and authenticated browser/API request.

Applying this correction changes the shared production database and background behavior even though the reported URL is localhost. The user subsequently authorized the coordinated live rollout. Migrations054,058,059,060,061 were committed atomically after a successful rollback rehearsal; the matching production app and Trigger20260905.1 were promoted. The original SQL reproduction now passes and authenticated local/production requests return200. See [rollout verification](rollout-verification.md).

## Why not silently remove the predicates

Dropping the readiness predicate admits reservations whose originals never arrived. Deriving Trophy from best_score is also incorrect: the old summary mixes gross scores with estimates, including photos that contain both. An exact compatibility implementation would require coordinated legacy list/IDs/pager/count queries and still could not persist Keep/Review later without schema support. This would be a separate legacy mode, not equivalent to the requested triage workflow.
