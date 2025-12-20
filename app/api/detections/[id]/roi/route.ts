import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getROI, upsertROI, deleteROI, setROIReference } from '@/lib/services/roi'

interface RouteContext {
  params: Promise<{ id: string }>
}

interface ROIRequestBody {
  roi_x: number
  roi_y: number
  roi_width: number
  roi_height: number
  is_reference?: boolean
}

interface ReferenceRequestBody {
  is_reference: boolean
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * GET /api/detections/[id]/roi
 * Get the ROI for a detection
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

    const { data, error } = await getROI(id)

    if (error) {
      console.error('Failed to get ROI:', error)
      return NextResponse.json(
        { error: 'Failed to get ROI' },
        { status: 500 }
      )
    }

    return NextResponse.json({ roi: data }, { status: 200 })
  } catch (error) {
    console.error('Unexpected error in GET /api/detections/[id]/roi:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/detections/[id]/roi
 * Create or update the ROI for a detection
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
    let body: ROIRequestBody
    try {
      body = (await request.json()) as ROIRequestBody
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    // Validate ROI coordinates (0-10000 normalized)
    const { roi_x, roi_y, roi_width, roi_height } = body
    if (
      typeof roi_x !== 'number' ||
      typeof roi_y !== 'number' ||
      typeof roi_width !== 'number' ||
      typeof roi_height !== 'number'
    ) {
      return NextResponse.json(
        { error: 'ROI coordinates must be numbers' },
        { status: 400 }
      )
    }

    if (
      roi_x < 0 || roi_x > 10000 ||
      roi_y < 0 || roi_y > 10000 ||
      roi_width < 1 || roi_width > 10000 ||
      roi_height < 1 || roi_height > 10000 ||
      roi_x + roi_width > 10000 ||
      roi_y + roi_height > 10000
    ) {
      return NextResponse.json(
        { error: 'ROI coordinates out of valid range (0-10000)' },
        { status: 400 }
      )
    }

    const { data, error } = await upsertROI(
      {
        detection_id: id,
        roi_x,
        roi_y,
        roi_width,
        roi_height,
        is_reference: body.is_reference ?? false,
      },
      user.id
    )

    if (error) {
      console.error('Failed to save ROI:', error)
      return NextResponse.json(
        { error: 'Failed to save ROI' },
        { status: 500 }
      )
    }

    return NextResponse.json({ roi: data }, { status: 200 })
  } catch (error) {
    console.error('Unexpected error in POST /api/detections/[id]/roi:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/detections/[id]/roi
 * Update the reference status of an ROI
 */
export async function PATCH(
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
    let body: ReferenceRequestBody
    try {
      body = (await request.json()) as ReferenceRequestBody
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    if (typeof body.is_reference !== 'boolean') {
      return NextResponse.json(
        { error: 'is_reference must be a boolean' },
        { status: 400 }
      )
    }

    const { data, error } = await setROIReference(id, body.is_reference)

    if (error) {
      console.error('Failed to update ROI reference status:', error)
      return NextResponse.json(
        { error: 'Failed to update ROI' },
        { status: 500 }
      )
    }

    if (data === null) {
      return NextResponse.json(
        { error: 'ROI not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ roi: data }, { status: 200 })
  } catch (error) {
    console.error('Unexpected error in PATCH /api/detections/[id]/roi:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/detections/[id]/roi
 * Delete the ROI for a detection
 */
export async function DELETE(
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

    const { error } = await deleteROI(id)

    if (error) {
      console.error('Failed to delete ROI:', error)
      return NextResponse.json(
        { error: 'Failed to delete ROI' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Unexpected error in DELETE /api/detections/[id]/roi:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
