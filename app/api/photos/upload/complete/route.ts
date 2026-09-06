import { createHash } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tasks } from '@trigger.dev/sdk/v3'

/** Transfer completion is durable and repeatable; a DB reservation is not an uploaded photo. */
export async function POST(request: NextRequest): Promise<NextResponse<{ error: string; }> | NextResponse<{ status: string; message: string; }>> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json() as { batchId?: string; uploadedImageIds?: string[]; failedImageIds?: string[] }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if ((body.batchId == null) || !uuid.test(body.batchId) || !Array.isArray(body.uploadedImageIds) ||
      body.uploadedImageIds.length > 100 || body.uploadedImageIds.some(id => typeof id !== 'string' || !uuid.test(id)) ||
      (body.failedImageIds !== undefined && (!Array.isArray(body.failedImageIds) || body.failedImageIds.length > 100 || body.failedImageIds.some(id => typeof id !== 'string' || !uuid.test(id))))) {
      return NextResponse.json({ error: 'Invalid batch or photo IDs' }, { status: 400 })
    }
    // The transaction locks the parent session, verifies tenant, batch membership
    // AND storage.objects, records readiness, and refuses cancelled sessions.
    const { data, error } = await supabase.rpc('finalize_upload_batch', {
      p_batch_id: body.batchId,
      p_uploaded_ids: [...new Set(body.uploadedImageIds)],
      p_failed_ids: [...new Set(body.failedImageIds ?? [])],
    })
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === '22023' ? 400 : 409 })
    const imageIds = (data as unknown as { image_ids: string[] }).image_ids
    if (imageIds.length === 0) return NextResponse.json({ status: 'failed', message: 'No photos transferred' })
    // Same key on every HTTP retry, including loss of the success response.
    // The per-photo jobs are independently idempotent as well.
    await tasks.trigger('batch-process', { batchId: body.batchId, imageIds }, {
      idempotencyKey: `upload-batch:${body.batchId}:${createHash('sha256').update([...imageIds].sort().join(',')).digest('hex').slice(0, 16)}`,
      idempotencyKeyTTL: '30d',
    })
    return NextResponse.json({ status: 'processing', message: `Processing ${imageIds.length} photos...` })
  } catch (error) {
    console.error('Upload processing handoff failed:', error)
    return NextResponse.json({ error: 'Photos are saved, but processing could not start. Please retry.' }, { status: 500 })
  }
}
