-- Photo statistics RPC for efficient single-query aggregation
-- Replaces multiple sequential queries in /api/photos/stats

CREATE OR REPLACE FUNCTION get_photo_stats(
  p_user_id uuid,
  p_batch_id uuid DEFAULT NULL
)
RETURNS TABLE(
  total_photos bigint,
  analyzed_photos bigint,
  photos_with_deer bigint,
  empty_photos bigint,
  failed_photos bigint,
  buck_count bigint,
  doe_count bigint,
  unknown_count bigint,
  trophy_count bigint,
  standard_count bigint,
  basket_count bigint,
  spike_count bigint,
  unknown_size_count bigint
) AS $$
BEGIN
  RETURN QUERY
  WITH image_stats AS (
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE detection_status = 'completed') as analyzed,
      COUNT(*) FILTER (WHERE has_deer = true) as with_deer,
      COUNT(*) FILTER (WHERE has_deer = false AND detection_status = 'completed') as empty,
      COUNT(*) FILTER (WHERE detection_status = 'failed') as failed
    FROM images
    WHERE user_id = p_user_id
      AND (p_batch_id IS NULL OR batch_id = p_batch_id)
  ),
  detection_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE d.sex = 'buck') as bucks,
      COUNT(*) FILTER (WHERE d.sex = 'doe') as does,
      COUNT(*) FILTER (WHERE d.sex IN ('unknown', 'fawn') OR d.sex IS NULL) as unknowns,
      COUNT(*) FILTER (WHERE d.sex = 'buck' AND d.size_class = 'trophy') as trophy,
      COUNT(*) FILTER (WHERE d.sex = 'buck' AND d.size_class = 'standard') as standard,
      COUNT(*) FILTER (WHERE d.sex = 'buck' AND d.size_class = 'basket') as basket,
      COUNT(*) FILTER (WHERE d.sex = 'buck' AND d.size_class = 'spike') as spike,
      COUNT(*) FILTER (WHERE d.sex = 'buck' AND (d.size_class = 'unknown' OR d.size_class IS NULL)) as unknown_size
    FROM detections d
    JOIN images i ON d.image_id = i.id
    WHERE i.user_id = p_user_id
      AND (p_batch_id IS NULL OR i.batch_id = p_batch_id)
      AND d.deleted_at IS NULL
  )
  SELECT
    COALESCE(image_stats.total, 0),
    COALESCE(image_stats.analyzed, 0),
    COALESCE(image_stats.with_deer, 0),
    COALESCE(image_stats.empty, 0),
    COALESCE(image_stats.failed, 0),
    COALESCE(detection_stats.bucks, 0),
    COALESCE(detection_stats.does, 0),
    COALESCE(detection_stats.unknowns, 0),
    COALESCE(detection_stats.trophy, 0),
    COALESCE(detection_stats.standard, 0),
    COALESCE(detection_stats.basket, 0),
    COALESCE(detection_stats.spike, 0),
    COALESCE(detection_stats.unknown_size, 0)
  FROM image_stats, detection_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_photo_stats(uuid, uuid) TO authenticated;
