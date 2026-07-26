-- 053_filtered_images_count_only.sql
--
-- get_filtered_detection_images returns the matching image ids AND their count.
-- getPhotos only ever reads the count: it uses the array for `length === 0` and for
-- the page's `count`, never for the data query (that filters server-side through an
-- embedded predicate). So every filtered page load was transferring the full id set
-- to read its length — on a 40k-photo account with "With Deer" active that is ~1.5 MB
-- of JSON per page of 50 thumbnails.
--
-- Before migration 050 this was bounded by the max-rows cap at 1000 ids; removing that
-- cap is what let the payload grow with the account.
--
-- Adds p_return_ids so a count-only caller can skip the array. getPhotoIds keeps the
-- ids, because there the ids genuinely are the answer.
--
-- The 8-arg signature is dropped and recreated with 9 args rather than overloaded:
-- two functions differing only by a defaulted trailing parameter make an 8-argument
-- call ambiguous. Dropping first keeps exactly one resolvable signature, and existing
-- 8-arg callers bind to the new one via the default.

BEGIN;

DROP FUNCTION IF EXISTS public.get_filtered_detection_images(
  uuid, text, numeric, text, text, uuid, int, int
);

CREATE FUNCTION public.get_filtered_detection_images(
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
      AND d.deleted_at IS NULL
      AND (p_quality_status IS NULL OR d.quality_status = p_quality_status)
      AND (p_min_confidence IS NULL OR d.confidence >= p_min_confidence)
      AND (p_sex IS NULL OR d.sex = p_sex)
      AND (p_size_class IS NULL OR d.size_class = p_size_class)
      AND (p_deer_id IS NULL OR d.deer_id = p_deer_id)
      -- Range OVERLAP against the generated bounds (migration 052). Unparseable
      -- ranges have NULL bounds and never match a bounded filter.
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

REVOKE EXECUTE ON FUNCTION public.get_filtered_detection_images(
  uuid, text, numeric, text, text, uuid, int, int, boolean
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_filtered_detection_images(
  uuid, text, numeric, text, text, uuid, int, int, boolean
) TO authenticated, service_role;

-- Records why 99 is load-bearing, at the place a query author will actually look.
COMMENT ON COLUMN detections.point_max IS
  '99 = open-ended tier ("10+ points"). A finite bound is required because a PostgREST embedded filter cannot express "OR point_max IS NULL" — see migrations 052/053.';

COMMIT;
