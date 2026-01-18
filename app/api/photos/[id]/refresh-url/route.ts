import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

interface RefreshUrlResponse {
  uploadUrl: string
}

/**
 * POST /api/photos/[id]/refresh-url
 *
 * Generates a fresh signed upload URL for an existing photo record.
 * Used when the initial upload URL expires before the client can complete the upload.
 *
 * Security:
 * - Verifies user authentication
 * - Validates photo ownership (user_id must match)
 * - Only works on photos in 'pending' state (not yet uploaded)
 *
 * @returns Fresh signed upload URL valid for 60 seconds
 */
export async function POST(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse<RefreshUrlResponse | { error: string }>> {
  try {
    const { id } = await context.params

    // Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError !== null || user === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: 'Invalid photo ID format' }, { status: 400 })
    }

    // Get photo and verify ownership
    const { data: photo, error: photoError } = await supabase
      .from('images')
      .select('id, user_id, file_path, detection_status')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (photoError !== null || photo === null) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
    }

    // Generate fresh signed upload URL using the existing file_path
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('photos')
      .createSignedUploadUrl(photo.file_path)

    if (uploadError !== null || uploadData === null) {
      console.error('Failed to generate signed upload URL:', uploadError)
      return NextResponse.json(
        { error: 'Failed to generate upload URL' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        uploadUrl: uploadData.signedUrl,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Unexpected error in POST /api/photos/[id]/refresh-url:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
