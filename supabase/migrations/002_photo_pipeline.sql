-- ============================================================================
-- TineSight Photo Pipeline Schema Migration
-- ============================================================================
-- This migration adds tables and functions for the photo processing pipeline:
-- - processing_batches: Track batch upload progress
-- - match_candidates: Human-in-the-loop match confirmation
-- - Modifies deer_embeddings: Allow orphaned embeddings (deer_id nullable)
-- - Adds find_similar_deer function for similarity search
-- - Adds batch_id to images table
-- ============================================================================

-- ============================================================================
-- SCHEMA MODIFICATIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Make deer_embeddings.deer_id nullable for orphaned embeddings
-- Orphaned embeddings exist before user confirms a match
-- ----------------------------------------------------------------------------
ALTER TABLE deer_embeddings
ALTER COLUMN deer_id DROP NOT NULL;

-- Drop existing RLS policies that require deer_id
DROP POLICY IF EXISTS "Users can view embeddings for accessible deer" ON deer_embeddings;
DROP POLICY IF EXISTS "Users can insert embeddings for own deer" ON deer_embeddings;
DROP POLICY IF EXISTS "Users can update embeddings for own deer" ON deer_embeddings;
DROP POLICY IF EXISTS "Users can delete embeddings for own deer" ON deer_embeddings;

-- New policies that handle both orphaned (deer_id IS NULL) and assigned embeddings
CREATE POLICY "Users can view accessible embeddings"
ON deer_embeddings FOR SELECT
USING (
  -- Assigned embeddings: via deer relationship
  (deer_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM deer WHERE deer.id = deer_embeddings.deer_id
    AND has_account_access(deer.user_id)
  ))
  OR
  -- Orphaned embeddings: via detection→image relationship
  (deer_id IS NULL AND EXISTS (
    SELECT 1 FROM detections d
    JOIN images i ON d.image_id = i.id
    WHERE d.id = deer_embeddings.detection_id
    AND has_account_access(i.user_id)
  ))
);

CREATE POLICY "Users can insert own embeddings"
ON deer_embeddings FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM detections d
    JOIN images i ON d.image_id = i.id
    WHERE d.id = deer_embeddings.detection_id
    AND auth.uid() = i.user_id
  )
);

CREATE POLICY "Users can update own embeddings"
ON deer_embeddings FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM detections d
    JOIN images i ON d.image_id = i.id
    WHERE d.id = deer_embeddings.detection_id
    AND auth.uid() = i.user_id
  )
);

CREATE POLICY "Users can delete own embeddings"
ON deer_embeddings FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM detections d
    JOIN images i ON d.image_id = i.id
    WHERE d.id = deer_embeddings.detection_id
    AND auth.uid() = i.user_id
  )
);

-- ============================================================================
-- NEW TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- processing_batches: Track batch upload progress and status
-- ----------------------------------------------------------------------------
CREATE TABLE processing_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'uploading', 'processing', 'completed', 'partial_error', 'failed')),
  total_images INT NOT NULL DEFAULT 0,
  uploaded_images INT NOT NULL DEFAULT 0,
  processed_images INT NOT NULL DEFAULT 0,
  successful_images INT NOT NULL DEFAULT 0,
  failed_images INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes for batch queries
CREATE INDEX idx_processing_batches_user_id ON processing_batches(user_id);
CREATE INDEX idx_processing_batches_status ON processing_batches(status);
CREATE INDEX idx_processing_batches_created_at ON processing_batches(created_at DESC);

-- Enable RLS
ALTER TABLE processing_batches ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own batches"
ON processing_batches FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own batches"
ON processing_batches FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own batches"
ON processing_batches FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own batches"
ON processing_batches FOR DELETE
USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Add batch_id to images table
-- ----------------------------------------------------------------------------
ALTER TABLE images
ADD COLUMN batch_id UUID REFERENCES processing_batches(id) ON DELETE SET NULL;

-- Add retry tracking to images
ALTER TABLE images
ADD COLUMN retry_count INT NOT NULL DEFAULT 0;

ALTER TABLE images
ADD COLUMN error_message TEXT;

ALTER TABLE images
ADD COLUMN thumbnail_path TEXT;

CREATE INDEX idx_images_batch_id ON images(batch_id);

-- ----------------------------------------------------------------------------
-- match_candidates: Potential matches for human review
-- ----------------------------------------------------------------------------
CREATE TABLE match_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_id UUID NOT NULL REFERENCES detections(id) ON DELETE CASCADE,
  candidate_deer_id UUID NOT NULL REFERENCES deer(id) ON DELETE CASCADE,
  similarity_score DECIMAL(5,4) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected')),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(detection_id, candidate_deer_id)
);

-- Indexes for match queries
CREATE INDEX idx_match_candidates_detection_id ON match_candidates(detection_id);
CREATE INDEX idx_match_candidates_candidate_deer_id ON match_candidates(candidate_deer_id);
CREATE INDEX idx_match_candidates_status ON match_candidates(status);
CREATE INDEX idx_match_candidates_similarity ON match_candidates(similarity_score DESC);

-- Enable RLS
ALTER TABLE match_candidates ENABLE ROW LEVEL SECURITY;

-- RLS Policies: access via detection→image→user chain
CREATE POLICY "Users can view accessible match candidates"
ON match_candidates FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM detections d
    JOIN images i ON d.image_id = i.id
    WHERE d.id = match_candidates.detection_id
    AND has_account_access(i.user_id)
  )
);

CREATE POLICY "Users can insert match candidates for own images"
ON match_candidates FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM detections d
    JOIN images i ON d.image_id = i.id
    WHERE d.id = match_candidates.detection_id
    AND auth.uid() = i.user_id
  )
);

CREATE POLICY "Users can update match candidates for own images"
ON match_candidates FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM detections d
    JOIN images i ON d.image_id = i.id
    WHERE d.id = match_candidates.detection_id
    AND auth.uid() = i.user_id
  )
);

CREATE POLICY "Users can delete match candidates for own images"
ON match_candidates FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM detections d
    JOIN images i ON d.image_id = i.id
    WHERE d.id = match_candidates.detection_id
    AND auth.uid() = i.user_id
  )
);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- find_similar_deer: Find deer profiles with similar embeddings
-- Uses pgvector cosine distance for similarity search
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION find_similar_deer(
  query_embedding VECTOR(512),
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
    AND de.deer_id IS NOT NULL  -- Only match against confirmed deer profiles
    AND (1 - (de.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY de.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION find_similar_deer IS 'Find deer profiles with similar embeddings for re-identification matching';

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE processing_batches IS 'Track batch upload progress and status';
COMMENT ON TABLE match_candidates IS 'Potential deer matches for human-in-the-loop confirmation';
COMMENT ON COLUMN deer_embeddings.deer_id IS 'Nullable to support orphaned embeddings before match confirmation';
COMMENT ON COLUMN images.batch_id IS 'Reference to upload batch for progress tracking';
COMMENT ON COLUMN images.retry_count IS 'Number of processing retry attempts';
COMMENT ON COLUMN images.error_message IS 'Last error message if processing failed';
COMMENT ON COLUMN images.thumbnail_path IS 'Path to thumbnail version of image';
