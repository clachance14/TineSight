import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPhotoIds, type PhotoFilters } from '@/lib/services/photos'
import { parsePhotoFilters, photoFilterParams } from '@/lib/photos/filters'

/**
 * POST /api/photos/ids
 * Returns all photo IDs matching the given filters (lightweight, for bulk selection)
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const input: unknown = await request.json().catch(() => null)
    if (input === null || typeof input !== 'object' || Array.isArray(input)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const body = input as { filters?: PhotoFilters }
    let filters: PhotoFilters
    try {
      if (body.filters !== undefined && (typeof body.filters !== 'object' || body.filters === null || Array.isArray(body.filters))) throw new Error('Invalid filters')
      filters = parsePhotoFilters(photoFilterParams(body.filters))
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid filters' }, { status: 400 })
    }

    const { data: photoIds, error, count } = await getPhotoIds(user.id, filters)

    if (error) {
      console.error('Error fetching photo IDs:', error)
      return NextResponse.json(
        { error: 'Failed to fetch photo IDs' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      photoIds: photoIds ?? [],
      count: count
    })
  } catch (err) {
    console.error('Error in /api/photos/ids:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
