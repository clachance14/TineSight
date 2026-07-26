-- 052_point_bounds_from_enum.sql
--
-- Fixes a filter that silently returned nothing for most of the catalog.
--
-- `detections.estimated_point_range` is not free text: lib/gemini/types.ts constrains
-- it to six values — spike, fork, "6-8 points", "8-10 points", "10+ points", unknown.
-- Migration 051 derived its bounds with the regex `(\d+)-(\d+)`, which parses exactly
-- two of those six. Everything else got NULL bounds and was excluded by any comparison.
--
-- On live data that is 82% of rows ("10+ points" alone), and on a bred-for-antlers
-- operation that tier IS the trophy tier — so a "10 or more points" filter returned
-- precisely nothing. The regex came from the JS predicate this all replaced, so the
-- behaviour predates 051; 051 only made it permanent by storing and indexing it.
--
-- Mapping (open-ended tier is inclusive-upward, per product decision):
--   spike        -> [2, 2]
--   fork         -> [4, 4]
--   "6-8 points" -> [6, 8]
--   "8-10 points"-> [8, 10]
--   "10+ points" -> [10, 99]     99 = open upper bound; no rack reaches it
--   unknown/NULL -> [NULL, NULL] (never matches a bounded filter, as before)
--
-- The numeric branches are kept ahead of the word branches so any future free-text
-- value like "12-14 points" or "14+" still parses without another migration.
-- `~` / `~*` are IMMUTABLE, which STORED generated columns require.

BEGIN;

DROP INDEX IF EXISTS idx_detections_point_bounds;

ALTER TABLE detections
  DROP COLUMN IF EXISTS point_min,
  DROP COLUMN IF EXISTS point_max;

ALTER TABLE detections
  ADD COLUMN point_min int GENERATED ALWAYS AS (
    CASE
      WHEN estimated_point_range IS NULL THEN NULL
      WHEN estimated_point_range ~ '(\d+)\s*-\s*(\d+)'
        THEN ((regexp_match(estimated_point_range, '(\d+)\s*-\s*(\d+)'))[1])::int
      WHEN estimated_point_range ~ '(\d+)\s*\+'
        THEN ((regexp_match(estimated_point_range, '(\d+)\s*\+'))[1])::int
      WHEN estimated_point_range ~* '^\s*spike' THEN 2
      WHEN estimated_point_range ~* '^\s*fork'  THEN 4
      ELSE NULL
    END
  ) STORED,
  ADD COLUMN point_max int GENERATED ALWAYS AS (
    CASE
      WHEN estimated_point_range IS NULL THEN NULL
      WHEN estimated_point_range ~ '(\d+)\s*-\s*(\d+)'
        THEN ((regexp_match(estimated_point_range, '(\d+)\s*-\s*(\d+)'))[2])::int
      WHEN estimated_point_range ~ '(\d+)\s*\+' THEN 99
      WHEN estimated_point_range ~* '^\s*spike' THEN 2
      WHEN estimated_point_range ~* '^\s*fork'  THEN 4
      ELSE NULL
    END
  ) STORED;

CREATE INDEX idx_detections_point_bounds
  ON detections (point_min, point_max)
  WHERE deleted_at IS NULL AND point_min IS NOT NULL;

-- Keep the RPC on the SAME bounds the embedded data filter uses. The RPC supplies the
-- count and the embedded filter supplies the rows; if the two predicates drift, the
-- header count stops matching the photos on screen.
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
      -- Range OVERLAP against the generated bounds. Unparseable ranges have NULL
      -- bounds and never match a bounded filter.
      AND (
        (p_min_points IS NULL AND p_max_points IS NULL)
        OR (
          d.point_min IS NOT NULL
          AND (p_min_points IS NULL OR d.point_max >= p_min_points)
          AND (p_max_points IS NULL OR d.point_min <= p_max_points)
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

COMMIT;
