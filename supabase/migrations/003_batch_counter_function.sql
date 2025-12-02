-- ============================================================================
-- TineSight Batch Counter Function Migration
-- ============================================================================
-- This migration adds an RPC function for atomically incrementing batch
-- processing counters from Trigger.dev background jobs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- increment_batch_counters: Atomically update batch progress counters
-- Called by detect-animals job to track processing progress
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION increment_batch_counters(
  batch_id UUID,
  increment_processed INT DEFAULT 0,
  increment_successful INT DEFAULT 0,
  increment_failed INT DEFAULT 0
)
RETURNS VOID AS $$
BEGIN
  UPDATE processing_batches
  SET
    processed_images = processed_images + increment_processed,
    successful_images = successful_images + increment_successful,
    failed_images = failed_images + increment_failed
  WHERE id = batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_batch_counters IS 'Atomically increment batch processing counters for background job progress tracking';
