-- Readiness guard for the detection-first id path.
--
-- Migration 058 made "a reservation is not a photo" the rule for every gallery,
-- pager and bulk-selection query: images.upload_completed_at IS NOT NULL, applied
-- once in lib/services/photos.ts#applyPhotoLevelFilters. The detection-only
-- shortcut in getPhotoIds/getPhotos returns THIS function's id set directly,
-- without that images query, so the same predicate has to live here too.
-- Body is otherwise identical to migration 053. CREATE OR REPLACE keeps the
-- existing signature and therefore the existing GRANT/REVOKE set.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_filtered_detection_images(
  p_user_id uuid,
  p_quality_status text DEFAULT NULL,
  p_min_confidence numeric DEFAULT NULL,
  p_sex text DEFAULT NULL,
  p_size_class text DEFAULT NULL,
  p_deer_id uuid DEFAULT NULL,
  p_min_points int DEFAULT NULL,
  p_max_points int DEFAULT NULL,
  p_return_ids boolean DEFAULT true
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
      AND i.upload_completed_at IS NOT NULL
      AND d.deleted_at IS NULL
      AND (p_quality_status IS NULL OR d.quality_status = p_quality_status)
      AND (p_min_confidence IS NULL OR d.confidence >= p_min_confidence)
      AND (p_sex IS NULL OR d.sex = p_sex)
      AND (p_size_class IS NULL OR d.size_class = p_size_class)
      AND (p_deer_id IS NULL OR d.deer_id = p_deer_id)
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
    CASE WHEN p_return_ids
      THEN COALESCE(array_agg(m.image_id), ARRAY[]::uuid[])
      ELSE ARRAY[]::uuid[]
    END,
    COUNT(*)::bigint
  FROM matched m;
END;
$$;
COMMIT;
