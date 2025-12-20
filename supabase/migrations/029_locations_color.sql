-- Migration: Add color column to locations table
-- Purpose: Allow users to customize location pin colors for better visibility on maps

-- Add color column with blue as default (more visible than copper on satellite/terrain)
ALTER TABLE locations
ADD COLUMN color TEXT DEFAULT '#3B82F6';

-- Add comment for documentation
COMMENT ON COLUMN locations.color IS 'Hex color code for map pin display (e.g., #3B82F6)';
