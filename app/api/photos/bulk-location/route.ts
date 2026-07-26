import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updatePhotosLocation } from '@/lib/services/photos'
import { parsePhotoIdBatch } from '@/lib/services/photos'
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

    // One shared guard across all three bulk routes (see parsePhotoIdBatch). The
    // former 500-id cap is gone: "Select All" now returns the complete set, and the
    // service layer chunks `.in()` instead of the route refusing the request.
    const parsed = parsePhotoIdBatch(photoIds)
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    if (locationId !== undefined && locationId !== null && !isValidUUID(locationId)) {
      return NextResponse.json(
        { error: 'locationId must be a valid UUID' },
        { status: 400 }
      )
    }

    const { data, error } = await updatePhotosLocation(
      user.id,
      parsed.ids,
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
