-- Upload readiness and terminal state belong to the database, not browser counters.
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS upload_completed_at timestamptz;
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS variant_claimed_at timestamptz;
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS analysis_claimed_at timestamptz;
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS analysis_result jsonb;
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS analysis_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.images ADD COLUMN IF NOT EXISTS variant_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.upload_sessions ADD COLUMN IF NOT EXISTS upload_finished_at timestamptz;

-- Existing objects, not merely image reservations, are authoritative.
UPDATE public.images i SET upload_completed_at = COALESCE(i.created_at, now())
WHERE upload_completed_at IS NULL AND EXISTS (
 SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'photos' AND o.name = i.file_path
);
UPDATE public.images SET original_filename = regexp_replace(file_path, '^.*/', '') WHERE original_filename IS NULL;
UPDATE public.upload_sessions SET upload_finished_at = COALESCE(completed_at, now()) WHERE status IN ('completed','partial_error','failed','cancelled');
CREATE INDEX IF NOT EXISTS images_uploaded_dedup ON public.images(user_id,original_filename,file_size_bytes) WHERE upload_completed_at IS NOT NULL AND NOT is_cancelled;

CREATE OR REPLACE FUNCTION public.update_session_on_batch_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
 IF NEW.upload_session_id IS NOT NULL THEN
  UPDATE public.upload_sessions s SET
   total_batches = (SELECT count(*) FROM public.processing_batches b WHERE b.upload_session_id=s.id),
   total_images = (SELECT coalesce(sum(total_images),0) FROM public.processing_batches b WHERE b.upload_session_id=s.id),
   uploaded_count = (SELECT coalesce(sum(uploaded_images),0) FROM public.processing_batches b WHERE b.upload_session_id=s.id),
   processed_count = (SELECT coalesce(sum(processed_images),0) FROM public.processing_batches b WHERE b.upload_session_id=s.id),
   failed_count = (SELECT coalesce(sum(failed_images),0) FROM public.processing_batches b WHERE b.upload_session_id=s.id),
   status = CASE WHEN s.status='cancelled' THEN 'cancelled'
    WHEN s.upload_finished_at IS NULL THEN 'uploading'
    WHEN EXISTS(SELECT 1 FROM public.processing_batches b WHERE b.upload_session_id=s.id AND b.status IN ('pending','uploading','processing')) THEN 'processing'
    WHEN EXISTS(SELECT 1 FROM public.processing_batches b WHERE b.upload_session_id=s.id AND b.failed_images>0) THEN 'partial_error'
    ELSE 'completed' END,
   completed_at = CASE WHEN s.status='cancelled' THEN s.completed_at
    WHEN s.upload_finished_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.processing_batches b WHERE b.upload_session_id=s.id AND b.status IN ('pending','uploading','processing')) THEN now() ELSE NULL END
  WHERE s.id=NEW.upload_session_id;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.prevent_cancelled_upload_reopen()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.status='cancelled' THEN NEW.status:='cancelled'; NEW.cancelled_at:=OLD.cancelled_at; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_cancelled_session BEFORE UPDATE ON public.upload_sessions FOR EACH ROW EXECUTE FUNCTION public.prevent_cancelled_upload_reopen();
CREATE TRIGGER preserve_cancelled_batch BEFORE UPDATE ON public.processing_batches FOR EACH ROW EXECUTE FUNCTION public.prevent_cancelled_upload_reopen();

-- Count terminal PHOTO transitions once, including failed->processing retries.
CREATE OR REPLACE FUNCTION public.sync_photo_batch_counters()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.batch_id IS NOT NULL AND OLD.detection_status IS DISTINCT FROM NEW.detection_status THEN
  UPDATE public.processing_batches SET
   processed_images=greatest(0,processed_images + (NEW.detection_status IN ('completed','failed'))::int - (OLD.detection_status IN ('completed','failed'))::int),
   successful_images=greatest(0,successful_images + (NEW.detection_status='completed')::int - (OLD.detection_status='completed')::int),
   failed_images=greatest(0,failed_images + (NEW.detection_status='failed')::int - (OLD.detection_status='failed')::int)
  WHERE id=NEW.batch_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sync_photo_batch_counters AFTER UPDATE OF detection_status ON public.images FOR EACH ROW EXECUTE FUNCTION public.sync_photo_batch_counters();
-- Repair existing drift before switching workers away from increment RPC.
UPDATE public.processing_batches b SET
 processed_images=(SELECT count(*) FROM public.images i WHERE i.batch_id=b.id AND i.detection_status IN ('completed','failed')),
 successful_images=(SELECT count(*) FROM public.images i WHERE i.batch_id=b.id AND i.detection_status='completed'),
 failed_images=(SELECT count(*) FROM public.images i WHERE i.batch_id=b.id AND i.detection_status='failed');

CREATE OR REPLACE FUNCTION public.finalize_upload_batch(p_batch_id uuid,p_uploaded_ids uuid[],p_failed_ids uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b public.processing_batches; s public.upload_sessions; ready uuid[];
BEGIN
 SELECT * INTO b FROM public.processing_batches WHERE id=p_batch_id AND user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Batch unavailable' USING ERRCODE='22023'; END IF;
 IF b.upload_session_id IS NOT NULL THEN
  SELECT * INTO s FROM public.upload_sessions WHERE id=b.upload_session_id FOR UPDATE;
  IF s.user_id IS DISTINCT FROM auth.uid() OR s.status='cancelled' THEN RAISE EXCEPTION 'Session cancelled or unavailable' USING ERRCODE='22023'; END IF;
 END IF;
 SELECT * INTO b FROM public.processing_batches WHERE id=p_batch_id FOR UPDATE;
 IF b.status='cancelled' OR b.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'Batch cancelled' USING ERRCODE='22023'; END IF;
 -- The submitted ids get an explicit column name: a bare `unnest(...) id` alias
 -- lets the inner `i.id=id` resolve both sides to images.id, which is always
 -- true, so a photo from another batch or tenant passed the guard.
 IF cardinality(p_uploaded_ids)>100 OR cardinality(p_failed_ids)>100 OR EXISTS(
  SELECT 1 FROM unnest(p_uploaded_ids || p_failed_ids) AS submitted(image_id) WHERE NOT EXISTS(SELECT 1 FROM public.images i WHERE i.id=submitted.image_id AND i.batch_id=p_batch_id AND i.user_id=auth.uid() AND NOT i.is_cancelled)
 ) THEN RAISE EXCEPTION 'Invalid photo IDs' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_uploaded_ids) AS submitted(image_id) WHERE submitted.image_id=ANY(p_failed_ids)) THEN RAISE EXCEPTION 'Conflicting photo outcomes' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.images i WHERE i.id=ANY(p_uploaded_ids) AND NOT EXISTS(
  SELECT 1 FROM storage.objects o WHERE o.bucket_id='photos' AND o.name=i.file_path AND (o.metadata->>'size')::bigint=i.file_size_bytes
 )) THEN RAISE EXCEPTION 'Original photo transfer is incomplete' USING ERRCODE='22023'; END IF;
 -- Writes stay scoped to the caller's batch even though the guard above already checked it.
 UPDATE public.images SET detection_status=CASE WHEN upload_completed_at IS NULL THEN 'pending' ELSE detection_status END,upload_completed_at=coalesce(upload_completed_at,now()) WHERE id=ANY(p_uploaded_ids) AND batch_id=p_batch_id;
 UPDATE public.images SET detection_status='failed', error_message='Original photo upload failed' WHERE id=ANY(p_failed_ids) AND batch_id=p_batch_id AND upload_completed_at IS NULL;
 SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO ready FROM public.images WHERE batch_id=p_batch_id AND upload_completed_at IS NOT NULL AND NOT is_cancelled;
 UPDATE public.processing_batches SET uploaded_images=cardinality(ready), total_images=(SELECT count(*) FROM public.images WHERE batch_id=p_batch_id), status=CASE WHEN cardinality(ready)=0 THEN 'failed' ELSE 'processing' END WHERE id=p_batch_id;
 RETURN jsonb_build_object('image_ids',ready);
END $$;
REVOKE ALL ON FUNCTION public.finalize_upload_batch(uuid,uuid[],uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finalize_upload_batch(uuid,uuid[],uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.finish_upload_session(p_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE public.upload_sessions SET upload_finished_at=coalesce(upload_finished_at,now()) WHERE id=p_session_id AND user_id=auth.uid() AND status<>'cancelled';
 IF NOT FOUND THEN RAISE EXCEPTION 'Session unavailable' USING ERRCODE='22023'; END IF;
 UPDATE public.processing_batches SET status=status WHERE upload_session_id=p_session_id;
END $$;
REVOKE ALL ON FUNCTION public.finish_upload_session(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finish_upload_session(uuid) TO authenticated;

-- Worker claims have a bounded lease; interrupted attempts can be reclaimed.
CREATE OR REPLACE FUNCTION public.claim_photo_work(p_image_id uuid,p_kind text,p_claim_at timestamptz)
RETURNS SETOF public.images LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_kind='variants' THEN
  RETURN QUERY UPDATE public.images i SET variant_status='processing',variant_claimed_at=p_claim_at,variant_attempts=i.variant_attempts+1
   WHERE i.id=p_image_id AND NOT i.is_cancelled AND i.upload_completed_at IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.processing_batches b LEFT JOIN public.upload_sessions s ON s.id=b.upload_session_id WHERE b.id=i.batch_id AND (b.cancelled_at IS NOT NULL OR s.status='cancelled'))
   AND i.variant_attempts<3
   AND (i.variant_status IN ('pending','failed') OR (i.variant_status='processing' AND coalesce(i.variant_claimed_at,'epoch'::timestamptz)<now()-interval '10 minutes'))
   RETURNING i.*;
 ELSIF p_kind='analysis' THEN
  RETURN QUERY UPDATE public.images i SET detection_status='processing',analysis_claimed_at=p_claim_at,analysis_attempts=i.analysis_attempts+1
   WHERE i.id=p_image_id AND NOT i.is_cancelled AND i.upload_completed_at IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM public.processing_batches b LEFT JOIN public.upload_sessions s ON s.id=b.upload_session_id WHERE b.id=i.batch_id AND (b.cancelled_at IS NOT NULL OR s.status='cancelled'))
   AND i.analysis_attempts<3
   AND (i.detection_status IN ('pending','failed') OR (i.detection_status='processing' AND coalesce(i.analysis_claimed_at,'epoch'::timestamptz)<now()-interval '20 minutes'))
   RETURNING i.*;
 ELSE RAISE EXCEPTION 'Invalid work kind'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.claim_photo_work(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_photo_work(uuid,text,timestamptz) TO service_role;

-- Compatibility with workers still running the old increment RPC during rollout:
-- the image trigger already applies the transition, so a second increment is wrong.
CREATE OR REPLACE FUNCTION public.increment_batch_counters(batch_id uuid,increment_processed int DEFAULT 0,increment_successful int DEFAULT 0,increment_failed int DEFAULT 0)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN RETURN; END $$;

CREATE OR REPLACE FUNCTION public.reject_cancelled_session_batch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.upload_session_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.upload_session_id IS DISTINCT FROM OLD.upload_session_id) THEN
  PERFORM 1 FROM public.upload_sessions WHERE id=NEW.upload_session_id AND status='cancelled';
  IF FOUND THEN RAISE EXCEPTION 'Upload session cancelled'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reject_cancelled_session_batch BEFORE INSERT OR UPDATE OF upload_session_id ON public.processing_batches FOR EACH ROW EXECUTE FUNCTION public.reject_cancelled_session_batch();

CREATE OR REPLACE FUNCTION public.check_batch_completion()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.cancelled_at IS NOT NULL THEN NEW.status:='cancelled';
 ELSIF NEW.status IN ('processing','completed') THEN
  IF NEW.processed_images>=NEW.total_images THEN NEW.status:='completed'; NEW.completed_at:=now();
  ELSE NEW.status:='processing'; NEW.completed_at:=NULL; END IF;
 END IF;
 RETURN NEW;
END $$;

-- An SDK retry count resets when the scheduler creates a new run. Persist the
-- lifetime claim budget, and settle the last killed attempt after its lease.
CREATE OR REPLACE FUNCTION public.expire_photo_work_budgets()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE images i SET variant_status='failed', variant_error='Preview generation stopped after 3 interrupted attempts'
 WHERE i.variant_attempts>=3 AND NOT i.is_cancelled AND i.upload_completed_at IS NOT NULL
 AND (i.variant_status='pending' OR (i.variant_status='processing' AND coalesce(i.variant_claimed_at,'epoch')<now()-interval '10 minutes'))
 AND NOT EXISTS(SELECT 1 FROM processing_batches b LEFT JOIN upload_sessions s ON s.id=b.upload_session_id WHERE b.id=i.batch_id AND (b.cancelled_at IS NOT NULL OR s.status='cancelled'));
 UPDATE images i SET detection_status='failed', error_message='Photo analysis stopped after 3 interrupted attempts'
 WHERE i.analysis_attempts>=3 AND NOT i.is_cancelled AND i.upload_completed_at IS NOT NULL
 AND (i.detection_status='pending' OR (i.detection_status='processing' AND coalesce(i.analysis_claimed_at,'epoch')<now()-interval '20 minutes'))
 AND NOT EXISTS(SELECT 1 FROM processing_batches b LEFT JOIN upload_sessions s ON s.id=b.upload_session_id WHERE b.id=i.batch_id AND (b.cancelled_at IS NOT NULL OR s.status='cancelled'));
END $$;
REVOKE ALL ON FUNCTION public.expire_photo_work_budgets() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expire_photo_work_budgets() TO service_role;

CREATE OR REPLACE FUNCTION public.protect_photo_work_budgets()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF current_user='authenticated' AND (
  (TG_OP='INSERT' AND (NEW.analysis_attempts<>0 OR NEW.variant_attempts<>0)) OR
  (TG_OP='UPDATE' AND (NEW.analysis_attempts IS DISTINCT FROM OLD.analysis_attempts OR NEW.variant_attempts IS DISTINCT FROM OLD.variant_attempts))
 ) THEN RAISE EXCEPTION 'Worker attempt budgets are managed by processing jobs' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_photo_work_budgets BEFORE INSERT OR UPDATE OF analysis_attempts,variant_attempts ON images
 FOR EACH ROW EXECUTE FUNCTION public.protect_photo_work_budgets();

-- An explicit owner request may start a new bounded attempt budget. Scheduled
-- recovery never invokes this RPC; completed analysis/preview outputs survive.
CREATE OR REPLACE FUNCTION public.request_photo_retry(p_photo_id uuid)
RETURNS SETOF public.images LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 RETURN QUERY UPDATE images i SET
  analysis_attempts=CASE WHEN i.detection_status='failed' THEN 0 ELSE i.analysis_attempts END,
  variant_attempts=CASE WHEN i.variant_status='failed' THEN 0 ELSE i.variant_attempts END,
  error_message=CASE WHEN i.detection_status='failed' THEN NULL ELSE i.error_message END,
  variant_error=CASE WHEN i.variant_status='failed' THEN NULL ELSE i.variant_error END,
  analysis_claimed_at=CASE WHEN i.detection_status='failed' THEN NULL ELSE i.analysis_claimed_at END,
  variant_claimed_at=CASE WHEN i.variant_status='failed' THEN NULL ELSE i.variant_claimed_at END,
  detection_status=CASE WHEN i.detection_status='failed' THEN 'pending' ELSE i.detection_status END,
  variant_status=CASE WHEN i.variant_status='failed' THEN 'pending' ELSE i.variant_status END
 WHERE i.id=p_photo_id AND i.user_id=auth.uid() AND NOT i.is_cancelled AND i.upload_completed_at IS NOT NULL
 AND (i.detection_status='failed' OR i.variant_status='failed')
 AND EXISTS(SELECT 1 FROM processing_batches b LEFT JOIN upload_sessions s ON s.id=b.upload_session_id WHERE b.id=i.batch_id AND b.cancelled_at IS NULL AND coalesce(s.status,'')<>'cancelled')
 RETURNING i.*;
END $$;
REVOKE ALL ON FUNCTION public.request_photo_retry(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_photo_retry(uuid) TO authenticated;
