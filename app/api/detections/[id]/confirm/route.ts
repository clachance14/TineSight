import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

interface ConfirmRequestBody {
  deerId: string
}

interface ConfirmResponseData {
  detection: {
    id: string
    image_id: string
    deer_id: string | null
    bbox_x: number | null
    bbox_y: number | null
    bbox_width: number | null
    bbox_height: number | null
    confidence: number | null
    class: string | null
    created_at: string
  }
}

/**
 * POST /api/detections/[id]/confirm
 * Confirms a match between a detection and a deer
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<ConfirmResponseData | { error: string }>> {
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

    // Validate detection ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid detection ID format' },
        { status: 400 }
      )
    }

    // Parse request body
    let body: ConfirmRequestBody
    try {
      body = (await request.json()) as ConfirmRequestBody
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    // Validate deer ID format (UUID)
    if (body.deerId === undefined || body.deerId === '' || !uuidRegex.test(body.deerId)) {
      return NextResponse.json(
        { error: 'Invalid deer ID format' },
        { status: 400 }
      )
    }

    // Link detection directly to deer (bypass match_candidates for direct confirmation)
    const { error: updateError } = await supabase
      .from('detections')
      .update({ deer_id: body.deerId } as never)
      .eq('id', id)

    if (updateError !== null) {
      console.error('Failed to confirm match:', updateError)
      return NextResponse.json(
        { error: 'Failed to confirm match' },
        { status: 500 }
      )
    }

    // Reject any pending match candidates for this detection
    await supabase
      .from('match_candidates')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() } as never)
      .eq('detection_id', id)

    // Fetch the updated detection
    const { data: detection, error: fetchError } = await supabase
      .from('detections')
      .select('id, image_id, deer_id, bbox_x, bbox_y, bbox_width, bbox_height, confidence, class, created_at')
      .eq('id', id)
      .single()

    if (fetchError !== null || detection === null) {
      return NextResponse.json(
        { error: 'Detection not found' },
        { status: 404 }
      )
    }

    // Build response
    const response: ConfirmResponseData = {
      detection: {
        id: detection.id,
        image_id: detection.image_id,
        deer_id: detection.deer_id,
        bbox_x: detection.bbox_x,
        bbox_y: detection.bbox_y,
        bbox_width: detection.bbox_width,
        bbox_height: detection.bbox_height,
        confidence: detection.confidence,
        class: detection.class,
        created_at: detection.created_at,
      },
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error('Unexpected error in POST /api/detections/[id]/confirm:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
