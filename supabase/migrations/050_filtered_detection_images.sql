-- 050_filtered_detection_images.sql
--
-- Problem: getPhotos / getPhotoIds / getAdjacentPhotos each resolved the distinct
-- set of image ids matching a detection filter by selecting EVERY matching row out
-- of `detections` and de-duplicating in JS. Two failures came out of that:
--
--   1. CORRECTNESS. An unbounded PostgREST select is silently truncated at the
--      project's `max-rows` (1000). On an account with 41,467 detections the
--      prefetch saw 2.4% of them, so every detection-filtered view silently lost
--      almost all of its photos — no error, and the rows that survived skewed to
--      whatever Postgres returned first, so the NEWEST uploads were what vanished.
--   2. COST. Paging around the cap fixes correctness but costs one round-trip per
--      1000 rows — ~42 sequential calls (~5.7s measured) per filtered page load.
--
-- Fix: do the filtering and the DISTINCT in Postgres and return the id set as a
-- single-row uuid[]. An array is ONE row, so `max-rows` cannot truncate it and the
-- whole prefetch collapses to one round-trip regardless of account size.
--
-- The point-range predicate mirrors the previous JS overlap test exactly
-- (/(\d+)-(\d+)/ on estimated_point_range; a value that does not match is excluded).
--
-- Hardened per migration 048: SECURITY DEFINER + assert_self_or_service ownership
-- guard + pinned search_path, EXECUTE revoked from PUBLIC/anon.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_filtered_detection_images(
  p_user_id uuid,
  p_quality_status text DEFAULT NULL,
  p_min_confidence numeric DEFAULT NULL,
  p_sex text DEFAULT NULL,
  p_size_class text DEFAULT NULL,
  p_deer_id uuid DEFAULT NULL,
  p_min_points int DEFAULT NULL,
  p_max_points int DEFAULT NULL
)
RETURNS TABLE(image_ids uuid[], total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_self_or_service(p_user_id);

  RETURN QUERY
  WITH matched AS (
    SELECT DISTINCT d.image_id
    FROM detections d
    JOIN images i ON i.id = d.image_id
    WHERE i.user_id = p_user_id
      AND d.deleted_at IS NULL
      AND (p_quality_status IS NULL OR d.quality_status = p_quality_status)
      AND (p_min_confidence IS NULL OR d.confidence >= p_min_confidence)
      AND (p_sex IS NULL OR d.sex = p_sex)
      AND (p_size_class IS NULL OR d.size_class = p_size_class)
      AND (p_deer_id IS NULL OR d.deer_id = p_deer_id)
      -- Point-range OVERLAP, mirroring the JS predicate this replaces:
      --   match = /(\d+)-(\d+)/ ; no match -> excluded
      --   min defined and match[2] <  min  -> excluded
      --   max defined and match[1] >  max  -> excluded
      AND (
        (p_min_points IS NULL AND p_max_points IS NULL)
        OR (
          regexp_match(d.estimated_point_range, '(\d+)-(\d+)') IS NOT NULL
          AND (
            p_min_points IS NULL
            OR ((regexp_match(d.estimated_point_range, '(\d+)-(\d+)'))[2])::int >= p_min_points
          )
          AND (
            p_max_points IS NULL
            OR ((regexp_match(d.estimated_point_range, '(\d+)-(\d+)'))[1])::int <= p_max_points
          )
        )
      )
  )
  SELECT
    COALESCE(array_agg(m.image_id), ARRAY[]::uuid[]),
    COUNT(*)::bigint
  FROM matched m;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_filtered_detection_images(
  uuid, text, numeric, text, text, uuid, int, int
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_filtered_detection_images(
  uuid, text, numeric, text, text, uuid, int, int
) TO authenticated, service_role;

-- No new index: migration 009 already created the exact same partial index for
-- this predicate (idx_detections_not_deleted ON detections (image_id) WHERE
-- deleted_at IS NULL). A second copy under a different name would not be caught
-- by IF NOT EXISTS (that matches on NAME, not definition) and would only add
-- write amplification on every detection insert.

COMMIT;
