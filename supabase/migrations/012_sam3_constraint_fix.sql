-- Migration: 012_sam3_constraint_fix.sql
-- Description: Fix constraints for SAM3 (YOLO-World) pipeline
-- Feature: 009-sam3-vast-pipeline

-- Fix 1: Update analysis_source constraint to allow 'sam3'
ALTER TABLE detections DROP CONSTRAINT IF EXISTS chk_analysis_source;
ALTER TABLE detections ADD CONSTRAINT chk_analysis_source
  CHECK (analysis_source IS NULL OR analysis_source IN ('gemini', 'sam2', 'sam3'));

-- Fix 2: Relax antler_points constraint for bucks
-- Gemini classification may not always detect point count, especially for partial/blurry images
ALTER TABLE detections DROP CONSTRAINT IF EXISTS chk_antler_points_for_bucks;
-- Not re-adding this constraint - antler_points can be null for bucks when unclear

-- Fix 3: Add sam3 columns if missing (rename from sam2)
DO $$
BEGIN
    -- Add sam3_deer_score if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'detections' AND column_name = 'sam3_deer_score'
    ) THEN
        ALTER TABLE detections ADD COLUMN sam3_deer_score DECIMAL(4,3);
    END IF;

    -- Add sam3_antler_score if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'detections' AND column_name = 'sam3_antler_score'
    ) THEN
        ALTER TABLE detections ADD COLUMN sam3_antler_score DECIMAL(4,3);
    END IF;
END $$;

-- Update index for sam3 source
DROP INDEX IF EXISTS idx_detections_sam2_source;
CREATE INDEX IF NOT EXISTS idx_detections_sam3_source
ON detections (image_id, analysis_source)
WHERE analysis_source = 'sam3';

COMMENT ON COLUMN detections.sam3_deer_score IS 'YOLO-World deer detection confidence 0-1';
COMMENT ON COLUMN detections.sam3_antler_score IS 'YOLO-World antler detection confidence 0-1 (not used in current pipeline)';
