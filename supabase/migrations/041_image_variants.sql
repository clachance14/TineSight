-- Migration 041: Image display variants (thumbnail + medium)
--
-- Adds variant tracking to the images table to fix the iOS Safari memory crash
-- (full-resolution images decoded en masse). See ADR 0003.
--
-- ADDITIVE ONLY. Originals (file_path + storage objects) are never touched.
-- `thumbnail_path` already exists (migration is historical) but was never written.

-- Medium variant path (~1080px WebP) for lightbox / public Showcase.
ALTER TABLE images
  ADD COLUMN IF NOT EXISTS medium_path text;

-- Variant lifecycle status. path-null alone is ambiguous at scale
-- (not-started vs failed vs racing vs legacy), so track explicitly.
ALTER TABLE images
  ADD COLUMN IF NOT EXISTS variant_status text NOT NULL DEFAULT 'pending';

-- Last variant-generation error message (for observability / retry triage).
ALTER TABLE images
  ADD COLUMN IF NOT EXISTS variant_error text;

-- Constrain the status to the known lifecycle states.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'images_variant_status_check'
  ) THEN
    ALTER TABLE images
      ADD CONSTRAINT images_variant_status_check
      CHECK (variant_status IN ('pending', 'processing', 'ready', 'failed'));
  END IF;
END $$;

-- Partial index to let the backfill coordinator and the live "ensure" path
-- find images that still need variants without scanning the whole table.
CREATE INDEX IF NOT EXISTS idx_images_variants_pending
  ON images (variant_status)
  WHERE thumbnail_path IS NULL OR medium_path IS NULL;

-- Existing rows: 4,114 photos have no variants yet. Leave them 'pending'
-- (the default). The backfill coordinator will pick them up. We do NOT mark
-- them anything else here — the status reflects reality: variants not yet built.
COMMENT ON COLUMN images.variant_status IS
  'Lifecycle of display variants: pending|processing|ready|failed (ADR 0003)';
