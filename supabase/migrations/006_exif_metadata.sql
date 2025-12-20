-- ============================================================================
-- TineSight EXIF Metadata Migration
-- ============================================================================
-- This migration adds EXIF metadata extraction and camera auto-matching:
-- 1. Adds camera identification fields (make, model, device_identifier, exif_signature)
-- 2. Adds EXIF data storage to images table
-- 3. Creates index for fast camera matching by EXIF signature
-- ============================================================================

-- ============================================================================
-- PART 1: Add camera identification fields
-- ============================================================================

ALTER TABLE cameras ADD COLUMN make TEXT;
ALTER TABLE cameras ADD COLUMN model TEXT;
ALTER TABLE cameras ADD COLUMN device_identifier TEXT;
ALTER TABLE cameras ADD COLUMN exif_signature TEXT UNIQUE;

-- ============================================================================
-- PART 2: Add EXIF storage to images
-- ============================================================================

ALTER TABLE images ADD COLUMN exif_data JSONB;

-- ============================================================================
-- PART 3: Create index for fast camera matching
-- ============================================================================

CREATE INDEX idx_cameras_exif_signature ON cameras(exif_signature) WHERE exif_signature IS NOT NULL;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN cameras.make IS 'Camera manufacturer from EXIF (e.g., "MUDDY", "Bushnell")';
COMMENT ON COLUMN cameras.model IS 'Camera model from EXIF (e.g., "MUD_MTC16", "Core DS-4K")';
COMMENT ON COLUMN cameras.device_identifier IS 'Unique device ID from EXIF if available';
COMMENT ON COLUMN cameras.exif_signature IS 'SHA256 hash of make:model:device_identifier for auto-matching';
COMMENT ON COLUMN images.exif_data IS 'Full EXIF metadata extracted from uploaded image';
