-- Migration: 027_batch_location
-- Feature: 010-photo-location
-- Purpose: Add location fields to processing_batches table

-- Add location fields to processing_batches table
ALTER TABLE processing_batches
ADD COLUMN location_lat DECIMAL(9,6),
ADD COLUMN location_lng DECIMAL(9,6),
ADD COLUMN area_name TEXT,
ADD COLUMN direction_compass INT CHECK (direction_compass IS NULL OR (direction_compass >= 0 AND direction_compass <= 360)),
ADD COLUMN direction_notes TEXT;

-- Index for filtering by area name (partial - excludes nulls for efficiency)
CREATE INDEX idx_processing_batches_area_name
ON processing_batches(area_name)
WHERE area_name IS NOT NULL;

-- Documentation comments
COMMENT ON COLUMN processing_batches.location_lat IS 'Latitude coordinate where photos were taken (6 decimal places, ~11cm precision)';
COMMENT ON COLUMN processing_batches.location_lng IS 'Longitude coordinate where photos were taken';
COMMENT ON COLUMN processing_batches.area_name IS 'User-defined name for the location (e.g., North Ridge, Creek Bottom)';
COMMENT ON COLUMN processing_batches.direction_compass IS 'Camera facing direction in degrees (0-360, 0=North)';
COMMENT ON COLUMN processing_batches.direction_notes IS 'Free-text description of camera direction (e.g., Facing food plot)';
