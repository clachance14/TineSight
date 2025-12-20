-- ============================================================================
-- TineSight MegaDescriptor + ROI Selection Migration
-- ============================================================================
-- This migration:
-- 1. Updates embedding dimension from 512 to 1536 for MegaDescriptor-L-384
-- 2. Creates detection_rois table for user-defined ROI selection
-- 3. Creates roi_feedback table for quality rejection feedback
-- 4. Adds quality_status and quality_score to detections table
-- 5. Updates find_similar_deer function for 1536 dimensions
-- 6. Creates compute_quality_score and count_reference_rois functions
-- ============================================================================

-- ============================================================================
-- PART 1: Migrate embeddings from 512 to 1536 dimensions
-- ============================================================================

-- Drop dependent objects first
DROP INDEX IF EXISTS idx_deer_embeddings_vector;
DROP FUNCTION IF EXISTS find_similar_deer(VECTOR(512), UUID, INT, FLOAT);

-- Alter column type (will fail if existing data - truncate in dev)
ALTER TABLE deer_embeddings
ALTER COLUMN embedding TYPE VECTOR(1536);

-- Recreate vector index with new dimension
CREATE INDEX idx_deer_embeddings_vector ON deer_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Recreate similarity search function with 1536 dimensions
CREATE OR REPLACE FUNCTION find_similar_deer(
  query_embedding VECTOR(1536),
  query_user_id UUID,
  match_count INT DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  deer_id UUID,
  deer_name TEXT,
  similarity FLOAT,
  detection_id UUID,
  image_id UUID,
  image_path TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id AS deer_id,
    d.name AS deer_name,
    (1 - (de.embedding <=> query_embedding))::FLOAT AS similarity,
    de.detection_id,
    det.image_id,
    i.file_path AS image_path
  FROM deer_embeddings de
  JOIN deer d ON de.deer_id = d.id
  JOIN detections det ON de.detection_id = det.id
  JOIN images i ON det.image_id = i.id
  WHERE d.user_id = query_user_id
    AND de.deer_id IS NOT NULL
    AND (1 - (de.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY de.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION find_similar_deer IS 'Find deer with similar MegaDescriptor embeddings (1536-dim)';

-- ============================================================================
-- PART 2: Create detection_rois table
-- ============================================================================

CREATE TABLE detection_rois (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_id UUID NOT NULL REFERENCES detections(id) ON DELETE CASCADE,
  roi_x INTEGER NOT NULL,           -- 0-10000 normalized X coordinate
  roi_y INTEGER NOT NULL,           -- 0-10000 normalized Y coordinate
  roi_width INTEGER NOT NULL,       -- 0-10000 normalized width
  roi_height INTEGER NOT NULL,      -- 0-10000 normalized height
  is_reference BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  UNIQUE(detection_id)              -- One ROI per detection
);

-- Indexes
CREATE INDEX detection_rois_is_reference_idx
ON detection_rois(is_reference) WHERE is_reference = TRUE;

-- Enable RLS
ALTER TABLE detection_rois ENABLE ROW LEVEL SECURITY;

-- RLS Policies for detection_rois
CREATE POLICY "Users can view ROIs for accessible detections"
ON detection_rois FOR SELECT
USING (EXISTS (
  SELECT 1 FROM detections d
  JOIN images i ON d.image_id = i.id
  WHERE d.id = detection_rois.detection_id
  AND has_account_access(i.user_id)
));

CREATE POLICY "Users can insert ROIs for their detections"
ON detection_rois FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM detections d
  JOIN images i ON d.image_id = i.id
  WHERE d.id = detection_rois.detection_id
  AND auth.uid() = i.user_id
));

CREATE POLICY "Users can update ROIs for their detections"
ON detection_rois FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM detections d
  JOIN images i ON d.image_id = i.id
  WHERE d.id = detection_rois.detection_id
  AND auth.uid() = i.user_id
));

CREATE POLICY "Users can delete ROIs for their detections"
ON detection_rois FOR DELETE
USING (EXISTS (
  SELECT 1 FROM detections d
  JOIN images i ON d.image_id = i.id
  WHERE d.id = detection_rois.detection_id
  AND auth.uid() = i.user_id
));

-- ============================================================================
-- PART 3: Create roi_feedback table
-- ============================================================================

CREATE TABLE roi_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_id UUID NOT NULL REFERENCES detections(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN (
    'distant',       -- Deer too far away
    'partial_view',  -- Only part of deer visible
    'no_antlers',    -- Cannot see antlers clearly
    'obstructed',    -- View blocked by vegetation/objects
    'wrong_angle',   -- Poor angle for identification
    'blurry',        -- Image quality too poor
    'other'          -- Specify in notes
  )),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

-- Indexes
CREATE INDEX roi_feedback_detection_id_idx ON roi_feedback(detection_id);
CREATE INDEX roi_feedback_feedback_type_idx ON roi_feedback(feedback_type);

-- Enable RLS
ALTER TABLE roi_feedback ENABLE ROW LEVEL SECURITY;

-- RLS Policies for roi_feedback
CREATE POLICY "Users can view feedback for accessible detections"
ON roi_feedback FOR SELECT
USING (EXISTS (
  SELECT 1 FROM detections d
  JOIN images i ON d.image_id = i.id
  WHERE d.id = roi_feedback.detection_id
  AND has_account_access(i.user_id)
));

CREATE POLICY "Users can create feedback"
ON roi_feedback FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM detections d
  JOIN images i ON d.image_id = i.id
  WHERE d.id = roi_feedback.detection_id
  AND auth.uid() = i.user_id
));

-- ============================================================================
-- PART 4: Add quality fields to detections table
-- ============================================================================

ALTER TABLE detections
ADD COLUMN quality_status TEXT DEFAULT 'pending'
  CHECK (quality_status IN ('pending', 'high_quality', 'low_quality', 'manual_review'));

ALTER TABLE detections
ADD COLUMN quality_score DECIMAL(4,3);

-- Index for quality status queries
CREATE INDEX detections_quality_status_idx ON detections(quality_status);

-- ============================================================================
-- PART 5: Quality scoring functions
-- ============================================================================

-- Count reference ROIs for a user
CREATE OR REPLACE FUNCTION count_reference_rois(
  query_user_id UUID
) RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM detection_rois dr
    JOIN detections d ON d.id = dr.detection_id
    JOIN images i ON i.id = d.image_id
    WHERE dr.is_reference = TRUE
      AND i.user_id = query_user_id
  );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION count_reference_rois IS 'Count reference ROIs for a user (minimum 3 required for auto-filtering)';

-- Compute quality score for a detection based on reference ROI similarity
CREATE OR REPLACE FUNCTION compute_quality_score(
  target_detection_id UUID,
  query_user_id UUID
) RETURNS DECIMAL(4,3) AS $$
DECLARE
  target_embedding VECTOR(1536);
  max_similarity DECIMAL(4,3) := 0;
  ref_count INTEGER;
BEGIN
  -- Check if user has minimum 3 references
  SELECT count_reference_rois(query_user_id) INTO ref_count;

  IF ref_count < 3 THEN
    RETURN NULL;  -- Not enough references for scoring
  END IF;

  -- Get target detection's embedding
  SELECT embedding INTO target_embedding
  FROM deer_embeddings
  WHERE detection_id = target_detection_id;

  IF target_embedding IS NULL THEN
    RETURN NULL;  -- No embedding yet
  END IF;

  -- Find max similarity to any reference ROI embedding
  SELECT COALESCE(MAX(1 - (de.embedding <=> target_embedding)), 0)::DECIMAL(4,3)
  INTO max_similarity
  FROM deer_embeddings de
  JOIN detection_rois dr ON dr.detection_id = de.detection_id
  JOIN detections d ON d.id = dr.detection_id
  JOIN images i ON i.id = d.image_id
  WHERE dr.is_reference = TRUE
    AND i.user_id = query_user_id;

  RETURN max_similarity;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION compute_quality_score IS 'Compute quality score based on similarity to reference ROIs (requires min 3 references)';

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE detection_rois IS 'User-defined region of interest for head/antler selection';
COMMENT ON TABLE roi_feedback IS 'Quality feedback when rejecting matches (for learning)';
COMMENT ON COLUMN detections.quality_status IS 'Quality classification: pending/high_quality/low_quality/manual_review';
COMMENT ON COLUMN detections.quality_score IS 'Similarity score to reference ROIs (0.000-1.000)';
