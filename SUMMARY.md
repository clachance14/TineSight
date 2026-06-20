# Mobile-Core Hardening — Weekend Autonomous Run SUMMARY

**Branch:** `mobile-core-hardening` (off `master`) · **26 commits**, 61 files,
+4093/−1592 · **All green** (build, type-check, `npm run test:unit` 6/6).
**Not deployed, not merged** — awaiting your review.

Plan/decisions: `docs/plans/2026-06-20-mobile-core-hardening.md`, ADRs 0001–0004,
glossary `CONTEXT.md`.

## What shipped (6 steps, each verified green + dual-model quality-swept)

**1. Thumbnail pipeline** — root-cause fix for the iOS Safari memory crash. The
grid was serving full-res originals (avg 907 KB; `thumbnail_path` never written).
Now: server-side thumbnail (≤400px) + medium (~1080px) WebP variants via a
status-tracked Trigger.dev job (ADR 0003). **Backfill complete: 4,114/4,114
photos have variants.** Commits `d86b71d`, `bdcb15c`.

**2. Photos surface** — virtualized, thumbnail-only mobile grid
(`@tanstack/react-virtual`); the list API no longer even signs full-res. Lightbox
shows the medium variant with pinch-zoom + swipe nav; full-res only on explicit
zoom. Commits `2621e69`, `46edd29`, `7907757`.

**3. Trophy Score gate** (ADR 0004) — "trophy" is now decided by a numeric
**Score**, not the cheap `size_class` glance. Pipeline: size glance (drops spikes)
→ mid-cost `estimateAntlerScore` → fingerprint on a confirm band → authoritative
`is_trophy` vs `profiles.trophy_threshold` (default 130). Pure gate math is
unit-tested (`lib/scoring/gates.ts`). **Free SQL backfill restored 397 existing
trophies** from stored fingerprints (0 AI cost). Commits `08101bc`→`8787fbe`.

**4. Deer catalog + buck profile (mobile)** — catalog + profile now serve
medium/thumbnail variants (same budget fix), touch feedback. Commits `8ef8962`,
`5b125f7`, `fb5b602`.

**5. Showcase** (ADR 0001) — NEW public, no-login, revocable token links to
curated trophy bucks. Owner curates in `/showcase`; prospects view a mobile
gallery at `/showcase/<token>`. Public reads go ONLY through a SECURITY DEFINER
RPC returning a sanitized DTO; owner-only RLS + a DB cross-tenant trigger;
noindex/no-referrer/no-store; middleware allowlists only the token path.
**Dual-model security sweep: no P1, no cross-tenant leak.** Commits
`f58485d`→`20986dc`.

**6. Health pass** — removed orphaned Playwright scaffolding; rewrote the badly
stale CLAUDE.md to match reality. Commit `40e998c`.

## DB migrations applied (additive; no photo data deleted)
041 image variants · 042 score columns + threshold + RPC · 043 is_trophy backfill
· 044 showcases + RLS + trigger · 045 public-showcase RPC · 046 RPC hardening.

## Deferred (intentional — your call)

- **Plan 2 (auto re-ID backend)** — automatic trophy-vs-trophy matching on
  confirmation, emitting Match candidates. There are currently **0 match
  candidates**, which is why the mobile match-review swipe UI was also deferred
  (nothing to build against). See `docs/superpowers/plans/2026-06-20-trophy-score-gate.md` roadmap.
- **Plan 3 (surfacing)** — the `size_class='trophy'` → `is_trophy` **read-side**
  migration (gallery/dashboard/stats). The gate *writes* the new signal; reads
  still use the old one (no user-visible break). Exact file:line list is in the
  charter's "Step 3 sweep follow-ups". Also: wire `buckScoreFromDetections` for a
  deer-level canonical score; make the verify script import shared prompt/schema.
- **2 full-res image spots** in the match/create flow (`detections/[id]/matches`,
  create-deer modal) — swap to medium during Plan 2 (charter "Step 4 sweep").

## ⚠️ Cost note — AI corpus reprocess NOT run
The Score-gate pipeline applies to **new** photos automatically. Re-scoring the
existing 4,114-photo corpus would incur **real Gemini cost** (one mid-cost
estimate per non-spike buck + fingerprints for in-band bucks) and was deliberately
NOT run. Run it deliberately if you want existing photos scored under the new gate.

## Not mine — left untouched
`components/auth/login-form.tsx` + `signup-form.tsx` have **uncommitted external
changes** (a signup-success message) that appeared during the run. They compile;
I did not stage or revert them. Decide whether to keep/commit them.

## Known: `npm audit`
35 vulns, all transitive (socket.io/engine.io/ws via the Trigger.dev SDK). Not
auto-bumped (no major bumps without your call).

## How to ship
1. Review branch `mobile-core-hardening` (26 commits since `master`).
2. The husky pre-commit review hook has been **restored** (it was disabled during
   the automated run).
3. Merge to `master`, deploy via Vercel.
4. Optional: run the deferred backfills / Plan 2 / Plan 3 when ready.
