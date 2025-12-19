-- Migration: Buck Class System
-- Replace antler_points with size_class and estimated_point_range

-- Add new classification columns
ALTER TABLE detections ADD COLUMN size_class TEXT;
ALTER TABLE detections ADD COLUMN estimated_point_range TEXT;

-- Drop old antler_points column
ALTER TABLE detections DROP COLUMN antler_points;
