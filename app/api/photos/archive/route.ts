import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { archivePhotos, parsePhotoIdBatch } from '@/lib/services/photos'

interface ArchiveRequest {
  batch_id?: string
  photo_ids?: string[]
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError !== null || user === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as ArchiveRequest

  let archivedCount = 0

  if (body.batch_id) {
    // Archive all empty photos in batch
    const { data, error } = await supabase
      .from('images')
      .update({ is_archived: true } as never)
      .eq('user_id', user.id)
      .eq('batch_id', body.batch_id)
      .eq('has_deer', false)
      .select('id')

    if (error) {
      return NextResponse.json({ error: 'Failed to archive photos' }, { status: 500 })
    }
    archivedCount = data?.length ?? 0
  } else if (body.photo_ids && body.photo_ids.length > 0) {
    // Archive specific photos. Same guard the other bulk routes apply, and chunked in
    // the service layer so a full "Select All" can't overflow the query string.
    const parsed = parsePhotoIdBatch(body.photo_ids)
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const { data, error } = await archivePhotos(user.id, parsed.ids)
    if (error !== null || data === null) {
      return NextResponse.json({ error: 'Failed to archive photos' }, { status: 500 })
    }
    archivedCount = data.count
  } else {
    return NextResponse.json({ error: 'batch_id or photo_ids required' }, { status: 400 })
  }

  return NextResponse.json({ archived_count: archivedCount })
}
