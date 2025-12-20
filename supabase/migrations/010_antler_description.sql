-- Migration: Add antler_description column to detections
-- Purpose: Store qualitative antler descriptions from Gemini analysis

ALTER TABLE detections ADD COLUMN IF NOT EXISTS antler_description TEXT;

COMMENT ON COLUMN detections.antler_description IS 'Qualitative description of antler characteristics (e.g., "Typical 10-point, wide spread, tall G2s")';
