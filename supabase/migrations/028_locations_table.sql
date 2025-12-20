-- Migration: 028_locations_table
-- Description: Create dedicated locations table for managing camera locations
-- Date: 2024-12-20

-- ----------------------------------------------------------------------------
-- Create locations table
-- ----------------------------------------------------------------------------
CREATE TABLE locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    lat DECIMAL(9,6) NOT NULL,
    lng DECIMAL(9,6) NOT NULL,
    direction_compass INT CHECK (direction_compass IS NULL OR (direction_compass >= 0 AND direction_compass <= 360)),
    direction_notes TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- Index for user queries
CREATE INDEX idx_locations_user_id ON locations(user_id);

-- Index for name lookups
CREATE INDEX idx_locations_name ON locations(user_id, name);

-- ----------------------------------------------------------------------------
-- Add location_id FK to processing_batches
-- ----------------------------------------------------------------------------
ALTER TABLE processing_batches
ADD COLUMN location_id UUID REFERENCES locations(id) ON DELETE SET NULL;

CREATE INDEX idx_processing_batches_location_id ON processing_batches(location_id);

-- ----------------------------------------------------------------------------
-- RLS Policies for locations
-- ----------------------------------------------------------------------------
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view accessible locations"
    ON locations FOR SELECT
    USING (has_account_access(user_id));

CREATE POLICY "Account owners can insert locations"
    ON locations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Account owners can update own locations"
    ON locations FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Account owners can delete own locations"
    ON locations FOR DELETE
    USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Migrate existing area_name data to locations table
-- ----------------------------------------------------------------------------
-- Create locations from existing distinct area_name + coordinates
INSERT INTO locations (user_id, name, lat, lng, direction_compass, direction_notes, created_at)
SELECT DISTINCT ON (user_id, area_name)
    user_id,
    area_name,
    location_lat,
    location_lng,
    direction_compass,
    direction_notes,
    created_at
FROM processing_batches
WHERE area_name IS NOT NULL
  AND location_lat IS NOT NULL
  AND location_lng IS NOT NULL
ORDER BY user_id, area_name, created_at ASC;

-- Link batches to newly created locations
UPDATE processing_batches pb
SET location_id = l.id
FROM locations l
WHERE pb.user_id = l.user_id
  AND pb.area_name = l.name
  AND pb.location_id IS NULL;

-- ----------------------------------------------------------------------------
-- Updated_at trigger
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_locations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER locations_updated_at
    BEFORE UPDATE ON locations
    FOR EACH ROW
    EXECUTE FUNCTION update_locations_updated_at();

-- ----------------------------------------------------------------------------
-- Comments
-- ----------------------------------------------------------------------------
COMMENT ON TABLE locations IS 'User-defined camera/stand locations for organizing photos';
COMMENT ON COLUMN locations.name IS 'User-friendly location name (e.g., "North Ridge", "Creek Bottom")';
COMMENT ON COLUMN locations.lat IS 'Latitude coordinate (6 decimal places = ~11cm precision)';
COMMENT ON COLUMN locations.lng IS 'Longitude coordinate';
COMMENT ON COLUMN locations.direction_compass IS 'Camera facing direction in degrees (0=North, 90=East, etc.)';
COMMENT ON COLUMN locations.direction_notes IS 'Free-text description of camera direction/view';
COMMENT ON COLUMN locations.notes IS 'Additional notes about this location';
COMMENT ON COLUMN processing_batches.location_id IS 'FK to locations table for structured location data';
