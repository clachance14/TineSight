-- Add presence flags for multi-class detection
ALTER TABLE images
ADD COLUMN IF NOT EXISTS has_hogs BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS has_cows BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS has_goats BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS has_people BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS has_vehicles BOOLEAN DEFAULT NULL;

-- Add count columns (optional, for filtering efficiency)
ALTER TABLE images
ADD COLUMN IF NOT EXISTS hog_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS cow_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS goat_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS people_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS vehicle_count INTEGER DEFAULT 0;

-- Add indexes for common filter queries
CREATE INDEX IF NOT EXISTS idx_images_has_hogs ON images(has_hogs) WHERE has_hogs = true;
CREATE INDEX IF NOT EXISTS idx_images_has_cows ON images(has_cows) WHERE has_cows = true;
CREATE INDEX IF NOT EXISTS idx_images_has_goats ON images(has_goats) WHERE has_goats = true;
CREATE INDEX IF NOT EXISTS idx_images_has_people ON images(has_people) WHERE has_people = true;
CREATE INDEX IF NOT EXISTS idx_images_has_vehicles ON images(has_vehicles) WHERE has_vehicles = true;

-- Add detection_class to detections table for non-deer storage
ALTER TABLE detections
ADD COLUMN IF NOT EXISTS detection_class VARCHAR(20) DEFAULT 'deer';

COMMENT ON COLUMN images.has_hogs IS 'True if hogs detected in image';
COMMENT ON COLUMN images.has_cows IS 'True if cows detected in image';
COMMENT ON COLUMN images.has_goats IS 'True if goats detected in image';
COMMENT ON COLUMN images.has_people IS 'True if people detected in image';
COMMENT ON COLUMN images.has_vehicles IS 'True if vehicles detected in image';
COMMENT ON COLUMN detections.detection_class IS 'Classification: deer, hog, cow, goat, vehicle, person';
