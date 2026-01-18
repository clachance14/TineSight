-- Add blur_data_url column to images table for per-image blur placeholders
-- This stores base64-encoded JPEG data URLs (~600 bytes per image)
-- Generated server-side to avoid client-side decode costs

ALTER TABLE images ADD COLUMN blur_data_url TEXT;

COMMENT ON COLUMN images.blur_data_url IS 'Base64 data URL for blur placeholder';
