import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cancelSession } from '@/lib/services/upload-sessions'
import { cleanupCancelledImages } from '@/trigger/jobs/cleanup-cancelled-images'

interface RouteContext {
  params: Promise<{ id: string }>
}

interface CancelRequestBody {
  deleteScope: 'pending' | 'all'
}

interface CancelResponseData {
  success: boolean
  session_id: string
  batches_cancelled: number
  photos_marked_for_deletion: number
  photos_retained: number
  cleanup_job_triggered: boolean
}

/**
 * POST /api/upload-sessions/[id]/cancel
 * Cancels an upload session and marks images for deletion
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<CancelResponseData | { error: string }>> {
  try {
    const { id: sessionId } = await context.params

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
    let body: CancelRequestBody
    try {
      body = (await request.json()) as CancelRequestBody
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    if (
      body.deleteScope === undefined ||
      !['pending', 'all'].includes(body.deleteScope)
    ) {
      return NextResponse.json(
        { error: 'Invalid deleteScope. Must be "pending" or "all"' },
        { status: 400 }
      )
    }

    // Call cancel service
    const { data, error } = await cancelSession(
      user.id,
      sessionId,
      body.deleteScope
    )

    if (error !== null) {
      // Handle specific error cases
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Session not found' },
          { status: 404 }
        )
      }
      if (error.message.includes('access denied')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (
        error.message.includes('already completed') ||
        error.message.includes('already cancelled')
      ) {
        return NextResponse.json({ error: error.message }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (data === null) {
      return NextResponse.json(
        { error: 'Failed to cancel session' },
        { status: 500 }
      )
    }

    // Trigger cleanup job (fire and forget)
    let cleanupJobTriggered = false
    try {
      await cleanupCancelledImages.trigger({
        userId: user.id,
        sessionId,
      })
      cleanupJobTriggered = true
    } catch (triggerError) {
      console.error('Failed to trigger cleanup job:', triggerError)
      // Don't fail the request - cancellation succeeded
    }

    // Build response
    const response: CancelResponseData = {
      success: true,
      session_id: data.session_id,
      batches_cancelled: data.batches_cancelled,
      photos_marked_for_deletion: data.photos_marked_for_deletion,
      photos_retained: data.photos_retained,
      cleanup_job_triggered: cleanupJobTriggered,
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error('Unexpected error in POST /api/upload-sessions/[id]/cancel:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
