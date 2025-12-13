-- Migration: 011_sam2_detection_fields.sql
-- Description: Add SAM2 pipeline support fields to detections table
-- Feature: 009-sam2-vast-pipeline

-- T001: Add new columns for SAM2 pipeline support
ALTER TABLE detections
ADD COLUMN IF NOT EXISTS analysis_source TEXT,
ADD COLUMN IF NOT EXISTS antler_bbox JSONB,
ADD COLUMN IF NOT EXISTS sam2_deer_score DECIMAL(4,3),
ADD COLUMN IF NOT EXISTS sam2_antler_score DECIMAL(4,3);

-- Add comments for documentation
COMMENT ON COLUMN detections.analysis_source IS 'Detection pipeline: gemini or sam2';
COMMENT ON COLUMN detections.antler_bbox IS 'SAM2 antler bounding box {x,y,width,height} 0-10000 scale';
COMMENT ON COLUMN detections.sam2_deer_score IS 'SAM2 deer detection confidence 0-1';
COMMENT ON COLUMN detections.sam2_antler_score IS 'SAM2 antler detection confidence 0-1';

-- T002: Index for filtering by analysis source
CREATE INDEX IF NOT EXISTS idx_detections_analysis_source
ON detections (analysis_source)
WHERE analysis_source IS NOT NULL;

-- Composite index for SAM2-specific queries
CREATE INDEX IF NOT EXISTS idx_detections_sam2_source
ON detections (image_id, analysis_source)
WHERE analysis_source = 'sam2';

-- T003: Add check constraint for valid analysis sources
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_analysis_source'
    ) THEN
        ALTER TABLE detections
        ADD CONSTRAINT chk_analysis_source
        CHECK (analysis_source IS NULL OR analysis_source IN ('gemini', 'sam2'));
    END IF;
END $$;

-- T004: Backfill existing records to indicate Gemini source
UPDATE detections
SET analysis_source = 'gemini'
WHERE analysis_source IS NULL
  AND gemini_confidence IS NOT NULL;
