-- Migration: 008_gemini_analysis.sql
-- Feature: 005-gemini-deer-pipeline

-- Step 1: Clear legacy data (Fresh Start)
TRUNCATE TABLE match_candidates CASCADE;
TRUNCATE TABLE deer_embeddings CASCADE;
TRUNCATE TABLE detection_rois CASCADE;
TRUNCATE TABLE detections CASCADE;

-- Step 2: Add new columns to images
ALTER TABLE images ADD COLUMN IF NOT EXISTS has_deer BOOLEAN;
ALTER TABLE images ADD COLUMN IF NOT EXISTS deer_count INTEGER DEFAULT 0;
ALTER TABLE images ADD COLUMN IF NOT EXISTS analysis_notes TEXT;
ALTER TABLE images ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;

-- Step 3: Add new columns to detections
ALTER TABLE detections ADD COLUMN IF NOT EXISTS species TEXT;
ALTER TABLE detections ADD COLUMN IF NOT EXISTS sex TEXT;
ALTER TABLE detections ADD COLUMN IF NOT EXISTS antler_points INTEGER;
ALTER TABLE detections ADD COLUMN IF NOT EXISTS age_class TEXT;
ALTER TABLE detections ADD COLUMN IF NOT EXISTS distinguishing_features TEXT;
ALTER TABLE detections ADD COLUMN IF NOT EXISTS gemini_confidence INTEGER;
ALTER TABLE detections ADD COLUMN IF NOT EXISTS head_bbox JSONB;
ALTER TABLE detections ADD COLUMN IF NOT EXISTS is_reference BOOLEAN DEFAULT FALSE;

-- Step 4: Add reference detection to deer
ALTER TABLE deer ADD COLUMN IF NOT EXISTS reference_detection_id UUID REFERENCES detections(id);

-- Step 5: Add Gemini fields to match_candidates
ALTER TABLE match_candidates ADD COLUMN IF NOT EXISTS gemini_reasoning TEXT;
ALTER TABLE match_candidates ADD COLUMN IF NOT EXISTS gemini_confidence INTEGER;

-- Step 6: Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_detections_sex ON detections(sex);
CREATE INDEX IF NOT EXISTS idx_detections_antler_points ON detections(antler_points);
CREATE INDEX IF NOT EXISTS idx_detections_is_reference ON detections(is_reference) WHERE is_reference = true;
CREATE INDEX IF NOT EXISTS idx_images_has_deer ON images(has_deer);
CREATE INDEX IF NOT EXISTS idx_match_candidates_status ON match_candidates(status);

-- Step 6b: Add validation constraints
ALTER TABLE detections ADD CONSTRAINT chk_antler_points_for_bucks
  CHECK (sex != 'buck' OR antler_points IS NOT NULL);
ALTER TABLE detections ADD CONSTRAINT chk_gemini_confidence_range
  CHECK (gemini_confidence IS NULL OR (gemini_confidence >= 0 AND gemini_confidence <= 100));

-- Step 7: Add constraint for reference detection uniqueness per deer
CREATE UNIQUE INDEX IF NOT EXISTS idx_deer_reference_detection
ON deer(reference_detection_id)
WHERE reference_detection_id IS NOT NULL;
