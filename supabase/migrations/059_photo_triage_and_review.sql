-- Photo triage is a read-side consequence of live authoritative scores, never the
-- size-class glance. Human review disposition is independent of AI quality.
BEGIN;
ALTER TABLE public.images
  ADD COLUMN triage_tier text NOT NULL DEFAULT 'unprocessed'
    CHECK (triage_tier IN ('trophy', 'buck', 'doe', 'other', 'empty', 'unprocessed')),
  ADD COLUMN review_status text NOT NULL DEFAULT 'unreviewed'
    CHECK (review_status IN ('unreviewed', 'keep', 'review_later'));
CREATE INDEX images_user_triage ON public.images (user_id, triage_tier, is_archived);
CREATE INDEX images_user_review ON public.images (user_id, review_status, is_archived);

CREATE FUNCTION public.derive_photo_triage(p_photo public.images)
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = public, pg_temp AS $$
DECLARE
  gross integer;
  has_buck boolean;
  live_count bigint;
  deer_count bigint;
  threshold integer;
BEGIN
  IF p_photo.detection_status <> 'completed' THEN RETURN 'unprocessed'; END IF;
  SELECT COALESCE(p.trophy_threshold, 130) INTO threshold FROM profiles p WHERE p.id = p_photo.user_id;
  SELECT max(d.score_gross), bool_or(d.sex = 'buck'), count(*),
    count(*) FILTER (WHERE d.class = 'deer' OR d.sex IN ('buck', 'doe', 'fawn'))
    INTO gross, has_buck, live_count, deer_count
    FROM detections d WHERE d.image_id = p_photo.id AND d.deleted_at IS NULL;
  IF gross >= COALESCE(threshold, 130) THEN RETURN 'trophy'; END IF;
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

CREATE FUNCTION public.refresh_image_triage()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.triage_tier := derive_photo_triage(NEW);
  RETURN NEW;
END $$;
CREATE TRIGGER image_triage BEFORE INSERT OR UPDATE OF detection_status, has_deer,
  has_hogs, has_cows, has_goats, has_people, has_vehicles, user_id, triage_tier
  ON public.images FOR EACH ROW EXECUTE FUNCTION public.refresh_image_triage();

CREATE FUNCTION public.refresh_detection_photo_triage()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE images SET triage_tier = triage_tier WHERE id = OLD.image_id;
    RETURN OLD;
  END IF;
  UPDATE images SET triage_tier = triage_tier WHERE id = NEW.image_id;
  IF TG_OP = 'UPDATE' AND OLD.image_id IS DISTINCT FROM NEW.image_id THEN
    UPDATE images SET triage_tier = triage_tier WHERE id = OLD.image_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER detection_photo_triage AFTER INSERT OR DELETE OR UPDATE OF score_gross,
  sex, class, deleted_at, image_id ON public.detections FOR EACH ROW
  EXECUTE FUNCTION public.refresh_detection_photo_triage();

CREATE FUNCTION public.refresh_threshold_photo_triage()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.trophy_threshold IS DISTINCT FROM OLD.trophy_threshold THEN
    UPDATE images SET triage_tier = triage_tier WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profile_photo_triage AFTER UPDATE OF trophy_threshold ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.refresh_threshold_photo_triage();

UPDATE public.images SET triage_tier = triage_tier;

-- The service resolves ids with the SAME filters as grid/pager/bulk operations.
-- A UUID array travels in a POST body, avoiding PostgREST URL/max-row ceilings.
CREATE FUNCTION public.get_photo_triage_counts(p_photo_ids uuid[])
RETURNS TABLE (tier text, photo_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  WITH scoped AS (
    SELECT i.triage_tier, i.has_people, i.has_vehicles
    FROM images i WHERE i.user_id = auth.uid() AND i.id = ANY(p_photo_ids)
      AND i.upload_completed_at IS NOT NULL
  )
  SELECT triage_tier, count(*) FROM scoped GROUP BY triage_tier
  UNION ALL SELECT 'security', count(*) FROM scoped WHERE has_people IS TRUE OR has_vehicles IS TRUE
  UNION ALL SELECT 'priority', count(*) FROM scoped WHERE triage_tier = 'trophy' OR has_people IS TRUE OR has_vehicles IS TRUE
  UNION ALL SELECT 'all', count(*) FROM scoped;
$$;
REVOKE ALL ON FUNCTION public.get_photo_triage_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_photo_triage_counts(uuid[]) TO authenticated, service_role;
COMMIT;
