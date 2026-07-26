import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateBatchStatus, getBatch } from '@/lib/services/batches'
import { tasks } from '@trigger.dev/sdk/v3'

interface UploadCompleteRequest {
  batchId: string
  uploadedImageIds: string[]
}

interface UploadCompleteResponse {
  status: string
  message: string
}

/**
 * POST /api/photos/upload/complete
 * Marks an upload batch as complete and triggers background processing
 */
export async function POST(request: NextRequest) {
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
    const body = (await request.json()) as UploadCompleteRequest

    if (body.batchId === undefined || typeof body.batchId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid request: batchId is required' },
        { status: 400 }
      )
    }

    if (
      body.uploadedImageIds === undefined ||
      !Array.isArray(body.uploadedImageIds)
    ) {
      return NextResponse.json(
        { error: 'Invalid request: uploadedImageIds array is required' },
        { status: 400 }
      )
    }

    // Verify batch exists and belongs to user
    const { data: batch, error: batchError } = await getBatch(body.batchId)

    if (batchError !== null || batch === null) {
      return NextResponse.json(
        { error: 'Batch not found' },
        { status: 404 }
      )
    }

    // Verify ownership
    if (batch.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized: batch does not belong to user' },
        { status: 403 }
      )
    }

    // Verify batch is in a valid state for completion
    if (batch.status !== 'pending' && batch.status !== 'uploading') {
      return NextResponse.json(
        {
          error: `Invalid batch state: expected 'pending' or 'uploading', got '${batch.status}'`,
        },
        { status: 400 }
      )
    }

    // Query database for all pending images in this batch (more robust than relying on frontend)
    const { data: pendingImages, error: imagesError } = await supabase
      .from('images')
      .select('id')
      .eq('batch_id', body.batchId)
      .eq('detection_status', 'pending')

    if (imagesError) {
      console.error('Failed to fetch pending images:', imagesError)
      return NextResponse.json(
        { error: 'Failed to fetch pending images' },
        { status: 500 }
      )
    }

    const imageIds = pendingImages?.map((img) => img.id) ?? []

    if (imageIds.length === 0) {
      console.warn('No pending images found for batch:', body.batchId)
      return NextResponse.json(
        { error: 'No pending images found for this batch' },
        { status: 400 }
      )
    }

    // Update batch status to processing, reconciling total_images to what actually
    // uploaded. The upload is finished at this point, so imageIds.length is
    // authoritative — whereas the value set at batch creation was the intended count
    // and overshoots whenever a file fails to upload, leaving the batch permanently
    // 'processing' (see the batch_auto_complete trigger, migration 016).
    const { data: updatedBatch, error: updateError } = await updateBatchStatus(
      body.batchId,
      'processing',
      undefined,
      imageIds.length
    )

    if (updateError !== null || updatedBatch === null) {
      console.error('Failed to update batch status:', updateError)
      return NextResponse.json(
        { error: 'Failed to update batch status' },
        { status: 500 }
      )
    }

    // Trigger background processing job via Trigger.dev
    try {
      const triggerResult = await tasks.trigger('batch-process', {
        batchId: body.batchId,
        imageIds,
      })

      console.log('Batch processing triggered:', {
        batchId: body.batchId,
        imageCount: imageIds.length,
        userId: user.id,
        jobId: triggerResult?.id,
      })
    } catch (triggerError) {
      console.error('Failed to trigger batch processing:', triggerError)
      // Revert batch status so it can be retried
      await updateBatchStatus(body.batchId, 'pending')
      return NextResponse.json(
        { error: 'Failed to start processing. Please try again.' },
        { status: 500 }
      )
    }

    // Return success response
    const response: UploadCompleteResponse = {
      status: 'processing',
      message: `Processing ${imageIds.length} photo${
        imageIds.length === 1 ? '' : 's'
      }...`,
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error('Unexpected error in upload completion:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
