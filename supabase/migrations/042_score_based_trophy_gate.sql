-- 042_score_based_trophy_gate.sql
-- Trophy is identified by Score, not by the cheap size_class glance.
-- See docs/adr/0004-trophy-gated-ai-cost-cascade.md.

-- Per-account trophy threshold (gross inches). Default 130.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS trophy_threshold INTEGER NOT NULL DEFAULT 130;

-- Detection-level scoring fields.
ALTER TABLE detections
  ADD COLUMN IF NOT EXISTS score_estimate INTEGER,             -- mid-cost gross-score estimate
  ADD COLUMN IF NOT EXISTS score_estimate_confidence INTEGER,  -- 0-100 confidence in the estimate
  ADD COLUMN IF NOT EXISTS score_gross INTEGER,                -- authoritative gross score (from fingerprint)
  ADD COLUMN IF NOT EXISTS is_trophy BOOLEAN NOT NULL DEFAULT FALSE;

-- Surface/sort trophies and band-gate candidates fast.
CREATE INDEX IF NOT EXISTS idx_detections_is_trophy
  ON detections (is_trophy)
  WHERE is_trophy = TRUE;

CREATE INDEX IF NOT EXISTS idx_detections_score_estimate
  ON detections (score_estimate)
  WHERE score_estimate IS NOT NULL;

-- The authoritative trophy signal is now is_trophy, not size_class='trophy'.
-- Update the unassigned-trophy helper used by clustering accordingly.
-- (Return signature unchanged from the existing function, so CREATE OR REPLACE is safe.)
CREATE OR REPLACE FUNCTION get_unassigned_trophy_detections(p_user_id UUID)
RETURNS TABLE (
  detection_id UUID,
  fingerprint JSONB,
  crop_file_path TEXT,
  captured_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id AS detection_id,
    d.antler_fingerprint AS fingerprint,
    d.crop_file_path,
    i.captured_at
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
