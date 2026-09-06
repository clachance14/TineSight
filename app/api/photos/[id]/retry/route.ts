import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { tasks } from '@trigger.dev/sdk/v3'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
interface RetryPhoto { id: string; batch_id: string; detection_status: string; variant_status: string }

/** Explicit owner retry starts a fresh bounded budget; recovery never resets it. */
export async function POST(request: NextRequest, context: {params: Promise<{id: string}>}): Promise<NextResponse> {
  const { id } = await context.params
  if (!uuid.test(id)) return NextResponse.json({ error: 'Invalid photo ID' }, { status: 400 })
  const supabase = await createClient()
  const { data: {user}, error: authError } = await supabase.auth.getUser()
  if (authError !== null || user === null) return NextResponse.json({error: 'Unauthorized'}, {status: 401})
  const body = await request.json().catch(() => ({})) as {batchId?: string} | null
  const batchId = body?.batchId
  if (batchId !== undefined && !uuid.test(batchId)) return NextResponse.json({error:'Invalid batch ID'}, {status:400})
  const ids: string[] = []
  if (batchId !== undefined) {
    for (let offset = 0; ; offset += 500) {
      const {data, error} = await supabase.from('images').select('id').eq('user_id',user.id).eq('batch_id',batchId)
        .or('detection_status.eq.failed,variant_status.eq.failed').order('id').range(offset,offset+499)
      if (error !== null) return NextResponse.json({error:'Failed to read photos'}, {status:500})
      ids.push(...data.map(photo => photo.id))
      if (data.length < 500) break
    }
  } else ids.push(id)
  let retriedCount = 0
  try {
    for (const photoId of ids) {
      const {data,error} = await supabase.rpc('request_photo_retry', { p_photo_id: photoId })
      if (error !== null) throw new Error('Failed to restart photo processing')
      const photos = data as unknown as RetryPhoto[]
      for (const photo of photos) {
        retriedCount++
        const retryKey = crypto.randomUUID()
        if (photo.detection_status === 'pending') await tasks.trigger('analyze-photo',{imageId:photo.id,batchId:photo.batch_id},{idempotencyKey:`manual-analysis:${photo.id}:${retryKey}`})
        if (photo.variant_status === 'pending') await tasks.trigger('generate-image-variants',{imageId:photo.id},{idempotencyKey:`manual-preview:${photo.id}:${retryKey}`})
      }
    }
  } catch {
    // Persisted pending rows remain recoverable if the enqueue response is lost.
    return NextResponse.json({error:'Processing restart could not be acknowledged. Recovery will retry saved photos.'},{status:503})
  }
  if (retriedCount === 0) return NextResponse.json({error:'No eligible failed photos found'},{status:404})
  return NextResponse.json({success:true,retriedCount})
}
