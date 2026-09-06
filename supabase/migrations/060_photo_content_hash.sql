-- Filename/size is not identity: many physical cameras reuse both.
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS content_sha256 text;
ALTER TABLE public.images ADD CONSTRAINT images_content_sha256_format CHECK(content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$');
CREATE INDEX IF NOT EXISTS images_uploaded_content_sha256 ON public.images(user_id,content_sha256) WHERE upload_completed_at IS NOT NULL AND NOT is_cancelled;
-- Legacy originals stay un-hashed until explicitly re-imported/verified; never infer a checksum from a name.
CREATE OR REPLACE FUNCTION public.get_uploaded_content_hashes(p_hashes text[])
RETURNS text[] LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT coalesce(array_agg(DISTINCT content_sha256),'{}') FROM public.images
 WHERE user_id=auth.uid() AND content_sha256=ANY(p_hashes) AND upload_completed_at IS NOT NULL AND NOT is_cancelled
$$;
REVOKE ALL ON FUNCTION public.get_uploaded_content_hashes(text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_uploaded_content_hashes(text[]) TO authenticated;
