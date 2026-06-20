# 3. Image variants via a dedicated, status-tracked Trigger.dev job

Date: 2026-06-20
Status: Accepted

## Context

The photo grid served full-resolution originals (avg 907 KB, max 2.36 MB across
4,114 images; `thumbnail_path` existed but was never written) → iOS Safari memory
crash. We need server-side thumbnail + medium WebP variants. Scale grows to tens
of thousands of photos.

The obvious place to generate variants is inline in `trigger/jobs/analyze-photo.ts`,
which already downloads the full image into a Buffer and runs Sharp. But that job's
hot path also makes brittle Gemini calls that throw and re-run on retry. Coupling
user-visible grid delivery to the AI analysis pipeline is the wrong reliability
domain: a Gemini failure would deny thumbnails, and every analysis retry would
redo image resizing. (Codex cross-check argued this explicitly.)

## Decision

Variants are produced by a **dedicated, idempotent, status-tracked Trigger.dev
job**, not inline in analysis.

- New job `generate-image-variants` is the single source of truth. It is the unit
  reused by both the live path and the backfill.
- **Triggered on upload** (when the image row + original are created).
- `analyze-photo` does **not** generate variants; it opportunistically *ensures*
  them (enqueue the job if variant paths are missing) so analysis never owns image
  delivery and never re-resizes on Gemini retry.
- **Status machine on `images`** (additive migration), not path-null guessing:
  - `medium_path text null`
  - `variant_status text` ∈ `pending | processing | ready | failed` (default `pending`)
  - `variant_error text null`
- **Idempotent DB-claim**: the job updates `variant_status='processing'` where
  status is `pending|failed` (or paths null); if no row was claimed, it skips.
  Then it uploads, then persists paths + `variant_status='ready'` in a final
  update. Storage uploads use deterministic paths (`thumbnails/{imageId}.webp`,
  `medium/{imageId}.webp`) with `upsert: true`.
- **Failure isolation**: Sharp/storage errors set `variant_status='failed'` +
  `variant_error`; they do not throw up into (or block) photo analysis.
- **Sharp hardening**: `.rotate()` (honor EXIF orientation), `.limitInputPixels()`
  guard, `.toColorspace('srgb')`, `webp({ quality, effort })`. The ≤400px / <40 KB
  thumbnail and ~1080px medium are targets, not hard constraints (don't chase
  bytes into quality/retry churn).
- **Backfill** is a coordinator job that pages `images` where variants are missing
  and enqueues per-image `generate-image-variants` runs — resumable, concurrency
  capped conservatively against Supabase Storage, one original in memory at a time.
- **Consumers**: grid uses thumbnail, lightbox/Showcase uses medium, original is
  reserved for download/zoom.

**Absolute constraint:** variants are additive. Originals (`file_path` + storage
objects) are never deleted or overwritten.

## Consequences

- **Positive:** Grid delivery is decoupled from the AI pipeline; thumbnails exist
  even when detection fails. The status machine makes progress observable and
  backfill/retry safe at scale. Same job serves live + backfill (no duplicate
  logic).
- **Negative / cost:** Three new columns and a second job to maintain; an extra
  download of the original in the variant job (vs reusing analyze-photo's buffer)
  — accepted as the price of decoupling. A brief window after upload where a photo
  has no thumbnail yet (covered by the existing blurhash placeholder).
- Cross-model: Claude + Codex agree on decouple + status machine + coordinator
  backfill.
