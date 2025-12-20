import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPhoto, updatePhoto } from '@/lib/services/photos'
import { tasks } from '@trigger.dev/sdk/v3'

interface RouteContext {
  params: Promise<{ id: string }>
}

interface RetryRequestBody {
  batchId?: string
}

/**
 * POST /api/photos/[id]/retry
 *
 * Retries processing for a failed photo or all failed photos in a batch.
 *
 * Single Photo Retry:
 * - Validates photo is in 'failed' state
 * - Resets retry_count to 0
 * - Sets detection_status back to 'pending'
 * - Re-triggers the batch-process job for this photo
 *
 * Batch Retry (when batchId is provided):
 * - Finds all failed photos in the batch
 * - Resets all to pending state
 * - Re-triggers batch-process job for all failed photos
 *
 * @returns Updated photo status or batch retry status
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<{ success: boolean; photo?: unknown; retriedCount?: number } | { error: string }>> {
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

    // Parse request body for optional batchId
    let batchId: string | undefined
    try {
      const body = await request.json() as RetryRequestBody
      batchId = body.batchId
    } catch {
      // No body or invalid JSON - continue with single photo retry
    }

    // Handle batch retry if batchId is provided
    if (batchId !== undefined) {
      return await handleBatchRetry(supabase, user.id, batchId)
    }

    // Get photo and verify ownership
    const { data: photo, error: photoError } = await getPhoto(user.id, id)

    if (photoError !== null) {
      console.error('Failed to get photo:', photoError)
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
    }

    if (photo === null) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
    }

    // Validate photo is in failed state
    if (photo.detection_status !== 'failed') {
      return NextResponse.json(
        { error: `Cannot retry photo with status: ${photo.detection_status}. Only 'failed' photos can be retried.` },
        { status: 400 }
      )
    }

    // Check retry count limit (max 3 retries)
    if (photo.retry_count >= 3) {
      return NextResponse.json(
        { error: 'Maximum retry attempts (3) exceeded. Please contact support if the issue persists.' },
        { status: 400 }
      )
    }

    // Reset photo to pending state
    const { data: updatedPhoto, error: updateError } = await updatePhoto(user.id, id, {
      detection_status: 'pending',
      // Note: retry_count is incremented by the background job, not here
    })

    if (updateError !== null) {
      console.error('Failed to update photo status:', updateError)
      return NextResponse.json(
        { error: 'Failed to update photo status' },
        { status: 500 }
      )
    }

    // Re-trigger batch-process job for this single photo
    try {
      // Note: We reuse the batch-process job but with a single photo
      await tasks.trigger('batch-process', {
        batchId: photo.batch_id ?? 'retry', // Use existing batch_id or 'retry' marker
        imageIds: [id],
      })

      console.log('Retry job triggered successfully', { photoId: id })
    } catch (triggerError) {
      console.error('Failed to trigger retry job:', triggerError)
      // Roll back the status change
      await updatePhoto(user.id, id, {
        detection_status: 'failed',
      })

      return NextResponse.json(
        { error: 'Failed to trigger retry job. Please try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        photo: {
          id: updatedPhoto?.id,
          detection_status: updatedPhoto?.detection_status,
          retry_count: updatedPhoto?.retry_count,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Unexpected error in POST /api/photos/[id]/retry:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Handle batch retry for all failed photos in a batch
 */
async function handleBatchRetry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  batchId: string
): Promise<NextResponse<{ success: boolean; retriedCount: number } | { error: string }>> {
  // Find all failed photos in the batch
  const { data: failedPhotos, error: fetchError } = await supabase
    .from('images')
    .select('id, retry_count')
    .eq('user_id', userId)
    .eq('batch_id', batchId)
    .eq('detection_status', 'failed')

  if (fetchError !== null) {
    console.error('Failed to fetch failed photos:', fetchError)
    return NextResponse.json(
      { error: 'Failed to fetch failed photos' },
      { status: 500 }
    )
  }

  if (failedPhotos === null || failedPhotos.length === 0) {
    return NextResponse.json(
      { error: 'No failed photos found in this batch' },
      { status: 404 }
    )
  }

  // Type assertion for failedPhotos
  const typedFailedPhotos = failedPhotos as Array<{ id: string; retry_count: number }>

  // Filter photos that haven't exceeded retry limit
  const retryablePhotos = typedFailedPhotos.filter((p) => p.retry_count < 3)

  if (retryablePhotos.length === 0) {
    return NextResponse.json(
      { error: 'All failed photos have exceeded maximum retry attempts (3)' },
      { status: 400 }
    )
  }

  // Reset all retryable photos to pending
  const photoIds = retryablePhotos.map((p) => p.id)
  const { error: updateError } = await supabase
    .from('images')
    .update({ detection_status: 'pending' } as never)
    .in('id', photoIds)
    .eq('user_id', userId)

  if (updateError !== null) {
    console.error('Failed to update photos to pending:', updateError)
    return NextResponse.json(
      { error: 'Failed to update photos status' },
      { status: 500 }
    )
  }

  // Re-trigger batch-process job for all retryable photos
  try {
    await tasks.trigger('batch-process', {
      batchId,
      imageIds: photoIds,
    })

    console.log('Batch retry job triggered successfully', {
      batchId,
      retriedCount: photoIds.length,
    })
  } catch (triggerError) {
    console.error('Failed to trigger batch retry job:', triggerError)
    // Roll back the status changes
    await supabase
      .from('images')
      .update({ detection_status: 'failed' } as never)
      .in('id', photoIds)
      .eq('user_id', userId)

    return NextResponse.json(
      { error: 'Failed to trigger batch retry job. Please try again.' },
      { status: 500 }
    )
  }

  return NextResponse.json(
    {
      success: true,
      retriedCount: photoIds.length,
    },
    { status: 200 }
  )
}
