-- Migration: Backfill locations from processing_batches area_name data
-- This migrates historical batch location data to the locations table

-- Step 1: Create locations from existing batch area_names (if not already exist)
INSERT INTO locations (user_id, name, lat, lng, direction_compass, direction_notes)
SELECT DISTINCT
  pb.user_id,
  pb.area_name,
  pb.location_lat,
  pb.location_lng,
  pb.direction_compass,
  pb.direction_notes
FROM processing_batches pb
WHERE pb.area_name IS NOT NULL
  AND pb.location_id IS NULL
  AND pb.location_lat IS NOT NULL
  AND pb.location_lng IS NOT NULL
ON CONFLICT (user_id, name) DO NOTHING;

-- Step 2: Link batches to their locations by matching name
UPDATE processing_batches pb
SET location_id = l.id
FROM locations l
WHERE pb.area_name = l.name
  AND pb.user_id = l.user_id
  AND pb.location_id IS NULL;
