-- Bind account-owned records to references in the same account. RLS on a source
-- row does not authorize the target of a foreign key or a stored blob path.
BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_detection_references()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE owner_id uuid;
BEGIN
  SELECT user_id INTO owner_id FROM images WHERE id = NEW.image_id;
  IF owner_id IS NULL OR (NEW.deer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM deer WHERE id = NEW.deer_id AND user_id = owner_id
  )) THEN RAISE EXCEPTION 'Detection and buck must belong to the same account' USING ERRCODE = '23514'; END IF;
  -- Legacy crops used a separately generated UUID. Preserve their paths, but
  -- only trusted workers may establish/change a crop pointer. Source-row RLS
  -- alone would otherwise let an owner point at another account's object.
  IF auth.role() = 'authenticated' THEN
    IF (TG_OP = 'INSERT' AND NEW.crop_file_path IS NOT NULL) OR
       (TG_OP = 'UPDATE' AND NEW.crop_file_path IS DISTINCT FROM OLD.crop_file_path) THEN
      RAISE EXCEPTION 'Crop paths are managed by image workers' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.crop_file_path IS NOT NULL AND NEW.crop_file_path !~ '^crops/[0-9a-fA-F-]{36}\.jpg$' THEN
    RAISE EXCEPTION 'Invalid detection crop path' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER detection_reference_owner BEFORE INSERT OR UPDATE OF image_id, deer_id, crop_file_path ON detections
FOR EACH ROW EXECUTE FUNCTION public.enforce_detection_references();

CREATE OR REPLACE FUNCTION public.enforce_image_references()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.batch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM processing_batches WHERE id = NEW.batch_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Photo and batch must belong to the same account' USING ERRCODE = '23514'; END IF;
  IF NEW.camera_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cameras WHERE id = NEW.camera_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Photo and camera must belong to the same account' USING ERRCODE = '23514'; END IF;
  IF NEW.location_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM locations WHERE id = NEW.location_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Photo and location must belong to the same account' USING ERRCODE = '23514'; END IF;
  IF split_part(NEW.file_path, '/', 1) <> NEW.user_id::text
    OR NEW.file_path ~ '(^|/)\.{1,2}(/|$)' OR strpos(NEW.file_path, chr(92)) > 0 OR strpos(NEW.file_path, '%') > 0
    OR (NEW.thumbnail_path IS NOT NULL AND NEW.thumbnail_path <> 'thumbnails/' || NEW.id::text || '.webp')
    OR (NEW.medium_path IS NOT NULL AND NEW.medium_path <> 'medium/' || NEW.id::text || '.webp') THEN
    RAISE EXCEPTION 'Invalid photo storage path' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER image_reference_owner BEFORE INSERT OR UPDATE OF user_id, batch_id, camera_id, location_id, file_path, thumbnail_path, medium_path ON images
FOR EACH ROW EXECUTE FUNCTION public.enforce_image_references();

CREATE OR REPLACE FUNCTION public.enforce_batch_session_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.upload_session_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM upload_sessions WHERE id = NEW.upload_session_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Batch and upload session must belong to the same account' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER batch_session_owner BEFORE INSERT OR UPDATE OF user_id, upload_session_id ON processing_batches
FOR EACH ROW EXECUTE FUNCTION public.enforce_batch_session_owner();

CREATE OR REPLACE FUNCTION public.enforce_deer_references()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.reference_detection_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM detections d JOIN images i ON i.id = d.image_id WHERE d.id = NEW.reference_detection_id AND i.user_id = NEW.user_id
  ) THEN RAISE EXCEPTION 'Buck reference must belong to the same account' USING ERRCODE = '23514'; END IF;
  IF NEW.representative_image_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM images WHERE id = NEW.representative_image_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Buck photo must belong to the same account' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER deer_reference_owner BEFORE INSERT OR UPDATE OF user_id, reference_detection_id, representative_image_id ON deer
FOR EACH ROW EXECUTE FUNCTION public.enforce_deer_references();

CREATE OR REPLACE FUNCTION public.enforce_match_references()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM detections d JOIN images i ON i.id = d.image_id
    JOIN deer b ON b.id = NEW.candidate_deer_id AND b.user_id = i.user_id
    WHERE d.id = NEW.detection_id
  ) THEN RAISE EXCEPTION 'Match candidate must belong to the same account' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER match_reference_owner BEFORE INSERT OR UPDATE OF detection_id, candidate_deer_id ON match_candidates
FOR EACH ROW EXECUTE FUNCTION public.enforce_match_references();

-- Existing malformed path pointers cannot become an authorization oracle while
-- old records await cleanup. All public media is derived from an owned image ID;
-- the best remaining scored sighting supplies the hero, not a stale reference.
CREATE OR REPLACE FUNCTION get_public_showcase(p_token TEXT)
RETURNS TABLE (showcase_title TEXT, deer_id UUID, buck_name TEXT, score_gross INTEGER,
 is_trophy BOOLEAN, image_path TEXT, sighting_count BIGINT, buck_position INTEGER)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT s.title, d.id, COALESCE(d.name, 'Unnamed Buck'), agg.max_score,
 COALESCE(agg.any_trophy, FALSE), hero.image_path, COALESCE(agg.sightings, 0), sb.position
 FROM showcases s JOIN showcase_bucks sb ON sb.showcase_id = s.id
 JOIN deer d ON d.id = sb.deer_id AND d.user_id = s.user_id
 LEFT JOIN LATERAL (
   SELECT max(det.score_gross) AS max_score, bool_or(det.is_trophy) AS any_trophy, count(*) AS sightings
   FROM detections det JOIN images i ON i.id = det.image_id AND i.user_id = s.user_id
   WHERE det.deer_id = d.id AND det.deleted_at IS NULL
 ) agg ON TRUE
 LEFT JOIN LATERAL (
   SELECT 'medium/' || i.id::text || '.webp' AS image_path
   FROM detections det JOIN images i ON i.id = det.image_id AND i.user_id = s.user_id
   WHERE det.deer_id = d.id AND det.deleted_at IS NULL AND i.medium_path IS NOT NULL
   ORDER BY det.score_gross DESC NULLS LAST, det.id LIMIT 1
 ) hero ON TRUE
 WHERE s.token = p_token AND s.is_active = TRUE ORDER BY sb.position, d.name;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_detection_references(), public.enforce_image_references(),
 public.enforce_batch_session_owner(), public.enforce_deer_references(), public.enforce_match_references() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION get_deer_catalog(
  p_user_id uuid,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 24,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid, name text, status text, notes text,
  first_seen timestamptz, last_seen timestamptz, created_at timestamptz,
  reference_detection_id uuid, representative_image_id uuid,
  representative_file_path text, sighting_count bigint
) AS $$
BEGIN
  PERFORM public.assert_self_or_service(p_user_id);
  RETURN QUERY
  SELECT
    d.id, d.name, d.status, d.notes, d.first_seen::timestamptz, d.last_seen::timestamptz, d.created_at,
    d.reference_detection_id, d.representative_image_id,
    i.file_path as representative_file_path,
    COALESCE(dc.count, 0)::bigint as sighting_count
  FROM deer d
  LEFT JOIN images i ON d.representative_image_id = i.id AND i.user_id = p_user_id
  LEFT JOIN (
    SELECT det.deer_id, COUNT(*) as count
    FROM detections det JOIN images img ON img.id = det.image_id
    WHERE det.deleted_at IS NULL AND det.deer_id IS NOT NULL AND img.user_id = p_user_id
    GROUP BY det.deer_id
  ) dc ON d.id = dc.deer_id
  WHERE d.user_id = p_user_id
    AND (p_search IS NULL OR d.name ILIKE '%' || p_search || '%')
    AND (
      p_cursor_created_at IS NULL
      OR (d.created_at, d.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY d.created_at DESC, d.id DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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
  detection_id uuid, image_id uuid, species text, sex text, age_class text,
  size_class text, estimated_point_range text, gemini_confidence numeric,
  quality_status text, quality_score numeric, deer_id uuid, deer_name text,
  file_path text, thumbnail_path text, captured_at timestamptz, crop_file_path text
) AS $$
BEGIN
  PERFORM public.assert_self_or_service(p_user_id);
  RETURN QUERY
  SELECT
    d.id as detection_id, d.image_id, d.species, d.sex, d.age_class, d.size_class,
    d.estimated_point_range, d.gemini_confidence, d.quality_status, d.quality_score,
    d.deer_id, deer.name as deer_name, i.file_path, i.thumbnail_path, i.captured_at,
    d.crop_file_path
  FROM detections d
  JOIN images i ON d.image_id = i.id
  LEFT JOIN deer ON d.deer_id = deer.id AND deer.user_id = p_user_id
  WHERE i.user_id = p_user_id
    AND d.deleted_at IS NULL
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMIT;
