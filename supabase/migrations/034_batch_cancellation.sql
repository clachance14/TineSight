-- Migration: 034_batch_cancellation.sql
-- Purpose: Add support for batch/session cancellation with two-phase deletion
-- Features:
--   1. cancelled_at timestamp on processing_batches for race-condition-safe job skipping
--   2. is_cancelled flag on images for two-phase deletion (mark then async delete)
--   3. 'cancelled' status added to batch status enum
--   4. Indexes for efficient cancelled record lookup

-- Add cancelled_at timestamp to processing_batches
-- Jobs check: if cancelled_at < job_start_time, skip processing
ALTER TABLE processing_batches
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Add 'cancelled' to batch status enum
-- Must drop and recreate constraint to add new value
ALTER TABLE processing_batches
DROP CONSTRAINT IF EXISTS processing_batches_status_check;

ALTER TABLE processing_batches
ADD CONSTRAINT processing_batches_status_check
CHECK (status IN ('pending', 'uploading', 'processing', 'completed', 'partial_error', 'failed', 'cancelled'));

-- Add is_cancelled flag to images for two-phase deletion
-- Phase 1: Mark images as cancelled (instant)
-- Phase 2: Background job deletes marked images in chunks
ALTER TABLE images
ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN NOT NULL DEFAULT FALSE;

-- Add cancelled_at to upload_sessions for session-level tracking
ALTER TABLE upload_sessions
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Add 'cancelled' to upload_sessions status enum
ALTER TABLE upload_sessions
DROP CONSTRAINT IF EXISTS upload_sessions_status_check;

ALTER TABLE upload_sessions
ADD CONSTRAINT upload_sessions_status_check
CHECK (status IN ('uploading', 'processing', 'completed', 'partial_error', 'failed', 'cancelled'));

-- Index for cleanup job to find cancelled images efficiently
-- Partial index only includes cancelled images to minimize index size
CREATE INDEX IF NOT EXISTS idx_images_cancelled
ON images(user_id, created_at)
WHERE is_cancelled = TRUE;

-- Index for quick cancelled batch lookup (job early-exit check)
-- Partial index only includes cancelled batches
CREATE INDEX IF NOT EXISTS idx_processing_batches_cancelled_at
ON processing_batches(id)
WHERE cancelled_at IS NOT NULL;

-- Index for quick cancelled session lookup
CREATE INDEX IF NOT EXISTS idx_upload_sessions_cancelled_at
ON upload_sessions(id)
WHERE cancelled_at IS NOT NULL;

COMMENT ON COLUMN processing_batches.cancelled_at IS 'Timestamp when batch was cancelled. Jobs compare this against their start time to skip processing.';
COMMENT ON COLUMN images.is_cancelled IS 'Flag for two-phase deletion. Phase 1 marks images, Phase 2 (background job) deletes them.';
COMMENT ON COLUMN upload_sessions.cancelled_at IS 'Timestamp when session was cancelled. All batches in session are cancelled together.';
