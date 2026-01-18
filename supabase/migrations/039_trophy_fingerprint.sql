-- 039_trophy_fingerprint.sql

-- Add fingerprint column to detections
ALTER TABLE detections ADD COLUMN antler_fingerprint JSONB;

CREATE INDEX idx_detections_fingerprint
  ON detections USING gin (antler_fingerprint)
  WHERE antler_fingerprint IS NOT NULL;

CREATE INDEX idx_detections_fingerprint_score_class
  ON detections ((antler_fingerprint->'scores'->>'score_class'))
  WHERE antler_fingerprint IS NOT NULL;

-- Add antler print similarity to match candidates
ALTER TABLE match_candidates ADD COLUMN antler_print_similarity DECIMAL(3,2);

-- Trophy clusters table
CREATE TABLE trophy_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  representative_detection_id UUID REFERENCES detections(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'named', 'merged', 'split', 'dismissed')),
  created_deer_id UUID REFERENCES deer(id) ON DELETE SET NULL,
  member_count INTEGER NOT NULL DEFAULT 0,
  avg_similarity DECIMAL(4,3),
  min_similarity DECIMAL(4,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trophy_clusters_user_status
  ON trophy_clusters(user_id, status)
  WHERE status = 'pending';

-- Cluster membership table
CREATE TABLE trophy_cluster_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL REFERENCES trophy_clusters(id) ON DELETE CASCADE,
  detection_id UUID NOT NULL REFERENCES detections(id) ON DELETE CASCADE,
  similarity_to_representative DECIMAL(4,3),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(detection_id)
);

CREATE INDEX idx_trophy_cluster_members_cluster
  ON trophy_cluster_members(cluster_id);

CREATE INDEX idx_trophy_cluster_members_detection
  ON trophy_cluster_members(detection_id);

-- RLS policies
ALTER TABLE trophy_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE trophy_cluster_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clusters"
  ON trophy_clusters FOR SELECT
  USING (has_account_access(user_id));

CREATE POLICY "Users can insert own clusters"
  ON trophy_clusters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own clusters"
  ON trophy_clusters FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own clusters"
  ON trophy_clusters FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view accessible cluster members"
  ON trophy_cluster_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trophy_clusters
      WHERE trophy_clusters.id = trophy_cluster_members.cluster_id
      AND has_account_access(trophy_clusters.user_id)
    )
  );

CREATE POLICY "Users can manage own cluster members"
  ON trophy_cluster_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM trophy_clusters
      WHERE trophy_clusters.id = trophy_cluster_members.cluster_id
      AND auth.uid() = trophy_clusters.user_id
    )
  );

-- Helper function for unassigned trophy detections
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
    AND d.size_class = 'trophy'
    AND d.deer_id IS NULL
    AND d.antler_fingerprint IS NOT NULL
    AND tcm.id IS NULL
    AND d.deleted_at IS NULL
  ORDER BY i.captured_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
