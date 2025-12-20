import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCameras, type CameraWithPhotoCount } from '@/lib/services/cameras'

interface GetCamerasResponse {
  cameras: CameraWithPhotoCount[]
  total: number
}

/**
 * GET /api/cameras
 * Lists user's cameras with photo counts
 */
export async function GET(): Promise<NextResponse<GetCamerasResponse | { error: string }>> {
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

    // Get cameras
    const { data: cameras, error } = await getCameras(user.id)

    if (error !== null) {
      console.error('Failed to fetch cameras:', error)
      return NextResponse.json({ error: 'Failed to fetch cameras' }, { status: 500 })
    }

    return NextResponse.json({
      cameras: cameras ?? [],
      total: cameras?.length ?? 0,
    })
  } catch (error) {
    console.error('Error in GET /api/cameras:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
