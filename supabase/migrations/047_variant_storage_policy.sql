-- Migration 047: Storage RLS for image variants (thumbnail + medium)
--
-- Root cause of "blurry photos in the grid":
-- Migration 004 restricts photos-bucket reads to objects whose FIRST path
-- segment equals auth.uid() -- originals live at `{user_id}/.../file.jpg`.
-- The variant pipeline (migration 041 / ADR 0003) writes variants to FLAT
-- prefixes `thumbnails/{id}.webp` and `medium/{id}.webp`, whose first segment
-- is the literal `thumbnails`/`medium`, never a uid. So an authenticated user
-- could NOT createSignedUrl() for their own variants. /api/photos signs under
-- the user's cookie session (lib/supabase/server), so thumbnailUrl/mediumUrl
-- came back null for every photo and the grid painted only the blurhash
-- placeholder -> every photo looked blurry. Service-role callers (Trigger.dev
-- jobs, the public Showcase RPC path) were unaffected because they bypass RLS.
--
-- Fix: let an authenticated user read a variant object iff they own the images
-- row that references it. Additive only; the originals policy is unchanged.
-- Same gap also broke the detail-page thumbnail and the re-ID pending-matches
-- thumbnails; this one policy restores all of them.

-- Supporting indexes: the ownership check runs once per object during batch
-- signing (the grid signs ~100 variant paths per page). Keep it an index lookup.
CREATE INDEX IF NOT EXISTS images_thumbnail_path_idx ON public.images (thumbnail_path);
CREATE INDEX IF NOT EXISTS images_medium_path_idx ON public.images (medium_path);

CREATE POLICY "Users can view their own image variants"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'photos'
  AND (storage.foldername(name))[1] IN ('thumbnails', 'medium')
  AND EXISTS (
    SELECT 1
    FROM public.images i
    WHERE i.user_id = auth.uid()
      AND (
        i.thumbnail_path = storage.objects.name
        OR i.medium_path = storage.objects.name
      )
  )
);
