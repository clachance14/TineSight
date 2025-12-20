-- Migration: 019_batch_metrics.sql
-- Description: Add batch_metrics table for tracking Gemini API usage and rate limits

CREATE TABLE batch_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES processing_batches(id) ON DELETE CASCADE,
  image_id UUID REFERENCES images(id) ON DELETE SET NULL,

  -- Gemini API metrics
  gemini_call_type TEXT NOT NULL,  -- 'detection' | 'classification' | 'comparison'
  model_used TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  response_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,

  -- Rate limit tracking
  is_rate_limited BOOLEAN NOT NULL DEFAULT FALSE,
  retry_count INTEGER NOT NULL DEFAULT 0,

  -- Timing
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient batch queries
CREATE INDEX idx_batch_metrics_batch_id ON batch_metrics(batch_id);
CREATE INDEX idx_batch_metrics_image_id ON batch_metrics(image_id);

-- RLS - service role only (background jobs)
ALTER TABLE batch_metrics ENABLE ROW LEVEL SECURITY;

-- No RLS policies needed - service role bypasses RLS
-- This table is written by background jobs only

COMMENT ON TABLE batch_metrics IS 'Tracks Gemini API usage per call for batch processing reports';
COMMENT ON COLUMN batch_metrics.gemini_call_type IS 'Type of Gemini API call: detection, classification, or comparison';
COMMENT ON COLUMN batch_metrics.is_rate_limited IS 'Whether this call encountered a rate limit and had to retry';
