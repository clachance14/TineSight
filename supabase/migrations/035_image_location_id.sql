-- Migration: 035_image_location_id
-- Description: Add direct location_id FK to images table for bulk location assignment
-- Photos can now have their own location independent of batch

-- Add location_id column to images
ALTER TABLE images
ADD COLUMN location_id UUID REFERENCES locations(id) ON DELETE SET NULL;

-- Index for efficient location-based filtering
CREATE INDEX idx_images_location_id ON images(location_id);

-- Comment for documentation
COMMENT ON COLUMN images.location_id IS
  'Direct FK to locations table for per-photo location. Takes precedence over batch location when present.';
