import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getUploadSession,
  updateUploadSession,
  type UploadSession,
  type UploadSessionStatus,
} from '@/lib/services/upload-sessions'

interface RouteContext {
  params: Promise<{ sessionId: string }>
}

// API response format matching the OpenAPI spec
interface UploadSessionResponse {
  id: string
  userId: string
  totalImages: number
  uploadedCount: number
  processedCount: number
  failedCount: number
  skippedCount: number
  status: UploadSessionStatus
  createdAt: string
  completedAt: string | null
}

interface UpdateSessionRequest {
  uploadedCount?: number
  failedCount?: number
  skippedCount?: number
  status?: UploadSessionStatus
}

const VALID_STATUSES: UploadSessionStatus[] = [
  'uploading',
  'processing',
  'completed',
  'partial_error',
  'failed',
]

/**
 * Transform database session to API response format (camelCase)
 */
function toApiResponse(session: UploadSession): UploadSessionResponse {
  return {
    id: session.id,
    userId: session.user_id,
    totalImages: session.total_images,
    uploadedCount: session.uploaded_count,
    processedCount: session.processed_count,
    failedCount: session.failed_count,
    skippedCount: session.skipped_count,
    status: session.status,
    createdAt: session.created_at,
    completedAt: session.completed_at,
  }
}

/**
 * GET /api/photos/upload-session/{sessionId}
 * Returns current session status and progress
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse<UploadSessionResponse | { error: string }>> {
  try {
    const { sessionId } = await context.params

    // Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError !== null || user === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate session ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(sessionId)) {
      return NextResponse.json(
        { error: 'Invalid session ID format' },
        { status: 400 }
      )
    }

    // Get the session
    const { data: session, error } = await getUploadSession(sessionId)

    if (error !== null || session === null) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Verify session belongs to the requesting user
    if (session.user_id !== user.id) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    return NextResponse.json(toApiResponse(session), { status: 200 })
  } catch (error) {
    console.error('Unexpected error in GET /api/photos/upload-session/[sessionId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/photos/upload-session/{sessionId}
 * Updates session progress counters and status
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<UploadSessionResponse | { error: string }>> {
  try {
    const { sessionId } = await context.params

    // Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError !== null || user === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate session ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(sessionId)) {
      return NextResponse.json(
        { error: 'Invalid session ID format' },
        { status: 400 }
      )
    }

    // Parse and validate request body
    let body: UpdateSessionRequest
    try {
      body = (await request.json()) as UpdateSessionRequest
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    // Validate request fields
    const validationErrors: string[] = []

    if (body.uploadedCount !== undefined) {
      if (typeof body.uploadedCount !== 'number' || !Number.isInteger(body.uploadedCount) || body.uploadedCount < 0) {
        validationErrors.push('uploadedCount must be a non-negative integer')
      }
    }

    if (body.failedCount !== undefined) {
      if (typeof body.failedCount !== 'number' || !Number.isInteger(body.failedCount) || body.failedCount < 0) {
        validationErrors.push('failedCount must be a non-negative integer')
      }
    }

    if (body.skippedCount !== undefined) {
      if (typeof body.skippedCount !== 'number' || !Number.isInteger(body.skippedCount) || body.skippedCount < 0) {
        validationErrors.push('skippedCount must be a non-negative integer')
      }
    }

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        validationErrors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`)
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: validationErrors.join('; ') },
        { status: 400 }
      )
    }

    // Check if there are any fields to update
    if (
      body.uploadedCount === undefined &&
      body.failedCount === undefined &&
      body.skippedCount === undefined &&
      body.status === undefined
    ) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    // First, verify the session exists and belongs to the user
    const { data: existingSession, error: fetchError } = await getUploadSession(sessionId)

    if (fetchError !== null || existingSession === null) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (existingSession.user_id !== user.id) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Build update object with only defined values
    const updates: {
      uploadedCount?: number
      failedCount?: number
      skippedCount?: number
      status?: UploadSessionStatus
    } = {}

    if (body.uploadedCount !== undefined) {
      updates.uploadedCount = body.uploadedCount
    }
    if (body.failedCount !== undefined) {
      updates.failedCount = body.failedCount
    }
    if (body.skippedCount !== undefined) {
      updates.skippedCount = body.skippedCount
    }
    if (body.status !== undefined) {
      updates.status = body.status
    }

    // Update the session
    const { data: updatedSession, error } = await updateUploadSession(sessionId, updates)

    if (error !== null || updatedSession === null) {
      console.error('Failed to update upload session:', error)
      return NextResponse.json(
        { error: 'Failed to update session' },
        { status: 500 }
      )
    }

    return NextResponse.json(toApiResponse(updatedSession), { status: 200 })
  } catch (error) {
    console.error('Unexpected error in PATCH /api/photos/upload-session/[sessionId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
