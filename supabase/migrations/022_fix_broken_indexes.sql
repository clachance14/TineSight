-- =============================================================================
-- Migration 022: Fix broken indexes and add missing performance indexes
-- Priority: CRITICAL
-- =============================================================================
-- Fixes:
-- 1. idx_detections_antler_points references dropped column (from 020.1)
-- 2. Missing composite indexes for common query patterns
-- =============================================================================

-- 1. Drop the broken index that references the dropped antler_points column
-- This index was created in 020.1 but antler_points was dropped in 015
DROP INDEX IF EXISTS idx_detections_antler_points;

-- 2. Create index on estimated_point_range (the replacement for antler_points)
CREATE INDEX IF NOT EXISTS idx_detections_estimated_point_range
ON detections(estimated_point_range)
WHERE estimated_point_range IS NOT NULL;

-- 3. Create composite index for (user_id, detection_status) queries
-- Used heavily in getPhotos(), retryAllFailed() in lib/services/photos.ts
CREATE INDEX IF NOT EXISTS idx_images_user_detection_status
ON images(user_id, detection_status);

-- 4. Create partial indexes for hot-path status lookups
-- These optimize the most common filtered queries during processing
CREATE INDEX IF NOT EXISTS idx_images_user_pending
ON images(user_id, created_at DESC)
WHERE detection_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_images_user_failed
ON images(user_id, created_at DESC)
WHERE detection_status = 'failed';

-- 5. Add covering index for team_members lookup (used by RLS has_account_access)
CREATE INDEX IF NOT EXISTS idx_team_members_user_accepted
ON team_members(user_id, account_id)
WHERE accepted_at IS NOT NULL;
