import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updatePhotosLocation } from '@/lib/services/photos'
import { isValidUUID } from '@/lib/utils/validation'

export async function PATCH(request: Request) {
  try {
    // Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { photoIds, locationId } = body

    if (!Array.isArray(photoIds) || photoIds.length === 0) {
      return NextResponse.json(
        { error: 'photoIds must be a non-empty array' },
        { status: 400 }
      )
    }

    if (photoIds.length > 500) {
      return NextResponse.json(
        { error: 'Maximum 500 photos per bulk operation' },
        { status: 400 }
      )
    }

    // Validate UUIDs
    const invalidIds = photoIds.filter((id: unknown) => !isValidUUID(id))
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: 'All photoIds must be valid UUIDs' },
        { status: 400 }
      )
    }

    if (locationId !== undefined && locationId !== null && !isValidUUID(locationId)) {
      return NextResponse.json(
        { error: 'locationId must be a valid UUID' },
        { status: 400 }
      )
    }

    const { data, error } = await updatePhotosLocation(
      user.id,
      photoIds,
      locationId ?? null
    )

    if (error) {
      console.error('Bulk location update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Bulk location update exception:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
