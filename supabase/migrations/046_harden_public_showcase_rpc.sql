-- 046_harden_public_showcase_rpc.sql
-- Step 5 security-sweep hardening of the public Showcase RPC (Codex + Claude):
--  * reference-image LATERAL now excludes soft-deleted detections (don't publish
--    an image whose detection the owner soft-deleted);
--  * search_path pinned to public, pg_temp last (SECURITY DEFINER hardening);
--  * EXECUTE revoked from PUBLIC, granted only to anon + authenticated;
--  * COALESCE the nullable buck name for a clean public label.

CREATE OR REPLACE FUNCTION get_public_showcase(p_token TEXT)
RETURNS TABLE (
  showcase_title  TEXT,
  deer_id         UUID,
  buck_name       TEXT,
  score_gross     INTEGER,
  is_trophy       BOOLEAN,
  image_path      TEXT,
  sighting_count  BIGINT,
  buck_position   INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    s.title AS showcase_title,
    d.id AS deer_id,
    COALESCE(d.name, 'Unnamed Buck') AS buck_name,
    agg.max_score AS score_gross,
    COALESCE(agg.any_trophy, FALSE) AS is_trophy,
    refimg.medium_path AS image_path,
    COALESCE(agg.sightings, 0) AS sighting_count,
    sb.position AS buck_position
  FROM showcases s
  JOIN showcase_bucks sb ON sb.showcase_id = s.id
  JOIN deer d ON d.id = sb.deer_id AND d.user_id = s.user_id
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
  LEFT JOIN LATERAL (
    SELECT i.medium_path
    FROM detections rd
    JOIN images i ON i.id = rd.image_id AND i.user_id = s.user_id
    WHERE rd.id = d.reference_detection_id
      AND rd.deleted_at IS NULL          -- don't publish a soft-deleted reference image
    LIMIT 1
  ) refimg ON TRUE
  WHERE s.token = p_token
    AND s.is_active = TRUE
  ORDER BY sb.position ASC, d.name ASC;
$$;

REVOKE EXECUTE ON FUNCTION get_public_showcase(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_public_showcase(TEXT) TO anon, authenticated;
