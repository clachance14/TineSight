import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parsePhotoIdBatch, setPhotoReviewStatus } from '@/lib/services/photos'

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error !== null || user === null) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const input: unknown = await request.json().catch(() => null)
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return NextResponse.json({ error: 'Invalid review request' }, { status: 400 })
  const body = input as Record<string, unknown>
  const status = body['review_status']
  if (status !== 'unreviewed' && status !== 'keep' && status !== 'review_later') return NextResponse.json({ error: 'Invalid review status' }, { status: 400 })
  const parsed = parsePhotoIdBatch(body['photo_ids'])
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { data, error: updateError } = await setPhotoReviewStatus(user.id, parsed.ids, status)
  if (updateError !== null || data === null) return NextResponse.json({ error: 'Could not update photo review status' }, { status: 500 })
  return NextResponse.json({ updated_count: data.count })
}
