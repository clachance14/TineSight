BEGIN;
-- Confirmed numeric Score is authoritative; size_class remains a qualitative impression.
CREATE OR REPLACE FUNCTION public.sync_detection_numeric_trophy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE threshold_value numeric;
BEGIN
  SELECT p.trophy_threshold INTO threshold_value
  FROM public.images i LEFT JOIN public.profiles p ON p.id = i.user_id
  WHERE i.id = NEW.image_id;
  NEW.is_trophy := NEW.score_gross IS NOT NULL AND NEW.score_gross >= COALESCE(threshold_value, 130);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_detection_numeric_trophy() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS detection_numeric_trophy ON public.detections;
CREATE TRIGGER detection_numeric_trophy BEFORE INSERT OR UPDATE OF score_gross, image_id, is_trophy
ON public.detections FOR EACH ROW EXECUTE FUNCTION public.sync_detection_numeric_trophy();

CREATE OR REPLACE FUNCTION public.refresh_detection_numeric_trophy_threshold()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- Touch the flag; sync_detection_numeric_trophy (BEFORE UPDATE OF is_trophy)
  -- recomputes it against the new threshold, so the predicate exists once.
  UPDATE public.detections d SET is_trophy = d.is_trophy
  FROM public.images i WHERE i.id = d.image_id AND i.user_id = NEW.id AND d.score_gross IS NOT NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_detection_numeric_trophy_threshold() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS profile_numeric_trophy_threshold ON public.profiles;
CREATE TRIGGER profile_numeric_trophy_threshold AFTER UPDATE OF trophy_threshold ON public.profiles
FOR EACH ROW WHEN (OLD.trophy_threshold IS DISTINCT FROM NEW.trophy_threshold)
EXECUTE FUNCTION public.refresh_detection_numeric_trophy_threshold();
-- Tiers read the authoritative flag rather than re-applying the threshold. This
-- replaces 059's score-based derivation in the migration that installs the
-- flag's trigger, so no applied state has one without the other.
CREATE OR REPLACE FUNCTION public.derive_photo_triage(p_photo public.images)
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = public, pg_temp AS $$
DECLARE
  has_trophy boolean;
  has_buck boolean;
  live_count bigint;
  deer_count bigint;
BEGIN
  IF p_photo.detection_status <> 'completed' THEN RETURN 'unprocessed'; END IF;
  SELECT bool_or(d.is_trophy), bool_or(d.sex = 'buck'), count(*),
    count(*) FILTER (WHERE d.class = 'deer' OR d.sex IN ('buck', 'doe', 'fawn'))
    INTO has_trophy, has_buck, live_count, deer_count
    FROM detections d WHERE d.image_id = p_photo.id AND d.deleted_at IS NULL;
  IF has_trophy IS TRUE THEN RETURN 'trophy'; END IF;
  IF has_buck IS TRUE THEN RETURN 'buck'; END IF;
  IF deer_count > 0 THEN RETURN 'doe'; END IF;
  -- Unknown flags stay in Other, never in the suggested empty set. Security is
  -- orthogonal: a trophy containing a person is counted in BOTH surfaces.
  IF live_count = 0 AND p_photo.has_deer IS FALSE AND p_photo.has_hogs IS FALSE
    AND p_photo.has_cows IS FALSE AND p_photo.has_goats IS FALSE
    AND p_photo.has_people IS FALSE AND p_photo.has_vehicles IS FALSE
    THEN RETURN 'empty'; END IF;
  RETURN 'other';
END $$;
-- Every flag change (the threshold refresh above, direct writes, the backfill
-- below) now cascades into tiers, which makes 059's separate threshold sweep
-- redundant: one predicate, one cascade.
DROP TRIGGER IF EXISTS detection_photo_triage ON public.detections;
CREATE TRIGGER detection_photo_triage AFTER INSERT OR DELETE OR UPDATE OF score_gross,
  sex, class, deleted_at, image_id, is_trophy ON public.detections FOR EACH ROW
  EXECUTE FUNCTION public.refresh_detection_photo_triage();
DROP TRIGGER IF EXISTS profile_photo_triage ON public.profiles;
DROP FUNCTION IF EXISTS public.refresh_threshold_photo_triage();
UPDATE public.detections SET is_trophy = is_trophy;

-- Preserve the existing authenticated owner guard and RPC signatures.
-- Catalog totals remain archive-inclusive. Exclude cancelled image rows only;
-- pending-only cancellation retains completed photos under cancelled parents.

-- 7. get_photo_stats(uuid, uuid, uuid) — 3-arg overload (033) --------------
CREATE OR REPLACE FUNCTION get_photo_stats(
  p_user_id uuid,
  p_batch_id uuid DEFAULT NULL,
  p_upload_session_id uuid DEFAULT NULL
)
RETURNS TABLE(
  total_photos bigint, analyzed_photos bigint, photos_with_deer bigint,
  empty_photos bigint, failed_photos bigint, pending_photos bigint,
  processing_photos bigint, buck_count bigint, doe_count bigint,
  unknown_count bigint, trophy_count bigint, standard_count bigint,
  basket_count bigint, spike_count bigint, unknown_size_count bigint
) AS $$
BEGIN
  PERFORM public.assert_self_or_service(p_user_id);
  RETURN QUERY
  WITH image_stats AS (
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE i.detection_status = 'completed') as analyzed,
      COUNT(*) FILTER (WHERE i.has_deer = true) as with_deer,
      COUNT(*) FILTER (WHERE i.has_deer = false AND i.detection_status = 'completed') as empty,
      COUNT(*) FILTER (WHERE i.detection_status = 'failed') as failed,
      COUNT(*) FILTER (WHERE i.detection_status = 'pending') as pending,
      COUNT(*) FILTER (WHERE i.detection_status = 'processing') as processing
    FROM images i
    LEFT JOIN processing_batches pb ON i.batch_id = pb.id
    WHERE i.user_id = p_user_id
      AND i.is_cancelled = false
      AND (p_batch_id IS NULL OR i.batch_id = p_batch_id)
      AND (p_upload_session_id IS NULL OR pb.upload_session_id = p_upload_session_id)
  ),
  detection_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE d.sex = 'buck') as bucks,
      COUNT(*) FILTER (WHERE d.sex = 'doe') as does,
      COUNT(*) FILTER (WHERE d.sex IN ('unknown', 'fawn') OR d.sex IS NULL) as unknowns,
      COUNT(*) FILTER (WHERE d.is_trophy = true) as trophy,
      COUNT(*) FILTER (WHERE d.sex = 'buck' AND d.size_class = 'standard') as standard,
      COUNT(*) FILTER (WHERE d.sex = 'buck' AND d.size_class = 'basket') as basket,
      COUNT(*) FILTER (WHERE d.sex = 'buck' AND d.size_class = 'spike') as spike,
      COUNT(*) FILTER (WHERE d.sex = 'buck' AND (d.size_class = 'unknown' OR d.size_class IS NULL)) as unknown_size
    FROM detections d
    JOIN images i ON d.image_id = i.id
    LEFT JOIN processing_batches pb ON i.batch_id = pb.id
    WHERE i.user_id = p_user_id
      AND i.is_cancelled = false
      AND (p_batch_id IS NULL OR i.batch_id = p_batch_id)
      AND (p_upload_session_id IS NULL OR pb.upload_session_id = p_upload_session_id)
      AND d.deleted_at IS NULL
  )
  SELECT
    COALESCE(image_stats.total, 0), COALESCE(image_stats.analyzed, 0),
    COALESCE(image_stats.with_deer, 0), COALESCE(image_stats.empty, 0),
    COALESCE(image_stats.failed, 0), COALESCE(image_stats.pending, 0),
    COALESCE(image_stats.processing, 0), COALESCE(detection_stats.bucks, 0),
    COALESCE(detection_stats.does, 0), COALESCE(detection_stats.unknowns, 0),
    COALESCE(detection_stats.trophy, 0), COALESCE(detection_stats.standard, 0),
    COALESCE(detection_stats.basket, 0), COALESCE(detection_stats.spike, 0),
    COALESCE(detection_stats.unknown_size, 0)
  FROM image_stats, detection_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- The two-argument overload (032) duplicated this body and could not even be
-- called positionally while the three-argument one exists (overlapping defaults
-- make the call ambiguous). The only caller, /api/photos/stats, passes all three
-- named arguments, so the three-argument reader is the single statistics query.
DROP FUNCTION IF EXISTS public.get_photo_stats(uuid, uuid);
COMMIT;
