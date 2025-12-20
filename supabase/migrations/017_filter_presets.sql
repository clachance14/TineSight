-- Migration: Filter Presets
-- Description: Create filter_presets table for saving user filter configurations
-- Author: Claude Code
-- Date: 2025-12-14

-- Create helper function for auto-updating updated_at timestamp (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create filter_presets table
CREATE TABLE IF NOT EXISTS filter_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters JSONB NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique filter preset names per user
  CONSTRAINT unique_user_preset_name UNIQUE (user_id, name)
);

-- Create index on user_id for faster lookups
CREATE INDEX idx_filter_presets_user_id ON filter_presets(user_id);

-- Create index on is_default for faster default preset lookups
CREATE INDEX idx_filter_presets_is_default ON filter_presets(user_id, is_default) WHERE is_default = TRUE;

-- Enable Row-Level Security
ALTER TABLE filter_presets ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read their own filter presets
CREATE POLICY filter_presets_select_own
  ON filter_presets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policy: Users can only insert their own filter presets
CREATE POLICY filter_presets_insert_own
  ON filter_presets
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can only update their own filter presets
CREATE POLICY filter_presets_update_own
  ON filter_presets
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can only delete their own filter presets
CREATE POLICY filter_presets_delete_own
  ON filter_presets
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER filter_presets_updated_at
  BEFORE UPDATE ON filter_presets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE filter_presets IS 'Stores user-defined filter preset configurations for photo filtering';
COMMENT ON COLUMN filter_presets.filters IS 'JSONB object containing filter configuration (e.g., date ranges, camera filters, quality thresholds)';
COMMENT ON COLUMN filter_presets.is_default IS 'Indicates if this preset should be applied by default when user loads the photos page';
