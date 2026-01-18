-- ============================================================================
-- TineSight Session Counter Function Migration
-- ============================================================================
-- This migration adds an RPC function for atomically incrementing upload
-- session processing counters from Trigger.dev background jobs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- increment_session_counters: Atomically update session progress counters
-- Called by analyze-photo job to track processing progress during bulk uploads
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_session_counters(
  session_id UUID,
  increment_processed INT DEFAULT 0,
  increment_failed INT DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  UPDATE upload_sessions
  SET
    processed_count = processed_count + increment_processed,
    failed_count = failed_count + increment_failed
  WHERE id = session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_session_counters IS 'Atomically increment upload session processing counters for bulk upload progress tracking';
