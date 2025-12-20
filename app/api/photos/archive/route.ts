import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
    // Archive specific photos
    const { data, error } = await supabase
      .from('images')
      .update({ is_archived: true } as never)
      .eq('user_id', user.id)
      .in('id', body.photo_ids)
      .select('id')

    if (error) {
      return NextResponse.json({ error: 'Failed to archive photos' }, { status: 500 })
    }
    archivedCount = data?.length ?? 0
  } else {
    return NextResponse.json({ error: 'batch_id or photo_ids required' }, { status: 400 })
  }

  return NextResponse.json({ archived_count: archivedCount })
}
