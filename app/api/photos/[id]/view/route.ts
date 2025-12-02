import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPhoto, getSignedViewUrl } from '@/lib/services/photos'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/photos/[id]/view
 * Redirects to signed URL for viewing the photo
 * Used by img src to display photos without exposing storage URLs
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
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

    // Get photo to verify ownership and get file path
    const { data: photo, error: photoError } = await getPhoto(user.id, id)

    if (photoError !== null || photo === null) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
    }

    // Get signed URL for viewing
    const { data: signedUrl, error: urlError } = await getSignedViewUrl(photo.file_path)

    if (urlError !== null || signedUrl === null) {
      console.error('Failed to get signed URL:', urlError)
      return NextResponse.json({ error: 'Failed to generate view URL' }, { status: 500 })
    }

    // Redirect to signed URL
    return NextResponse.redirect(signedUrl)
  } catch (error) {
    console.error('Unexpected error in GET /api/photos/[id]/view:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
