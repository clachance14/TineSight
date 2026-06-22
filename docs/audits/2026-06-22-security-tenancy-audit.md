# Security + Tenancy Audit — Groundtruth Loop (Goal 1)

**Date:** 2026-06-22 · **Mode:** read-only, no code changes · **Loop:** `loops/groundtruth-audit-loop/`
**Scope:** security + multi-tenant isolation only (architecture / perf / deploy deliberately out-of-scope this goal).
**Method:** 5 parallel read-only security agents, one per seam; evidence cited to `file:line` from migration SQL + app code.

## Plain-language overview

Multi-tenant isolation is **mostly strong** — 100% RLS coverage on all 19 tables, an exemplary public-Showcase path, a clean `detections` tenancy seam, and service-role secrets correctly confined to the server. **One real exposure class was found:** a cluster of `SECURITY DEFINER` RPCs that trust a caller-supplied `p_user_id` and never compare it to `auth.uid()`. Because RLS is bypassed inside `SECURITY DEFINER` and the anon/auth key ships in the browser bundle, an authenticated user can call these RPCs directly with another tenant's UUID and read their data; several are (per migration SQL) callable by `anon` with no login at all. This is the headline finding and the priority for remediation (Goal 1b).

## Severity rollup (UPDATED after live-grant verification 2026-06-22)

**Live DB confirms the worst case: `anon` has `USAGE` on `public`, and every cross-tenant RPC below is granted `EXECUTE` to `PUBLIC, anon, authenticated` with `search_path` UNPINNED. These are reachable WITHOUT authentication via the public anon key (shipped in the browser bundle) or raw PostgREST. The earlier "P1 candidate" items are now confirmed P0.**

| Severity | Count | Items |
|---|---|---|
| **P0 — confirmed, anon-reachable cross-tenant read** | 7 RPCs | `filter_detections_with_images`, `get_deer_catalog`, `get_pending_matches_summary`, `get_deer_sightings`, `get_photo_stats` (×2 overloads), `get_unassigned_trophy_detections`, `find_similar_deer` — unauthenticated attacker passes any `p_user_id`/`query_user_id` → reads that tenant's deer catalog, photo metadata, file paths, sightings, antler fingerprints |
| **P1 — confirmed, anon integrity** | 2 | `increment_batch_counters`, `increment_session_counters` — anon can corrupt any tenant's progress counters (no ownership check) |
| **P2** | ~13 | RLS UPDATE missing `WITH CHECK` (8 tables); `search_path` UNPINNED on all 13 non-showcase definer fns; `has_account_access` granted to PUBLIC/anon (returns bool, low risk); PII in auth log; verbose Gemini logging; stale `debug-log` dir |
| **Low / Info** | 4 | Showcase traversal runtime-test gap; signed-URL TTL window; dead query branch; Google Maps key (cloud-console hardening) |

**Live evidence:** `has_schema_privilege('anon','public','USAGE') = true`. `get_public_showcase` is the ONLY definer fn correctly fenced (no PUBLIC grant, `search_path=public, pg_temp`) — the model the other 13 must follow. NOTE: the live grants are BROADER than the migration files (024 fns were `GRANT … TO authenticated` in SQL but live shows PUBLIC+anon too) → a blanket `GRANT EXECUTE … TO anon`/default-PUBLIC is in effect; remediation must `REVOKE` explicitly, not just re-grant.

## Area → evidence → severity (no silent gaps)

### Seam A — RLS coverage (all 19 tables) — VERDICT: strong, P2 hardening only
- All 19 tables `ENABLE ROW LEVEL SECURITY`. No `USING (true)`, no base-table policy granted to `anon`/`public`. `has_account_access()` (`001:156-173`) = owner OR accepted team member.
- **P2:** 8 tables have `FOR UPDATE` policies with `USING` but **no `WITH CHECK`** → an owner could re-point `user_id`/FKs out of tenant: `cameras` (`001:249`), `images` (`001:268`), `deer` (`001:287`), `processing_batches` (`002:120`), `upload_sessions` (`025:40`), `locations` (`028:49`), `trophy_clusters` (`039:64`), `trophy_cluster_members` (`039:72` ALL). Template already correct in `filter_presets` (`017:53`), `showcases`/`showcase_bucks` (`044`).
- **Info:** `batch_metrics` RLS-enabled, zero policies = default-deny (intended, service-role writes) (`019:30`).

### Seam B — SECURITY DEFINER functions — VERDICT: **P0/P1 cross-tenant exposure**
Root defect: function trusts caller-supplied `p_user_id` as authorization instead of deriving scope from `auth.uid()`. Compounded by default `EXECUTE TO PUBLIC` (no REVOKE in pre-046 migrations) and unpinned `search_path`.

| Function | Migration:line | EXECUTE (per SQL) | Leak | Sev |
|---|---|---|---|---|
| `get_unassigned_trophy_detections` | `042:28`/`039:93` | PUBLIC/anon | `antler_fingerprint` + `crop_file_path` any tenant | **P0?** |
| `find_similar_deer` | `005:31`/`002:223` | PUBLIC/anon | deer names + image paths (no live app caller) | **P0?** |
| `filter_detections_with_images` | `024:115` | authenticated | detections + deer_name + file/thumbnail paths (richest) | **P1** |
| `get_deer_catalog` | `024:9` | authenticated | deer names, notes, file_paths | **P1** |
| `get_pending_matches_summary` | `024:71` | authenticated | file/thumbnail/captured_at | **P1** |
| `get_deer_sightings` | `024:188` | authenticated | sightings + file_paths | **P1** |
| `get_photo_stats` | `021.1:4`→`032`/`033` | authenticated | cross-tenant aggregate counts | **P1** |
| `increment_batch_counters` | `003:12` | PUBLIC | integrity: corrupt any batch counters | P2 |
| `increment_session_counters` | `038:12` | PUBLIC | integrity: corrupt any session counters | P2 |
| `get_public_showcase` | `046:9` | anon,auth (REVOKE PUBLIC) | **proved-safe** — token-gated, fixed DTO, search_path pinned, per-join `user_id` re-check | none |
| triggers (`handle_new_user`, `update_session_on_batch_change`, `enforce_showcase_buck_same_owner`) | 001/025/044 | n/a | not directly callable; safe | none/P2 |

- **P2 (systemic):** all pre-046 definer fns lack `SET search_path` (escalation vector) and lack explicit `REVOKE … FROM PUBLIC`.
- **UNVERIFIED / BLOCKED:** the above reflects **migration SQL defaults**, not the live DB grant state. Confirm blast radius with read-only: `SELECT routine_name, grantee, privilege_type FROM information_schema.role_routine_grants WHERE specific_schema='public';` and confirm PostgREST exposes `public` to `anon`. The P0-vs-P1 line depends on this. The **design defect (trusts `p_user_id`, no `auth.uid()` check) is real regardless of grants** → P1 floor confirmed.

### Seam C — `detections` tenancy borrow — VERDICT: proved-safe (no leak)
- RLS on `detections`/`detection_rois`/`roi_feedback`/`match_candidates`/`deer_embeddings` all scope via `images.user_id` join (`001:298`, `005:94`, `005:159`, `002:171`, `002:30`).
- Every service-role (RLS-bypassing) job query operates on IDs server-derived from already-tenant-scoped queries (`trigger/jobs/*`; e.g. `cleanup-cancelled-images.ts:97-100,158`; `deer/match/route.ts:50-55`). No admin-client query accepts an unverified user-supplied id.
- **Info:** dead, never-executed `detectionsQuery` branch `app/api/deer/match/route.ts:39-47` — remove to avoid a future maintainer wiring the unscoped variant.

### Seam D — Public Showcase surface — VERDICT: proved-safe (ADR-0001 holds)
- Service-role client on `app/showcase/[token]/page.tsx:25-43` used ONLY for `get_public_showcase` RPC + signing the RPC-returned owner-scoped `medium/*.webp` path against the `photos` bucket. No caller-controlled path/table reaches it.
- Middleware allowlist `^\/showcase\/[^/]+$` (`lib/supabase/middleware.ts:49`), default-deny; owner mutations all `getUser()` + `.eq('user_id', …)` + RLS + cross-tenant trigger (`044:57-75`). Token ≈192-bit. Uniform 404 (no revoked-vs-missing oracle). `no-store`/`noindex`/`no-referrer` (`next.config.ts:29`).
- **Low:** traversal/normalization verified by static reasoning, not a live request → add a gstack QA assertion (`/showcase/%2e%2e%2fdashboard`, `/showcase/x/y`).
- **Info:** signed-URL valid for its 300s TTL after revocation (documented, accepted).

### Seam E — Secrets & log hygiene — VERDICT: no P0/P1
- `SUPABASE_SERVICE_ROLE_KEY` read only in `lib/supabase/admin.ts:22`; all 18 importers server-only; no `'use client'` reads a non-public env var. Gemini key server-only (`lib/gemini/client.ts:24`). `.env*` gitignored; only `.env.example` tracked (placeholders).
- `NEXT_PUBLIC_*` = Supabase URL, anon key, Google Maps key — all browser-safe by design.
- **P2:** PII (userId/email/fullName) logged at `lib/services/auth.ts:38`; verbose Gemini response/token logging `lib/gemini/client.ts:186,258`; stale empty `app/api/debug-log/` dir (route removed, dir remains).
- **P2 advisory:** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is correctly public but lock it down in Google Cloud Console (referrer + API restrictions). Out-of-repo → unverified.

## Stopping condition
**Met.** Every in-scope area is logged with evidence + severity. No code was modified during the audit.

## Goal 1b remediation status (2026-06-22)
- **P0/P1 (Seam B) — REMEDIATED + VERIFIED LIVE.** Migration `048_harden_security_definer_functions.sql` (Codex-reviewed, VERDICT APPROVE) applied to TineSight prod (`fdwgmtzdjywvrnipatlk`). Post-apply live check: anon/PUBLIC EXECUTE removed from all 13 functions (0 remaining excl. the intentionally-public `get_public_showcase`); `search_path` pinned on all (0 unpinned); ownership guard `assert_self_or_service` in place; least-privilege grants applied.
- **NEW FINDING — migration ledger drift (process, P2).** Remote `supabase_migrations.schema_migrations` contains 001–040 only; **041–048 schema is live but unrecorded** in the ledger (041–047 applied out-of-band; 048 applied directly/transactionally, bypassing `db push` precisely to avoid replaying 041–047). Recommend reconciling with `supabase migration repair --status applied 041 042 043 044 045 046 047 048` so future `db push` behaves. 048 is idempotent (CREATE OR REPLACE / ALTER / REVOKE-GRANT) so a future replay is harmless.
- **Still open (low-sev tail, deferred per plan):** Seam A P2 (8 UPDATE policies missing `WITH CHECK`); Seam E P2 (PII log at `auth.ts:38`, verbose Gemini logging, stale `debug-log` dir); Seam D Low (Showcase traversal QA test); dead query branch.

## Recommended remediation order (Goal 1b — needs approval)
1. **Confirm live grants** for the Seam B functions (read-only query above) to fix P0-vs-P1.
2. **Seam B fixes:** add `IF p_user_id <> auth.uid() THEN RAISE EXCEPTION` (or drop `p_user_id`, use `auth.uid()`); `REVOKE EXECUTE … FROM PUBLIC` + `GRANT … TO authenticated` (counters → `service_role`); `SET search_path = public, pg_temp`. Model: migration 046.
3. **Seam A P2:** add `WITH CHECK` mirroring `USING` on the 8 UPDATE policies; add a `pg_policies` regression assertion.
4. **Seam E P2:** stop logging the auth response body; gate Gemini logs behind a debug flag; delete stale `debug-log` dir.
5. **Low/Info:** Showcase traversal QA test; remove dead query branch.
