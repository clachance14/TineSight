import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parsePhotoFilters } from '@/lib/photos/filters'
import { getPhotoIds } from '@/lib/services/photos'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error !== null || user === null) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const filters = parsePhotoFilters(request.nextUrl.searchParams)
    delete filters.triageView
    const ids = await getPhotoIds(user.id, filters)
    if (ids.error !== null || ids.data === null) throw new Error('Could not load triage counts')
    const { data, error: countError } = await supabase.rpc('get_photo_triage_counts', { p_photo_ids: ids.data })
    if (countError !== null) throw new Error('Could not load triage counts')
    return NextResponse.json({ counts: Object.fromEntries((data ?? []).map(row => [row.tier, Number(row.photo_count)])) })
  } catch (failure) {
    return NextResponse.json({ error: failure instanceof Error ? failure.message : 'Could not load triage counts' }, { status: 500 })
  }
}
