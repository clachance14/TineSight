-- 045_get_public_showcase.sql
-- The ONLY public read path for Showcases (ADR 0001). SECURITY DEFINER so it can
-- read across the owner's rows, but it returns a FIXED, sanitized DTO and never
-- raw rows — the safe alternative to running the service-role client in app code
-- (Codex security review). Tenant ownership is re-asserted on every join.
--
-- Returns empty for a revoked (is_active=false) OR absent token alike, so the
-- public page renders an identical 404 for both (no revoked-vs-missing oracle).

CREATE OR REPLACE FUNCTION get_public_showcase(p_token TEXT)
RETURNS TABLE (
  showcase_title  TEXT,
  deer_id         UUID,
  buck_name       TEXT,
  score_gross     INTEGER,
  is_trophy       BOOLEAN,
  image_path      TEXT,      -- medium variant storage path; signed by the caller (short expiry)
  sighting_count  BIGINT,
  buck_position   INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.title AS showcase_title,
    d.id AS deer_id,
    d.name AS buck_name,
    agg.max_score AS score_gross,
    COALESCE(agg.any_trophy, FALSE) AS is_trophy,
    refimg.medium_path AS image_path,
    COALESCE(agg.sightings, 0) AS sighting_count,
    sb.position AS buck_position
  FROM showcases s
  JOIN showcase_bucks sb ON sb.showcase_id = s.id
  -- Re-assert ownership: the curated deer must belong to the showcase owner.
  JOIN deer d ON d.id = sb.deer_id AND d.user_id = s.user_id
  -- Per-deer aggregates. Detections have no user_id; ownership is via their
  -- image, so we join images and re-assert i.user_id = s.user_id.
  LEFT JOIN LATERAL (
    SELECT
      max(det.score_gross) AS max_score,
      bool_or(det.is_trophy) AS any_trophy,
      count(*) AS sightings
    FROM detections det
    JOIN images di ON di.id = det.image_id AND di.user_id = s.user_id
    WHERE det.deer_id = d.id
      AND det.deleted_at IS NULL
  ) agg ON TRUE
  -- Reference image (medium variant), owner-scoped.
  LEFT JOIN LATERAL (
    SELECT i.medium_path
    FROM detections rd
    JOIN images i ON i.id = rd.image_id AND i.user_id = s.user_id
    WHERE rd.id = d.reference_detection_id
    LIMIT 1
  ) refimg ON TRUE
  WHERE s.token = p_token
    AND s.is_active = TRUE
  ORDER BY sb.position ASC, d.name ASC;
$$;

-- Callable by anonymous visitors (the public page). It exposes ONLY the DTO above.
GRANT EXECUTE ON FUNCTION get_public_showcase(TEXT) TO anon, authenticated;
