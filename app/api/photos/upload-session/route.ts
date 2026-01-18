import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createUploadSession } from '@/lib/services/upload-sessions'

interface CreateUploadSessionRequest {
  totalFiles: number
  locationId?: string
}

interface CreateUploadSessionResponse {
  sessionId: string
  status: 'uploading'
  totalFiles: number
}

/**
 * POST /api/photos/upload-session
 * Creates a new upload session for bulk upload
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<CreateUploadSessionResponse | { error: string }>> {
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

    // Parse and validate request body
    let body: CreateUploadSessionRequest
    try {
      body = (await request.json()) as CreateUploadSessionRequest
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    // Validate totalFiles
    if (
      body.totalFiles === undefined ||
      typeof body.totalFiles !== 'number' ||
      !Number.isInteger(body.totalFiles)
    ) {
      return NextResponse.json(
        { error: 'totalFiles is required and must be an integer' },
        { status: 400 }
      )
    }

    if (body.totalFiles < 1 || body.totalFiles > 50000) {
      return NextResponse.json(
        { error: 'totalFiles must be between 1 and 50000' },
        { status: 400 }
      )
    }

    // Validate locationId if provided (must be valid UUID format)
    if (body.locationId !== undefined && body.locationId !== null) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(body.locationId)) {
        return NextResponse.json(
          { error: 'locationId must be a valid UUID' },
          { status: 400 }
        )
      }

      // Verify the location exists and belongs to the user
      const { data: location } = await supabase
        .from('locations')
        .select('id')
        .eq('id', body.locationId)
        .eq('user_id', user.id)
        .single()

      if (!location) {
        return NextResponse.json(
          { error: 'Location not found or access denied' },
          { status: 400 }
        )
      }
    }

    // Create the upload session
    const { data: session, error } = await createUploadSession(user.id, body.totalFiles)

    if (error !== null || session === null) {
      console.error('Failed to create upload session:', error)
      return NextResponse.json(
        { error: 'Failed to create upload session' },
        { status: 500 }
      )
    }

    // Return the response in API contract format
    const response: CreateUploadSessionResponse = {
      sessionId: session.id,
      status: 'uploading',
      totalFiles: body.totalFiles,
    }

    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    console.error('Unexpected error in POST /api/photos/upload-session:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
