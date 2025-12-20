-- Performance indexes for detection filtering
-- These indexes speed up the most common detection filter patterns

-- Index for buck/doe filtering (most common filter)
CREATE INDEX IF NOT EXISTS idx_detections_sex
ON detections(sex) WHERE sex IS NOT NULL;

-- Index for trophy/shooter/average filtering
CREATE INDEX IF NOT EXISTS idx_detections_size_class
ON detections(size_class) WHERE size_class IS NOT NULL;

-- Index for deer sighting lookups
CREATE INDEX IF NOT EXISTS idx_detections_deer_id
ON detections(deer_id) WHERE deer_id IS NOT NULL;

-- Index for point range filtering
CREATE INDEX IF NOT EXISTS idx_detections_antler_points
ON detections(antler_points) WHERE antler_points IS NOT NULL;

-- Composite index for common filter combination (sex + size_class)
CREATE INDEX IF NOT EXISTS idx_detections_sex_size_class
ON detections(sex, size_class) WHERE sex IS NOT NULL;
