import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getROI } from '@/lib/services/roi'
import { tasks } from '@trigger.dev/sdk/v3'
import type { regenerateEmbeddingTask } from '@/trigger/jobs/regenerate-embedding'

interface RouteContext {
  params: Promise<{ id: string }>
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/detections/[id]/regenerate-embedding
 * Trigger regeneration of the embedding from the ROI region
 */
export async function POST(
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

    // Check if ROI exists for this detection
    const { data: roi, error: roiError } = await getROI(id)

    if (roiError) {
      console.error('Failed to check ROI:', roiError)
      return NextResponse.json(
        { error: 'Failed to check ROI' },
        { status: 500 }
      )
    }

    if (!roi) {
      return NextResponse.json(
        { error: 'No ROI defined for this detection. Please draw an ROI first.' },
        { status: 400 }
      )
    }

    // Get detection to find image_id
    const { data: detection, error: detectionError } = await supabase
      .from('detections')
      .select('image_id')
      .eq('id', id)
      .single()

    if (detectionError || !detection) {
      return NextResponse.json(
        { error: 'Detection not found' },
        { status: 404 }
      )
    }

    // Trigger the regenerate-embedding job
    try {
      const detectionData = detection as { image_id: string }
      const handle = await tasks.trigger<typeof regenerateEmbeddingTask>(
        'regenerate-embedding',
        {
          detectionId: id,
          imageId: detectionData.image_id,
          roi: {
            x: roi.roi_x,
            y: roi.roi_y,
            width: roi.roi_width,
            height: roi.roi_height,
          },
        }
      )

      return NextResponse.json(
        {
          message: 'Embedding regeneration started',
          taskId: handle.id,
        },
        { status: 202 }
      )
    } catch (triggerError) {
      console.error('Failed to trigger regenerate-embedding job:', triggerError)
      return NextResponse.json(
        { error: 'Failed to start embedding regeneration' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Unexpected error in POST /api/detections/[id]/regenerate-embedding:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
