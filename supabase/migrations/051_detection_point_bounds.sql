-- 051_detection_point_bounds.sql
--
-- Makes the antler point-range filter expressible as a SQL predicate, so the photo
-- query can filter it through an embedded `detections!inner(...)` join instead of
-- resolving a list of image ids in JS and sending them back as `.in('id', [...])`.
--
-- Why this matters: PostgREST serializes `.in()` into the query string. Each uuid
-- costs 37 bytes, and the request starts failing between 250 and 500 ids (~9KB ok,
-- ~18KB rejected — measured). The point-range filter matches 694 images on a small
-- test account, so the id-list path was already past the ceiling and would only get
-- worse as accounts grow. Migration 050 removed the truncation that had been
-- accidentally keeping those lists short, which made the overflow reachable.
--
-- `estimated_point_range` is free text like "8-10". These STORED generated columns
-- pull out the two bounds using the SAME regex the JS predicate used, so a value
-- that does not match stays NULL and is excluded by any comparison — matching the
-- old behaviour, where a non-matching range returned false.
--
-- Overlap semantics (unchanged): a detection matches when its range overlaps the
-- requested one, i.e. point_max >= p_min AND point_min <= p_max.

BEGIN;

ALTER TABLE detections
  ADD COLUMN IF NOT EXISTS point_min int
    GENERATED ALWAYS AS (((regexp_match(estimated_point_range, '(\d+)-(\d+)'))[1])::int) STORED,
  ADD COLUMN IF NOT EXISTS point_max int
    GENERATED ALWAYS AS (((regexp_match(estimated_point_range, '(\d+)-(\d+)'))[2])::int) STORED;

-- Supports the embedded overlap filter. Partial: rows with no parseable range can
-- never match, so they do not belong in the index.
CREATE INDEX IF NOT EXISTS idx_detections_point_bounds
  ON detections (point_min, point_max)
  WHERE deleted_at IS NULL AND point_min IS NOT NULL;

COMMIT;
