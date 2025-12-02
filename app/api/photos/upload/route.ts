import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createBatch } from '@/lib/services/batches'
import { createPhoto, getSignedUploadUrl } from '@/lib/services/photos'

// File validation constants
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]

interface UploadFileRequest {
  id: string
  filename: string
  contentType: string
  size: number
}

interface UploadInitiationRequest {
  files: UploadFileRequest[]
}

interface UploadResponse {
  fileId: string
  filename: string
  uploadUrl: string
  imageId: string
  path: string
}

interface UploadInitiationResponse {
  batchId: string
  uploads: UploadResponse[]
}

/**
 * POST /api/photos/upload
 * Initiates a photo upload batch by creating database records and generating signed upload URLs
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
    const body = (await request.json()) as UploadInitiationRequest

    if (body.files === undefined || !Array.isArray(body.files) || body.files.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request: files array is required and must not be empty' },
        { status: 400 }
      )
    }

    // Validate each file
    const validationErrors: string[] = []
    body.files.forEach((file, index) => {
      if (file.filename === undefined || typeof file.filename !== 'string') {
        validationErrors.push(`File ${index}: filename is required`)
      }
      if (file.contentType === undefined || typeof file.contentType !== 'string') {
        validationErrors.push(`File ${index}: contentType is required`)
      }
      if (file.size === undefined || typeof file.size !== 'number' || file.size <= 0) {
        validationErrors.push(`File ${index}: size must be a positive number`)
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        validationErrors.push(
          `File ${index} (${file.filename}): exceeds maximum size of 50MB`
        )
      }

      // Validate content type
      if (!ALLOWED_CONTENT_TYPES.includes(file.contentType.toLowerCase())) {
        validationErrors.push(
          `File ${index} (${file.filename}): unsupported content type ${file.contentType}`
        )
      }
    })

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      )
    }

    // Create processing batch
    const { data: batch, error: batchError } = await createBatch(
      user.id,
      body.files.length
    )

    if (batchError !== null || batch === null) {
      console.error('Failed to create batch:', batchError)
      return NextResponse.json(
        { error: 'Failed to create upload batch' },
        { status: 500 }
      )
    }

    // Create image records and generate signed upload URLs
    const uploads: UploadResponse[] = []
    const errors: string[] = []

    for (const file of body.files) {
      try {
        // Generate signed upload URL
        const { data: uploadData, error: uploadError } = await getSignedUploadUrl(
          user.id,
          batch.id,
          file.filename
        )

        if (uploadError !== null || uploadData === null) {
          console.error('Failed to generate signed URL:', uploadError)
          errors.push(`${file.filename}: Failed to generate upload URL`)
          continue
        }

        // Create image record in database
        const { data: image, error: imageError } = await createPhoto(user.id, {
          file_path: uploadData.path,
          file_size_bytes: file.size,
          detection_status: 'pending',
        })

        if (imageError !== null || image === null) {
          console.error('Failed to create image record:', imageError)
          errors.push(`${file.filename}: Failed to create database record`)
          continue
        }

        uploads.push({
          fileId: file.id,
          filename: file.filename,
          uploadUrl: uploadData.signedUrl,
          imageId: image.id,
          path: uploadData.path,
        })
      } catch (error) {
        console.error(`Error processing file ${file.filename}:`, error)
        errors.push(`${file.filename}: Unexpected error`)
      }
    }

    // If all files failed, return error
    if (uploads.length === 0) {
      return NextResponse.json(
        {
          error: 'Failed to process any files',
          details: errors,
        },
        { status: 500 }
      )
    }

    // Return response with successful uploads and any errors
    const response: UploadInitiationResponse & { warnings?: string[] } = {
      batchId: batch.id,
      uploads,
    }

    if (errors.length > 0) {
      response.warnings = errors
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error('Unexpected error in upload initiation:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
