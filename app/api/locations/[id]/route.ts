import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteLocation, getLocation, updateLocation, type Location } from '@/lib/services/locations'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * DELETE /api/locations/[id]
 * Deletes a location by ID
 */
export async function DELETE(
  _request: Request,
  { params }: RouteParams
): Promise<NextResponse<{ success: boolean } | { error: string }>> {
  try {
    const { id } = await params

    // Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError !== null || user === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify location exists and belongs to user
    const { data: location, error: fetchError } = await getLocation(id)

    if (fetchError !== null || location === null) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    if (location.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete location
    const { error } = await deleteLocation(id)

    if (error !== null) {
      console.error('Failed to delete location:', error)
      return NextResponse.json({ error: 'Failed to delete location' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/locations/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

interface UpdateLocationRequest {
  name?: string
  lat?: number
  lng?: number
  directionCompass?: number | null
  directionNotes?: string | null
  notes?: string | null
  color?: string | null
}

/**
 * PUT /api/locations/[id]
 * Updates a location by ID
 */
export async function PUT(
  request: Request,
  { params }: RouteParams
): Promise<NextResponse<{ location: Location } | { error: string }>> {
  try {
    const { id } = await params

    // Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError !== null || user === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify location exists and belongs to user
    const { data: existingLocation, error: fetchError } = await getLocation(id)

    if (fetchError !== null || existingLocation === null) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    if (existingLocation.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Parse request body
    const body = (await request.json()) as UpdateLocationRequest

    // Validate optional fields if provided
    if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim().length === 0)) {
      return NextResponse.json({ error: 'Name must be a non-empty string' }, { status: 400 })
    }
    if (body.lat !== undefined && (typeof body.lat !== 'number' || body.lat < -90 || body.lat > 90)) {
      return NextResponse.json({ error: 'Latitude must be between -90 and 90' }, { status: 400 })
    }
    if (body.lng !== undefined && (typeof body.lng !== 'number' || body.lng < -180 || body.lng > 180)) {
      return NextResponse.json({ error: 'Longitude must be between -180 and 180' }, { status: 400 })
    }
    if (body.directionCompass !== undefined && body.directionCompass !== null) {
      if (typeof body.directionCompass !== 'number' || body.directionCompass < 0 || body.directionCompass > 360) {
        return NextResponse.json({ error: 'Direction must be between 0 and 360' }, { status: 400 })
      }
    }
    if (body.color !== undefined && body.color !== null) {
      if (typeof body.color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(body.color)) {
        return NextResponse.json({ error: 'Color must be a valid hex color (e.g., #3B82F6)' }, { status: 400 })
      }
    }

    // Build update data
    const updates: Record<string, unknown> = {}
    if (body.name !== undefined) updates['name'] = body.name.trim()
    if (body.lat !== undefined) updates['lat'] = body.lat
    if (body.lng !== undefined) updates['lng'] = body.lng
    if (body.directionCompass !== undefined) updates['directionCompass'] = body.directionCompass
    if (body.directionNotes !== undefined) updates['directionNotes'] = body.directionNotes
    if (body.notes !== undefined) updates['notes'] = body.notes
    if (body.color !== undefined) updates['color'] = body.color

    // Update location
    const { data: location, error } = await updateLocation(id, updates)

    if (error !== null) {
      // Check for unique constraint violation
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        return NextResponse.json(
          { error: 'A location with this name already exists' },
          { status: 409 }
        )
      }
      console.error('Failed to update location:', error)
      return NextResponse.json({ error: 'Failed to update location' }, { status: 500 })
    }

    if (location === null) {
      return NextResponse.json({ error: 'Failed to update location' }, { status: 500 })
    }

    return NextResponse.json({ location })
  } catch (error) {
    console.error('Error in PUT /api/locations/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
