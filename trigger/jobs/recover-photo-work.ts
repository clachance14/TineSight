import { schedules } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { analyzePhoto } from './analyze-photo'
import { generateImageVariantsJob } from './generate-image-variants'

/** Durable fallback for lost HTTP/enqueue responses and workers killed while holding a lease. */
export const recoverPhotoWork = schedules.task({
  id: 'recover-photo-work',
  cron: '*/5 * * * *',
  run: async () => {
    const supabase = createAdminClient()
    const { error: budgetError } = await supabase.rpc('expire_photo_work_budgets')
    if (budgetError !== null) throw new Error(budgetError.message)
    const analysisCutoff = new Date(Date.now() - 20 * 60_000).toISOString()
    const variantCutoff = new Date(Date.now() - 10 * 60_000).toISOString()
    let cursor: string | null = null
    let recovered = 0
    while (true) {
      let query = supabase.from('images').select('id,batch_id,detection_status,variant_status,processing_batches!inner(cancelled_at)')
        .not('upload_completed_at', 'is', null).eq('is_cancelled', false)
        .is('processing_batches.cancelled_at', null)
        .or(`detection_status.eq.pending,and(detection_status.eq.processing,analysis_claimed_at.is.null),and(detection_status.eq.processing,analysis_claimed_at.lt.${analysisCutoff}),variant_status.eq.pending,and(variant_status.eq.processing,variant_claimed_at.lt.${variantCutoff}),and(variant_status.eq.processing,variant_claimed_at.is.null)`)
        .order('id').limit(100)
      if (cursor != null) query = query.gt('id', cursor)
      const { data: photos, error } = await query
      if (error) throw new Error(error.message)
      if (photos.length === 0) break
      // Analysis and preview recovery are independent, so each page is enqueued as
      // two batches, concurrently, the way batch-process.ts fans out fresh uploads.
      const window = Math.floor(Date.now() / 300000)
      const analysis = photos.flatMap(photo =>
        photo.batch_id !== null && photo.detection_status !== 'completed' && photo.detection_status !== 'failed'
          ? [{ payload: { imageId: photo.id, batchId: photo.batch_id }, options: { idempotencyKey: `recover-analysis:${photo.id}:${window}` } }]
          : [])
      const variants = photos.flatMap(photo =>
        photo.variant_status !== 'ready' && photo.variant_status !== 'failed'
          ? [{ payload: { imageId: photo.id }, options: { idempotencyKey: `recover-variants:${photo.id}:${window}` } }]
          : [])
      await Promise.all([
        analysis.length > 0 ? analyzePhoto.batchTrigger(analysis) : Promise.resolve(),
        variants.length > 0 ? generateImageVariantsJob.batchTrigger(variants) : Promise.resolve(),
      ])
      recovered += photos.length
      cursor = photos.at(-1)?.id ?? null
      if (photos.length < 100) break
    }
    return { recovered }
  },
})
