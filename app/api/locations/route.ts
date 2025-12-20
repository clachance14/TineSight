import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getLocations,
  createLocation,
  type LocationWithPhotoCount,
  type CreateLocationData,
} from '@/lib/services/locations'

interface GetLocationsResponse {
  locations: LocationWithPhotoCount[]
  total: number
}

interface CreateLocationRequest {
  name: string
  lat: number
  lng: number
  directionCompass?: number
  directionNotes?: string
  notes?: string
  color?: string
}

/**
 * GET /api/locations
 * Lists user's locations with photo counts
 */
export async function GET(): Promise<NextResponse<GetLocationsResponse | { error: string }>> {
  try {
    // Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError !== null || user === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get locations
    const { data: locations, error } = await getLocations(user.id)

    if (error !== null) {
      console.error('Failed to fetch locations:', error)
      return NextResponse.json({ error: 'Failed to fetch locations' }, { status: 500 })
    }

    return NextResponse.json({
      locations: locations ?? [],
      total: locations?.length ?? 0,
    })
  } catch (error) {
    console.error('Error in GET /api/locations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/locations
 * Creates a new location
 */
export async function POST(
  request: Request
): Promise<NextResponse<{ location: LocationWithPhotoCount } | { error: string }>> {
  try {
    // Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError !== null || user === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = (await request.json()) as CreateLocationRequest

    // Validate required fields
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (typeof body.lat !== 'number' || body.lat < -90 || body.lat > 90) {
      return NextResponse.json({ error: 'Valid latitude is required (-90 to 90)' }, { status: 400 })
    }
    if (typeof body.lng !== 'number' || body.lng < -180 || body.lng > 180) {
      return NextResponse.json({ error: 'Valid longitude is required (-180 to 180)' }, { status: 400 })
    }

    // Create location - only include optional fields if they have values
    const locationData: CreateLocationData = {
      name: body.name.trim(),
      lat: body.lat,
      lng: body.lng,
      ...(body.directionCompass !== undefined && { directionCompass: body.directionCompass }),
      ...(body.directionNotes !== undefined && { directionNotes: body.directionNotes }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.color !== undefined && { color: body.color }),
    }

    const { data: location, error } = await createLocation(user.id, locationData)

    if (error !== null) {
      // Check for unique constraint violation
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        return NextResponse.json(
          { error: 'A location with this name already exists' },
          { status: 409 }
        )
      }
      console.error('Failed to create location:', error)
      return NextResponse.json({ error: 'Failed to create location' }, { status: 500 })
    }

    if (location === null) {
      return NextResponse.json({ error: 'Failed to create location' }, { status: 500 })
    }

    // Return with photo_count of 0 for new location
    return NextResponse.json({
      location: { ...location, photo_count: 0 },
    })
  } catch (error) {
    console.error('Error in POST /api/locations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
