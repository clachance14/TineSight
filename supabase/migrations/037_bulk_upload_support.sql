-- Migration: 037_bulk_upload_support.sql
-- Feature: 012-bulk-upload
-- Description: Add bulk upload support with deduplication and progress tracking

-- Add original_filename for filename+size deduplication
-- Allows re-uploading folder after page refresh by skipping existing files
ALTER TABLE images ADD COLUMN IF NOT EXISTS original_filename TEXT;

-- Create deduplication index on (user_id, original_filename, file_size_bytes)
-- Used by check-duplicates endpoint to quickly identify existing files
CREATE INDEX IF NOT EXISTS idx_images_dedup
ON images(user_id, original_filename, file_size_bytes)
WHERE original_filename IS NOT NULL;

-- Add progress tracking columns to upload_sessions
-- Enables real-time progress visibility in UI
ALTER TABLE upload_sessions ADD COLUMN IF NOT EXISTS uploaded_count INT NOT NULL DEFAULT 0;
ALTER TABLE upload_sessions ADD COLUMN IF NOT EXISTS processed_count INT NOT NULL DEFAULT 0;
ALTER TABLE upload_sessions ADD COLUMN IF NOT EXISTS failed_count INT NOT NULL DEFAULT 0;
ALTER TABLE upload_sessions ADD COLUMN IF NOT EXISTS skipped_count INT NOT NULL DEFAULT 0;

-- Add check constraints for progress counters
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_uploaded_count'
  ) THEN
    ALTER TABLE upload_sessions ADD CONSTRAINT chk_uploaded_count
    CHECK (uploaded_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_processed_count'
  ) THEN
    ALTER TABLE upload_sessions ADD CONSTRAINT chk_processed_count
    CHECK (processed_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_failed_count'
  ) THEN
    ALTER TABLE upload_sessions ADD CONSTRAINT chk_failed_count
    CHECK (failed_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_skipped_count'
  ) THEN
    ALTER TABLE upload_sessions ADD CONSTRAINT chk_skipped_count
    CHECK (skipped_count >= 0);
  END IF;
END $$;

-- Comment the new columns
COMMENT ON COLUMN images.original_filename IS 'Original filename from upload, used with file_size_bytes for duplicate detection';
COMMENT ON COLUMN upload_sessions.uploaded_count IS 'Number of files successfully uploaded to storage';
COMMENT ON COLUMN upload_sessions.processed_count IS 'Number of files with AI processing complete';
COMMENT ON COLUMN upload_sessions.failed_count IS 'Number of files that failed upload or processing';
COMMENT ON COLUMN upload_sessions.skipped_count IS 'Number of files skipped due to deduplication';
