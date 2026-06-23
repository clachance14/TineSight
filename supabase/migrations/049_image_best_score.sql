-- 049_image_best_score.sql
-- Denormalize a photo-level "best score" onto images so the catalog can FILTER,
-- SORT, and CURSOR-paginate by the authoritative antler score in one clean column
-- (instead of joining/aggregating detections on every query).
--
-- best_score = MAX over the image's LIVE detections of the COALESCED score:
--   COALESCE(score_gross, score_estimate)
-- i.e. the authoritative fingerprint gross when present, else the mid-cost
-- estimate (ADR 0004). best_score_is_estimate records whether the winning
-- detection's value was an estimate (score_gross IS NULL) so the UI can label it
-- honestly ("est.").
--
-- Maintained by an AFTER trigger on detections (every score write, soft-delete,
-- hard-delete, or reparent), so the column never drifts. Additive + idempotent.
-- See docs/adr/0004-trophy-gated-ai-cost-cascade.md.

ALTER TABLE images
  ADD COLUMN IF NOT EXISTS best_score INTEGER,
  ADD COLUMN IF NOT EXISTS best_score_is_estimate BOOLEAN NOT NULL DEFAULT FALSE;

-- Filter ("score >= N") + sort ("highest first, nulls last") in one index.
CREATE INDEX IF NOT EXISTS idx_images_user_best_score
  ON images (user_id, best_score DESC NULLS LAST)
  WHERE best_score IS NOT NULL;

-- Recompute the denormalized best score for ONE image from its live detections.
-- v_best is NULL when the image has no scored live detection (column reset).
CREATE OR REPLACE FUNCTION recompute_image_best_score(p_image_id UUID)
RETURNS VOID AS $$
DECLARE
  v_best   INTEGER;
  v_is_est BOOLEAN;
BEGIN
  SELECT COALESCE(d.score_gross, d.score_estimate),
         (d.score_gross IS NULL)
    INTO v_best, v_is_est
  FROM detections d
  WHERE d.image_id = p_image_id
    AND d.deleted_at IS NULL
    AND COALESCE(d.score_gross, d.score_estimate) IS NOT NULL
  ORDER BY COALESCE(d.score_gross, d.score_estimate) DESC
  LIMIT 1;

  UPDATE images
  SET best_score            = v_best,
      best_score_is_estimate = COALESCE(v_is_est, FALSE)
  WHERE id = p_image_id
    -- Avoid a no-op write (and a redundant row version) when nothing changed.
    AND (best_score IS DISTINCT FROM v_best
         OR best_score_is_estimate IS DISTINCT FROM COALESCE(v_is_est, FALSE));
END;
$$ LANGUAGE plpgsql;

-- Trigger glue: recompute the affected image(s) after any relevant change.
CREATE OR REPLACE FUNCTION trg_detection_best_score()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM recompute_image_best_score(OLD.image_id);
    RETURN OLD;
  END IF;

  PERFORM recompute_image_best_score(NEW.image_id);

  -- Reparented detection (rare): the old image loses this detection's score too.
  IF (TG_OP = 'UPDATE' AND NEW.image_id IS DISTINCT FROM OLD.image_id) THEN
    PERFORM recompute_image_best_score(OLD.image_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fire only on the columns that can move best_score (cheap: skips unrelated
-- detection updates like bbox/quality edits).
DROP TRIGGER IF EXISTS detection_best_score ON detections;
CREATE TRIGGER detection_best_score
AFTER INSERT OR DELETE OR UPDATE OF score_gross, score_estimate, deleted_at, image_id
ON detections
FOR EACH ROW
EXECUTE FUNCTION trg_detection_best_score();

-- One-time backfill from existing detections (pure SQL, no Gemini, idempotent).
UPDATE images i
SET best_score             = sub.coalesced,
    best_score_is_estimate = sub.is_estimate
FROM (
  SELECT DISTINCT ON (d.image_id)
    d.image_id,
    COALESCE(d.score_gross, d.score_estimate) AS coalesced,
    (d.score_gross IS NULL)                   AS is_estimate
  FROM detections d
  WHERE d.deleted_at IS NULL
    AND COALESCE(d.score_gross, d.score_estimate) IS NOT NULL
  ORDER BY d.image_id, COALESCE(d.score_gross, d.score_estimate) DESC
) sub
WHERE i.id = sub.image_id
  AND (i.best_score IS DISTINCT FROM sub.coalesced
       OR i.best_score_is_estimate IS DISTINCT FROM sub.is_estimate);
