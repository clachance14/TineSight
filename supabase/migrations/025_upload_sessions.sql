-- ============================================================================
-- Upload Sessions Migration
-- ============================================================================
-- Groups processing_batches into upload sessions. When a user uploads 100 photos,
-- the frontend chunks them into 20-photo batches. This migration adds a parent
-- "upload_session" to group all those batches as a single upload event.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Create upload_sessions table
-- ----------------------------------------------------------------------------
CREATE TABLE upload_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  total_batches INT NOT NULL DEFAULT 0,
  total_images INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'processing', 'completed', 'partial_error', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes for session queries
CREATE INDEX idx_upload_sessions_user_id ON upload_sessions(user_id);
CREATE INDEX idx_upload_sessions_created_at ON upload_sessions(created_at DESC);
CREATE INDEX idx_upload_sessions_status ON upload_sessions(status);

-- Enable RLS
ALTER TABLE upload_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own upload sessions"
ON upload_sessions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own upload sessions"
ON upload_sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own upload sessions"
ON upload_sessions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own upload sessions"
ON upload_sessions FOR DELETE
USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Add upload_session_id FK to processing_batches
-- ----------------------------------------------------------------------------
ALTER TABLE processing_batches
ADD COLUMN upload_session_id UUID REFERENCES upload_sessions(id) ON DELETE SET NULL;

CREATE INDEX idx_processing_batches_upload_session_id ON processing_batches(upload_session_id);

-- ----------------------------------------------------------------------------
-- Backfill: Create 1:1 session for each existing batch
-- This preserves backward compatibility
-- ----------------------------------------------------------------------------
INSERT INTO upload_sessions (id, user_id, total_batches, total_images, status, created_at, completed_at)
SELECT
  gen_random_uuid(),
  pb.user_id,
  1,
  pb.total_images,
  CASE
    WHEN pb.status = 'completed' THEN 'completed'
    WHEN pb.status = 'failed' THEN 'failed'
    WHEN pb.status = 'partial_error' THEN 'partial_error'
    ELSE 'uploading'
  END,
  pb.created_at,
  pb.completed_at
FROM processing_batches pb
WHERE pb.upload_session_id IS NULL;

-- Link existing batches to their new sessions
-- We need to match by user_id and created_at since we just created sessions with matching values
UPDATE processing_batches pb
SET upload_session_id = us.id
FROM upload_sessions us
WHERE pb.user_id = us.user_id
  AND pb.created_at = us.created_at
  AND pb.upload_session_id IS NULL
  AND us.total_batches = 1;

-- ----------------------------------------------------------------------------
-- Function to update session totals when batch completes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_session_on_batch_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Update session totals
  IF NEW.upload_session_id IS NOT NULL THEN
    UPDATE upload_sessions
    SET
      total_batches = (
        SELECT COUNT(*) FROM processing_batches WHERE upload_session_id = NEW.upload_session_id
      ),
      total_images = (
        SELECT COALESCE(SUM(total_images), 0) FROM processing_batches WHERE upload_session_id = NEW.upload_session_id
      ),
      status = (
        SELECT
          CASE
            WHEN COUNT(*) FILTER (WHERE status = 'failed') = COUNT(*) THEN 'failed'
            WHEN COUNT(*) FILTER (WHERE status IN ('failed', 'partial_error')) > 0 THEN 'partial_error'
            WHEN COUNT(*) FILTER (WHERE status = 'completed') = COUNT(*) THEN 'completed'
            WHEN COUNT(*) FILTER (WHERE status = 'processing') > 0 THEN 'processing'
            ELSE 'uploading'
          END
        FROM processing_batches WHERE upload_session_id = NEW.upload_session_id
      ),
      completed_at = (
        SELECT
          CASE
            WHEN COUNT(*) FILTER (WHERE status IN ('pending', 'uploading', 'processing')) = 0
            THEN NOW()
            ELSE NULL
          END
        FROM processing_batches WHERE upload_session_id = NEW.upload_session_id
      )
    WHERE id = NEW.upload_session_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_session_on_batch_change
AFTER INSERT OR UPDATE ON processing_batches
FOR EACH ROW
EXECUTE FUNCTION update_session_on_batch_change();

-- ----------------------------------------------------------------------------
-- Comments
-- ----------------------------------------------------------------------------
COMMENT ON TABLE upload_sessions IS 'Groups processing_batches from the same upload event';
COMMENT ON COLUMN upload_sessions.total_batches IS 'Number of batches in this session';
COMMENT ON COLUMN upload_sessions.total_images IS 'Total images across all batches';
COMMENT ON COLUMN processing_batches.upload_session_id IS 'Parent session grouping batches from same upload';
