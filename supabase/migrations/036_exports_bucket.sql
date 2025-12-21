-- ============================================================================
-- TineSight Exports Storage Bucket Migration
-- ============================================================================
-- Creates the exports storage bucket for temporary ZIP files and access policies
-- ============================================================================

-- Create exports bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exports',
  'exports',
  false,
  524288000, -- 500MB
  ARRAY['application/zip', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for exports bucket
-- Users can only access files in their own folder (user_id/...)

CREATE POLICY "Users can upload their own exports"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'exports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can download their own exports"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'exports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own exports"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'exports' AND (storage.foldername(name))[1] = auth.uid()::text);
