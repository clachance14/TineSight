import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPhotoIds, type PhotoFilters } from '@/lib/services/photos'

/**
 * POST /api/photos/ids
 * Returns all photo IDs matching the given filters (lightweight, for bulk selection)
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const filters: PhotoFilters | undefined = body.filters

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
