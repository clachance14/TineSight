# Pre-commit review findings — commits d3c423e and 8a4d38b (2026-09-05)

The husky pre-commit review ran on both commits. Everything it marked blocking was
fixed before the commit landed. This file records what it found and did NOT fix, so
the deploy-time items are not lost.

**The hook fails open.** `.husky/pre-commit` treats any non-zero exit from its nested
`claude --print /review` as a tool error, prints "Proceeding with commit (review tool
error)." and exits 0. The final run of `8a4d38b` hit a monthly spend limit, so that
commit landed unreviewed by the hook; its content is the reviewed tree plus the
`finalize_upload_batch` fix below. To confirm a commit was reviewed, grep its output
for `REVIEW_RESULT: PASS`.

## Fixed before commit

- **`authNextPath` open redirect** (`lib/auth/navigation.ts`). A tab inside the path
  (`/%09/evil.example`) passed the single-slash guard, survived the header layer, and
  the browser's URL parser stripped it, resolving off-site. Reachable through
  Supabase's `redirect_to` on a recovery or magic-link email. Now rejects every ASCII
  control character; tab, LF, CR and NUL are covered in `lib/auth/navigation.test.ts`.
- **`finalize_upload_batch` tenant guard was a tautology** (migration 058). The bare
  `unnest(...) id` alias let the inner `i.id=id` resolve both sides to `images.id`, so
  any submitted photo id passed, and the SECURITY DEFINER `UPDATE`s that follow had no
  batch predicate: a caller could mark another tenant's photo completed or failed. The
  unnest now names its column and both writes are scoped to the batch. Reproduced and
  fixed in PGlite; `scripts/verify-security-invariants.mjs` checks a foreign id in
  either list is rejected with nothing written.

## Fix before deploying migrations 054-062 (still unapplied)

- **[P1] Lock-order inversion** (058:77-80, 101-103). The RPCs lock session then batch;
  the image to batch to session trigger chain locks batch then session. Concurrent
  completion at the end of an upload can deadlock. The victim surfaces as 40P01, which
  the routes map to 400 or 409, and `acknowledgedFetch` treats both as permanent. Lock
  the batch before the session.
- **[P2] 058:151-153 demotes historical batches.** The rewritten completion trigger
  moves completed to processing when counts fall short, and the unconditional repair at
  058:65-68 fires it on every batch, so batches with hard-deleted photos or old
  over-counts flip to processing permanently. Recompute `total_images` in the repair, or
  restrict the reverse transition to rows already processing.
- **[P2] `analysis_result`, `upload_completed_at` and the claim timestamps are
  owner-writable** through PostgREST; only the attempt counters are trigger-protected. A
  client can PATCH a fabricated detection array and force paid Gemini work per entry.
- **[P2] `get_photo_stats` is the one reader without the readiness predicate**
  (061:99-106). Its CTEs filter only on `is_cancelled`, so a reservation whose complete
  call never ran inflates header totals and keeps the 3s active-batch poll running.
- **[P2] `recover-photo-work.ts:22-33`** re-enqueues every still-pending photo on each
  five-minute sweep with a fresh key. Age-gate the pending predicate.
- **Rollout.** Only terminal sessions get `upload_finished_at` in the 058 backfill, so
  old-bundle tabs mid-upload stay at uploading. Migration 054 re-validates `file_path`
  on any location or camera update: preflight legacy rows where
  `split_part(file_path,'/',1) <> user_id`. Re-run the 058:11-14 backfill once after the
  web app and Trigger workers are both live.

## Other open items

- **[P2] `detection-roi-editor.tsx:42` decodes the full-res original** on a touch
  surface. This is the ADR 0003 crash class; the route already returns `previewUrl`.
- Triage counts materialize the account's full id set per request; compute in SQL.
- `text-score-gold` and `font-fraunces` are not tokens in `app/globals.css`; the Score
  numeral and six section titles render untyped. Use `text-brass-light` and
  `font-display`.
- `npm run test:ui` runs in no gate, and ADR 0002 still says no Vitest (F8 is undecided).
- `check-duplicates` switched identity to content hash, so hash-less callers never dedupe.
- Three scripts write `is_trophy` explicitly, which the 061 trigger overrides.

Auth-commit items left open: login now depends on a service-role profile upsert, so a
deploy without `SUPABASE_SERVICE_ROLE_KEY` fails every sign-in; a transient profiles
select error redirects provisioned users to `/login?error=account-setup`; Supabase's own
error codes are no longer surfaced on the landing page; `components/ui/button.tsx`
changes the global default variant while the matching dashboard restyle is not in that
commit; and `docs/design/hero-photo-candidates.md` marks the landing hero photo
"Website permission not confirmed".
