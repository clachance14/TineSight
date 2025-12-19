-- Add 'openai' to analysis_source constraint for OpenAI pipeline
ALTER TABLE detections DROP CONSTRAINT IF EXISTS chk_analysis_source;
ALTER TABLE detections ADD CONSTRAINT chk_analysis_source
  CHECK (analysis_source IS NULL OR analysis_source IN ('gemini', 'sam2', 'sam3', 'openai'));
