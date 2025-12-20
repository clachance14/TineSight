-- Add crop_file_path column to store path to cropped detection images
ALTER TABLE detections ADD COLUMN IF NOT EXISTS crop_file_path TEXT;

COMMENT ON COLUMN detections.crop_file_path IS 'Path to cropped detection image in Supabase Storage (e.g., crops/detection-uuid.jpg)';
