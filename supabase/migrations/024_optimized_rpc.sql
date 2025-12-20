-- Optimized RPC functions for complex queries
-- Reduces N+1 queries and enables efficient pagination

--------------------------------------------------------------------------------
-- 1. get_deer_catalog: Paginated deer with sighting counts
-- Replaces multiple queries in /api/deer route
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_deer_catalog(
  p_user_id uuid,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 24,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  name text,
  status text,
  notes text,
  first_seen timestamptz,
  last_seen timestamptz,
  created_at timestamptz,
  reference_detection_id uuid,
  representative_image_id uuid,
  representative_file_path text,
  sighting_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.name,
    d.status,
    d.notes,
    d.first_seen,
    d.last_seen,
    d.created_at,
    d.reference_detection_id,
    d.representative_image_id,
    i.file_path as representative_file_path,
    COALESCE(dc.count, 0)::bigint as sighting_count
  FROM deer d
  LEFT JOIN images i ON d.representative_image_id = i.id
  LEFT JOIN (
    SELECT deer_id, COUNT(*) as count
    FROM detections
    WHERE deleted_at IS NULL AND deer_id IS NOT NULL
    GROUP BY deer_id
  ) dc ON d.id = dc.deer_id
  WHERE d.user_id = p_user_id
    -- Search filter (case-insensitive on name)
    AND (p_search IS NULL OR d.name ILIKE '%' || p_search || '%')
    -- Cursor-based pagination (created_at DESC, id DESC for stability)
    AND (
      p_cursor_created_at IS NULL
      OR (d.created_at, d.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY d.created_at DESC, d.id DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_deer_catalog(uuid, text, int, timestamptz, uuid) TO authenticated;

--------------------------------------------------------------------------------
-- 2. get_pending_matches_summary: Flattened pending matches with image info
-- Replaces complex joins in /api/photos/pending-matches
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_pending_matches_summary(
  p_user_id uuid
)
RETURNS TABLE(
  image_id uuid,
  file_path text,
  thumbnail_path text,
  captured_at timestamptz,
  detection_id uuid,
  pending_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id as image_id,
    i.file_path,
    i.thumbnail_path,
    i.captured_at,
    det.id as detection_id,
    mc.pending_count
  FROM (
    -- Subquery: count pending matches per detection
    SELECT
      detection_id,
      COUNT(*) as pending_count
    FROM match_candidates
    WHERE status = 'pending'
    GROUP BY detection_id
  ) mc
  JOIN detections det ON det.id = mc.detection_id
  JOIN images i ON i.id = det.image_id
  WHERE i.user_id = p_user_id
    AND det.deleted_at IS NULL
  ORDER BY i.captured_at DESC NULLS LAST, i.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_pending_matches_summary(uuid) TO authenticated;

--------------------------------------------------------------------------------
-- 3. filter_detections_with_images: Efficient detection filtering with image data
-- Combines detection + image data in single query for photo grid
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION filter_detections_with_images(
  p_user_id uuid,
  p_sex text DEFAULT NULL,
  p_size_class text DEFAULT NULL,
  p_point_range text DEFAULT NULL,
  p_has_deer_id boolean DEFAULT NULL,
  p_quality_status text DEFAULT NULL,
  p_batch_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  detection_id uuid,
  image_id uuid,
  species text,
  sex text,
  age_class text,
  size_class text,
  estimated_point_range text,
  gemini_confidence numeric,
  quality_status text,
  quality_score numeric,
  deer_id uuid,
  deer_name text,
  file_path text,
  thumbnail_path text,
  captured_at timestamptz,
  crop_file_path text
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id as detection_id,
    d.image_id,
    d.species,
    d.sex,
    d.age_class,
    d.size_class,
    d.estimated_point_range,
    d.gemini_confidence,
    d.quality_status,
    d.quality_score,
    d.deer_id,
    deer.name as deer_name,
    i.file_path,
    i.thumbnail_path,
    i.captured_at,
    d.crop_file_path
  FROM detections d
  JOIN images i ON d.image_id = i.id
  LEFT JOIN deer ON d.deer_id = deer.id
  WHERE i.user_id = p_user_id
    AND d.deleted_at IS NULL
    -- Optional filters
    AND (p_sex IS NULL OR d.sex = p_sex)
    AND (p_size_class IS NULL OR d.size_class = p_size_class)
    AND (p_point_range IS NULL OR d.estimated_point_range = p_point_range)
    AND (p_has_deer_id IS NULL OR (p_has_deer_id = true AND d.deer_id IS NOT NULL) OR (p_has_deer_id = false AND d.deer_id IS NULL))
    AND (p_quality_status IS NULL OR d.quality_status = p_quality_status)
    AND (p_batch_id IS NULL OR i.batch_id = p_batch_id)
  ORDER BY i.captured_at DESC NULLS LAST, d.id
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION filter_detections_with_images(uuid, text, text, text, boolean, text, uuid, int, int) TO authenticated;

--------------------------------------------------------------------------------
-- 4. get_deer_sightings: Paginated sightings for deer profile
-- Replaces N+1 queries in /api/deer/[id]
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_deer_sightings(
  p_user_id uuid,
  p_deer_id uuid,
  p_limit int DEFAULT 12,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  detection_id uuid,
  image_id uuid,
  size_class text,
  estimated_point_range text,
  file_path text,
  captured_at timestamptz,
  total_count bigint
) AS $$
DECLARE
  v_total bigint;
BEGIN
  -- Get total count first (for pagination metadata)
  SELECT COUNT(*)
  INTO v_total
  FROM detections d
  JOIN images i ON d.image_id = i.id
  WHERE d.deer_id = p_deer_id
    AND i.user_id = p_user_id
    AND d.deleted_at IS NULL;

  RETURN QUERY
  SELECT
    d.id as detection_id,
    d.image_id,
    d.size_class,
    d.estimated_point_range,
    i.file_path,
    i.captured_at,
    v_total as total_count
  FROM detections d
  JOIN images i ON d.image_id = i.id
  WHERE d.deer_id = p_deer_id
    AND i.user_id = p_user_id
    AND d.deleted_at IS NULL
  ORDER BY d.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_deer_sightings(uuid, uuid, int, int) TO authenticated;

--------------------------------------------------------------------------------
-- Indexes to support the RPC functions
--------------------------------------------------------------------------------

-- Composite index for deer catalog pagination
CREATE INDEX IF NOT EXISTS idx_deer_user_created_id
ON deer(user_id, created_at DESC, id DESC);

-- Partial index for pending match candidates
CREATE INDEX IF NOT EXISTS idx_match_candidates_pending_detection
ON match_candidates(detection_id)
WHERE status = 'pending';

-- Composite index for detection filtering
CREATE INDEX IF NOT EXISTS idx_detections_sex_size_class
ON detections(sex, size_class)
WHERE deleted_at IS NULL;
