import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateBatchStatus, getBatch } from '@/lib/services/batches'

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

    // Update batch status to processing
    const { data: updatedBatch, error: updateError } = await updateBatchStatus(
      body.batchId,
      'processing'
    )

    if (updateError !== null || updatedBatch === null) {
      console.error('Failed to update batch status:', updateError)
      return NextResponse.json(
        { error: 'Failed to update batch status' },
        { status: 500 }
      )
    }

    // TODO: Trigger background processing job via Trigger.dev
    // This will be implemented when Trigger.dev integration is added
    // For now, we just mark the batch as processing
    // Example:
    // await triggerPhotoProcessing({
    //   batchId: body.batchId,
    //   imageIds: body.uploadedImageIds,
    //   userId: user.id,
    // })

    console.log('Batch marked for processing:', {
      batchId: body.batchId,
      imageCount: body.uploadedImageIds.length,
      userId: user.id,
    })

    // Return success response
    const response: UploadCompleteResponse = {
      status: 'processing',
      message: `Processing ${body.uploadedImageIds.length} photo${
        body.uploadedImageIds.length === 1 ? '' : 's'
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
