import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { archivePhotos, parsePhotoIdBatch } from '@/lib/services/photos'

interface ArchiveRequest {
  batch_id?: string
  photo_ids?: string[]
  is_archived?: boolean
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError !== null || user === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const input: unknown = await request.json().catch(() => null)
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return NextResponse.json({ error: 'Invalid archive request' }, { status: 400 })
  const body = input as ArchiveRequest
  if (body.batch_id !== undefined && (typeof body.batch_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.batch_id))) return NextResponse.json({ error: 'Invalid batch_id' }, { status: 400 })
  if (body.batch_id !== undefined && body.is_archived === false) return NextResponse.json({ error: 'Restore requires photo_ids' }, { status: 400 })

  if (body.is_archived !== undefined && typeof body.is_archived !== 'boolean') return NextResponse.json({ error: 'is_archived must be boolean' }, { status: 400 })

  let archivedCount = 0

  if (body.batch_id) {
    // Archive the batch's Empty group. "Empty" has exactly one definition, the
    // trigger-maintained triage_tier (migration 059), which is what the gallery
    // shows and counts; re-deriving it here from the flag columns drifted from it
    // (it ignored live non-deer detections).
    const { data, error } = await supabase
      .from('images')
      .update({ is_archived: true } as never)
      .eq('user_id', user.id)
      .eq('batch_id', body.batch_id)
      .eq('triage_tier', 'empty')
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

    const { data, error } = await archivePhotos(user.id, parsed.ids, body.is_archived ?? true)
    if (error !== null || data === null) {
      return NextResponse.json({ error: 'Failed to archive photos' }, { status: 500 })
    }
    archivedCount = data.count
  } else {
    return NextResponse.json({ error: 'batch_id or photo_ids required' }, { status: 400 })
  }

  return NextResponse.json({ archived_count: archivedCount })
}
