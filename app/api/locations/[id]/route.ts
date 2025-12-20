import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteLocation, getLocation } from '@/lib/services/locations'

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
