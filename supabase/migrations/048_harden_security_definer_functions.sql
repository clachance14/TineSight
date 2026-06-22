-- 048_harden_security_definer_functions.sql
-- Goal 1b remediation (see docs/audits/2026-06-22-security-tenancy-audit.md, Seam B).
--
-- Problem (confirmed live 2026-06-22): every SECURITY DEFINER function except
-- get_public_showcase was granted EXECUTE to PUBLIC + anon with an UNPINNED
-- search_path, and the p_user_id readers trusted the caller-supplied id without
-- checking auth.uid(). Net effect: an UNAUTHENTICATED caller (anon key ships in
-- the browser bundle) could pass any tenant's UUID and read their data.
--
-- Fix: (1) REVOKE EXECUTE from PUBLIC + anon (live grants are broader than the
-- migration files, so an explicit REVOKE is required, not just re-GRANT);
-- (2) add an ownership guard so an authenticated caller may only query its own
-- auth.uid(), while service_role (Trigger.dev jobs) is allowed through;
-- (3) pin search_path on every SECURITY DEFINER function.
-- get_public_showcase is already correctly hardened (migration 046) and is left
-- untouched. No table data is modified.

BEGIN;

-- ---------------------------------------------------------------------------
-- Ownership guard helper. SECURITY INVOKER: it reads the request's auth.uid()
-- / auth.role() (session GUCs set by PostgREST per request), so it reflects the
-- ORIGINAL caller even when PERFORMed from inside a SECURITY DEFINER function.
--   - service_role (trusted backend / Trigger.dev jobs) -> allowed
--   - authenticated caller asking for its own rows      -> allowed
--   - anyone else (incl. anon, or a user passing another's id) -> denied
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_self_or_service(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id = auth.uid() THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'access denied: caller may only query their own data'
    USING ERRCODE = '42501';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_self_or_service(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_self_or_service(uuid) TO authenticated, service_role;

-- ===========================================================================
-- p_user_id readers: add ownership guard + pin search_path (bodies otherwise
-- identical to their latest definitions in 024/032/033/042).
-- ===========================================================================

-- 1. get_deer_catalog (024) ------------------------------------------------
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
    d.id, d.name, d.status, d.notes, d.first_seen, d.last_seen, d.created_at,
    d.reference_detection_id, d.representative_image_id,
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
    AND (p_search IS NULL OR d.name ILIKE '%' || p_search || '%')
    AND (
      p_cursor_created_at IS NULL
      OR (d.created_at, d.id) < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY d.created_at DESC, d.id DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 2. get_pending_matches_summary (024) -------------------------------------
CREATE OR REPLACE FUNCTION get_pending_matches_summary(
  p_user_id uuid
)
RETURNS TABLE(
  image_id uuid, file_path text, thumbnail_path text,
  captured_at timestamptz, detection_id uuid, pending_count bigint
) AS $$
BEGIN
  PERFORM public.assert_self_or_service(p_user_id);
  RETURN QUERY
  SELECT
    i.id as image_id, i.file_path, i.thumbnail_path, i.captured_at,
    det.id as detection_id, mc.pending_count
  FROM (
    SELECT detection_id, COUNT(*) as pending_count
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 3. filter_detections_with_images (024) -----------------------------------
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
  LEFT JOIN deer ON d.deer_id = deer.id
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

-- 4. get_deer_sightings (024) ----------------------------------------------
CREATE OR REPLACE FUNCTION get_deer_sightings(
  p_user_id uuid,
  p_deer_id uuid,
  p_limit int DEFAULT 12,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  detection_id uuid, image_id uuid, size_class text,
  estimated_point_range text, file_path text, captured_at timestamptz,
  total_count bigint
) AS $$
DECLARE
  v_total bigint;
BEGIN
  PERFORM public.assert_self_or_service(p_user_id);
  SELECT COUNT(*)
  INTO v_total
  FROM detections d
  JOIN images i ON d.image_id = i.id
  WHERE d.deer_id = p_deer_id
    AND i.user_id = p_user_id
    AND d.deleted_at IS NULL;

  RETURN QUERY
  SELECT
    d.id as detection_id, d.image_id, d.size_class, d.estimated_point_range,
    i.file_path, i.captured_at, v_total as total_count
  FROM detections d
  JOIN images i ON d.image_id = i.id
  WHERE d.deer_id = p_deer_id
    AND i.user_id = p_user_id
    AND d.deleted_at IS NULL
  ORDER BY d.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5. get_unassigned_trophy_detections (042) — also called by service_role job
CREATE OR REPLACE FUNCTION get_unassigned_trophy_detections(p_user_id UUID)
RETURNS TABLE (
  detection_id UUID, fingerprint JSONB, crop_file_path TEXT, captured_at TIMESTAMPTZ
) AS $$
BEGIN
  PERFORM public.assert_self_or_service(p_user_id);
  RETURN QUERY
  SELECT
    d.id AS detection_id, d.antler_fingerprint AS fingerprint,
    d.crop_file_path, i.captured_at
  FROM detections d
  INNER JOIN images i ON d.image_id = i.id
  LEFT JOIN trophy_cluster_members tcm ON tcm.detection_id = d.id
  WHERE i.user_id = p_user_id
    AND d.is_trophy = TRUE
    AND d.deer_id IS NULL
    AND d.antler_fingerprint IS NOT NULL
    AND tcm.id IS NULL
    AND d.deleted_at IS NULL
  ORDER BY i.captured_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 6. get_photo_stats(uuid, uuid) — 2-arg overload (032) --------------------
CREATE OR REPLACE FUNCTION get_photo_stats(
  p_user_id uuid,
  p_batch_id uuid DEFAULT NULL
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
      COUNT(*) FILTER (WHERE detection_status = 'completed') as analyzed,
      COUNT(*) FILTER (WHERE has_deer = true) as with_deer,
      COUNT(*) FILTER (WHERE has_deer = false AND detection_status = 'completed') as empty,
      COUNT(*) FILTER (WHERE detection_status = 'failed') as failed,
      COUNT(*) FILTER (WHERE detection_status = 'pending') as pending,
      COUNT(*) FILTER (WHERE detection_status = 'processing') as processing
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
      AND (p_batch_id IS NULL OR i.batch_id = p_batch_id)
      AND (p_upload_session_id IS NULL OR pb.upload_session_id = p_upload_session_id)
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
    LEFT JOIN processing_batches pb ON i.batch_id = pb.id
    WHERE i.user_id = p_user_id
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

-- ===========================================================================
-- Lock down EXECUTE on every reader: remove PUBLIC + anon, grant least-privilege.
-- (CREATE OR REPLACE preserves the old ACL, so explicit REVOKE is required.)
-- ===========================================================================
REVOKE EXECUTE ON FUNCTION get_deer_catalog(uuid, text, int, timestamptz, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_deer_catalog(uuid, text, int, timestamptz, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION get_pending_matches_summary(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_pending_matches_summary(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION filter_detections_with_images(uuid, text, text, text, boolean, text, uuid, int, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION filter_detections_with_images(uuid, text, text, text, boolean, text, uuid, int, int) TO authenticated;

REVOKE EXECUTE ON FUNCTION get_deer_sightings(uuid, uuid, int, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_deer_sightings(uuid, uuid, int, int) TO authenticated;

REVOKE EXECUTE ON FUNCTION get_photo_stats(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_photo_stats(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION get_photo_stats(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_photo_stats(uuid, uuid, uuid) TO authenticated;

-- get_unassigned_trophy_detections is called ONLY by the post-creation-scan /
-- cluster-trophy-detections jobs (service_role); no authenticated UI caller
-- exists (verified via grep of lib/services + app/api). Returns antler
-- fingerprints + crop paths, so restrict to service_role (least privilege).
REVOKE EXECUTE ON FUNCTION get_unassigned_trophy_detections(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION get_unassigned_trophy_detections(uuid) TO service_role;

-- ===========================================================================
-- Functions hardened by attribute change only (no body rewrite needed).
-- ===========================================================================

-- find_similar_deer: no application caller (audit Seam B). Lock to service_role,
-- pin search_path (needs `extensions` for pgvector operators).
ALTER FUNCTION find_similar_deer(vector, uuid, integer, double precision)
  SET search_path = public, extensions, pg_temp;
REVOKE EXECUTE ON FUNCTION find_similar_deer(vector, uuid, integer, double precision) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION find_similar_deer(vector, uuid, integer, double precision) TO service_role;

-- Counter functions: only Trigger.dev jobs (service_role) call these.
ALTER FUNCTION increment_batch_counters(uuid, integer, integer, integer)
  SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION increment_batch_counters(uuid, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION increment_batch_counters(uuid, integer, integer, integer) TO service_role;

ALTER FUNCTION increment_session_counters(uuid, integer, integer)
  SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION increment_session_counters(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION increment_session_counters(uuid, integer, integer) TO service_role;

-- has_account_access: used INSIDE RLS policies, so authenticated must keep
-- EXECUTE. Returns only a boolean and derives identity from auth.uid().
ALTER FUNCTION has_account_access(uuid) SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION has_account_access(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION has_account_access(uuid) TO authenticated, service_role;

-- Trigger functions: pin search_path; they fire as triggers, so no EXECUTE
-- grant is needed and PUBLIC/anon EXECUTE can be removed.
ALTER FUNCTION handle_new_user() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION handle_new_user() FROM PUBLIC, anon;

ALTER FUNCTION update_session_on_batch_change() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION update_session_on_batch_change() FROM PUBLIC, anon;

-- enforce_showcase_buck_same_owner (044): a cross-tenant-invariant trigger.
-- NOT SECURITY DEFINER (so outside the P0 breach), but pin its search_path and
-- drop PUBLIC/anon EXECUTE for hygiene/consistency with the other triggers.
ALTER FUNCTION enforce_showcase_buck_same_owner() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION enforce_showcase_buck_same_owner() FROM PUBLIC, anon;

COMMIT;
