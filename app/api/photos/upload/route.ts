import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createBatch, type CreateBatchLocationData } from '@/lib/services/batches'
import { getSignedUploadUrl } from '@/lib/services/photos'
import { findOrCreateCamera } from '@/lib/services/cameras'
import type { Json } from '@/types/database'

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
  // EXIF metadata fields
  capturedAt?: string // ISO date string
  make?: string
  model?: string
  deviceIdentifier?: string
  exifSignature?: string
  exifData?: Json
}

interface UploadInitiationRequest {
  files: UploadFileRequest[]
  uploadSessionId?: string
  locationLat?: number
  locationLng?: number
  areaName?: string
  directionCompass?: number
  directionNotes?: string
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

    // Create processing batch with location data if provided
    const locationData: CreateBatchLocationData | undefined =
      body.locationLat !== undefined ||
      body.locationLng !== undefined ||
      body.areaName !== undefined ||
      body.directionCompass !== undefined ||
      body.directionNotes !== undefined
        ? {
            ...(body.locationLat !== undefined && { locationLat: body.locationLat }),
            ...(body.locationLng !== undefined && { locationLng: body.locationLng }),
            ...(body.areaName !== undefined && { areaName: body.areaName }),
            ...(body.directionCompass !== undefined && { directionCompass: body.directionCompass }),
            ...(body.directionNotes !== undefined && { directionNotes: body.directionNotes }),
          }
        : undefined

    const { data: batch, error: batchError } = await createBatch(
      user.id,
      body.files.length,
      locationData
    )

    if (batchError !== null || batch === null) {
      console.error('Failed to create batch:', batchError)
      return NextResponse.json(
        { error: 'Failed to create upload batch' },
        { status: 500 }
      )
    }

    // Link batch to upload session if provided
    if (body.uploadSessionId) {
      const { error: linkError } = await supabase
        .from('processing_batches')
        .update({ upload_session_id: body.uploadSessionId })
        .eq('id', batch.id)

      if (linkError) {
        console.error('Failed to link batch to session:', linkError)
        // Note: batch already created, continue with warning
      }
    }

    // Single camera lookup - all files in a batch are assumed from the same camera
    let sharedCameraId: string | null = null
    const firstFile = body.files[0]
    if (firstFile && (firstFile.make || firstFile.model || firstFile.deviceIdentifier || firstFile.exifSignature)) {
      const cameraMetadata = {
        make: firstFile.make ?? null,
        model: firstFile.model ?? null,
        deviceIdentifier: firstFile.deviceIdentifier ?? null,
        exifSignature: firstFile.exifSignature ?? null,
      }
      const { data: camera } = await findOrCreateCamera(user.id, cameraMetadata)
      if (camera !== null) {
        sharedCameraId = camera.id
      }
    }

    // Parallelize signed URL generation (camera already resolved)
    const uploadPromises = body.files.map(async (file) => {
      // Generate signed upload URL
      const { data: uploadData, error: uploadError } = await getSignedUploadUrl(
        user.id,
        batch.id,
        file.filename
      )

      if (uploadError !== null || uploadData === null) {
        return { file, error: `${file.filename}: Failed to generate upload URL` }
      }

      return { file, uploadData, cameraId: sharedCameraId, error: null }
    })

    const results = await Promise.all(uploadPromises)

    // Separate successes and errors
    const successes = results.filter(r => r.error === null && r.uploadData)
    const errors = results.filter(r => r.error !== null).map(r => r.error!)

    // Batch insert all photos at once
    const photoRecords = successes.map(r => ({
      user_id: user.id,
      file_path: r.uploadData!.path,
      batch_id: batch.id,
      camera_id: r.cameraId ?? null,
      file_size_bytes: r.file.size,
      detection_status: 'pending' as const,
      captured_at: r.file.capturedAt ?? null,
      exif_data: r.file.exifData ?? null,
    }))

    const { data: photos, error: insertError } = await supabase
      .from('images')
      .insert(photoRecords)
      .select()

    if (insertError || !photos) {
      console.error('Failed to batch insert photos:', insertError)
      return NextResponse.json({ error: 'Failed to create photo records' }, { status: 500 })
    }

    // Build upload response
    const uploads = successes.map((r, index) => ({
      fileId: r.file.id,
      filename: r.file.filename,
      uploadUrl: r.uploadData!.signedUrl,
      imageId: photos[index]!.id,
      path: r.uploadData!.path,
    }))

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
