import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createFeedback, getFeedbackForDetection, type FeedbackType } from '@/lib/services/quality'

interface RouteContext {
  params: Promise<{ id: string }>
}

interface FeedbackRequestBody {
  feedback_type: FeedbackType
  notes?: string | null
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const VALID_FEEDBACK_TYPES: FeedbackType[] = [
  'distant',
  'partial_view',
  'no_antlers',
  'obstructed',
  'wrong_angle',
  'blurry',
  'other',
]

/**
 * GET /api/detections/[id]/feedback
 * Get all feedback for a detection
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

    // Validate detection ID
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: 'Invalid detection ID format' },
        { status: 400 }
      )
    }

    const { data, error } = await getFeedbackForDetection(id)

    if (error) {
      console.error('Failed to get feedback:', error)
      return NextResponse.json(
        { error: 'Failed to get feedback' },
        { status: 500 }
      )
    }

    return NextResponse.json({ feedback: data ?? [] }, { status: 200 })
  } catch (error) {
    console.error('Unexpected error in GET /api/detections/[id]/feedback:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/detections/[id]/feedback
 * Submit quality feedback for a detection
 */
export async function POST(
  request: NextRequest,
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

    // Validate detection ID
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { error: 'Invalid detection ID format' },
        { status: 400 }
      )
    }

    // Parse request body
    let body: FeedbackRequestBody
    try {
      body = (await request.json()) as FeedbackRequestBody
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    // Validate feedback type
    if (!VALID_FEEDBACK_TYPES.includes(body.feedback_type)) {
      return NextResponse.json(
        { error: `Invalid feedback_type. Must be one of: ${VALID_FEEDBACK_TYPES.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate notes if feedback_type is 'other'
    if (body.feedback_type === 'other' && (!body.notes || body.notes.trim() === '')) {
      return NextResponse.json(
        { error: 'Notes are required when feedback_type is "other"' },
        { status: 400 }
      )
    }

    const { data, error } = await createFeedback(
      {
        detection_id: id,
        feedback_type: body.feedback_type,
        notes: body.notes ?? null,
      },
      user.id
    )

    if (error) {
      console.error('Failed to create feedback:', error)
      return NextResponse.json(
        { error: 'Failed to submit feedback' },
        { status: 500 }
      )
    }

    return NextResponse.json({ feedback: data }, { status: 201 })
  } catch (error) {
    console.error('Unexpected error in POST /api/detections/[id]/feedback:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
