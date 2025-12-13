-- Performance indexes for photo loading optimization
-- These indexes speed up the most common query patterns

-- Composite index for photo listing: user_id + created_at DESC + id DESC
-- This matches the exact ORDER BY used in getPhotos() queries
CREATE INDEX IF NOT EXISTS idx_images_user_created_id
ON images(user_id, created_at DESC, id DESC);

-- Partial index for detection quality status lookups
-- Only indexes rows where quality_status is not null (sparse index)
CREATE INDEX IF NOT EXISTS idx_detections_image_quality
ON detections(image_id, quality_status)
WHERE quality_status IS NOT NULL;

-- Index for batch-based photo queries (common during upload)
CREATE INDEX IF NOT EXISTS idx_images_user_batch
ON images(user_id, batch_id)
WHERE batch_id IS NOT NULL;
