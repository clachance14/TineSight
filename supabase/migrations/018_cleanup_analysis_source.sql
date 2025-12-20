-- Migration: 018_cleanup_analysis_source.sql
-- Description: Clean up analysis_source constraint to only allow 'gemini'
-- Date: 2025-12-14
-- Context: Simplify pipeline to use only Gemini API. Legacy data with 'sam2', 'sam3', or 'openai' will remain unchanged.

-- Remove old constraint that allowed multiple analysis sources ('gemini', 'sam2', 'sam3', 'openai')
ALTER TABLE detections DROP CONSTRAINT IF EXISTS chk_analysis_source;

-- Add new constraint allowing only 'gemini' for new inserts
-- NULL is allowed for legacy detections without analysis_source
-- NOTE: This constraint only validates NEW/UPDATED rows. Existing rows with other values remain unchanged.
ALTER TABLE detections ADD CONSTRAINT chk_analysis_source
  CHECK (analysis_source IS NULL OR analysis_source = 'gemini');

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT chk_analysis_source ON detections IS
  'Ensures new detections use only Gemini pipeline. Legacy detections with sam2/sam3/openai values are preserved.';
