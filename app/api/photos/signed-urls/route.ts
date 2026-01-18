import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createBatch, linkBatchToSession } from '@/lib/services/batches'
import { getSignedUploadUrl } from '@/lib/services/photos'
import { findOrCreateCamera } from '@/lib/services/cameras'
import type { Json } from '@/types/database'

// Constants
const MAX_FILES_PER_REQUEST = 25
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]

// Request types
interface FileRequest {
  filename: string
  size: number
  mimeType: string
  exifData?: {
    make?: string
    model?: string
    dateTime?: string
    deviceIdentifier?: string
    exifSignature?: string
  }
}

interface SignedUrlsRequest {
  sessionId: string
  files: FileRequest[]
}

// Response types
interface SignedUrlResponse {
  filename: string
  imageId: string
  signedUrl: string
  storagePath: string
}

interface SignedUrlsResponse {
  urls: SignedUrlResponse[]
  warnings?: string[]
}

/**
 * POST /api/photos/signed-urls
 * Generates signed upload URLs for a batch of files (max 25 per request).
 * Creates pending image records in database for each file.
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

    // Parse request body
    let body: SignedUrlsRequest
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    // Validate sessionId
    if (!body.sessionId || typeof body.sessionId !== 'string') {
      return NextResponse.json(
        { error: 'sessionId is required and must be a string' },
        { status: 400 }
      )
    }

    // Validate UUID format for sessionId
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(body.sessionId)) {
      return NextResponse.json(
        { error: 'sessionId must be a valid UUID' },
        { status: 400 }
      )
    }

    // Verify session exists and belongs to user
    const { data: session, error: sessionError } = await supabase
      .from('upload_sessions')
      .select('id, user_id, status')
      .eq('id', body.sessionId)
      .single()

    if (sessionError !== null || session === null) {
      return NextResponse.json(
        { error: 'Upload session not found' },
        { status: 404 }
      )
    }

    if (session.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Upload session does not belong to you' },
        { status: 403 }
      )
    }

    // Validate files array
    if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
      return NextResponse.json(
        { error: 'files array is required and must not be empty' },
        { status: 400 }
      )
    }

    if (body.files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json(
        { error: `Maximum ${MAX_FILES_PER_REQUEST} files per request` },
        { status: 400 }
      )
    }

    // Validate each file
    const validationErrors: string[] = []
    for (let i = 0; i < body.files.length; i++) {
      const file = body.files[i]

      if (!file) {
        validationErrors.push(`File ${i}: missing file object`)
        continue
      }

      if (!file.filename || typeof file.filename !== 'string') {
        validationErrors.push(`File ${i}: filename is required`)
      } else if (file.filename.length > 255) {
        validationErrors.push(`File ${i}: filename exceeds 255 characters`)
      }

      if (typeof file.size !== 'number' || file.size <= 0) {
        validationErrors.push(`File ${i}: size must be a positive number`)
      } else if (file.size > MAX_FILE_SIZE) {
        validationErrors.push(`File ${i} (${file.filename}): exceeds maximum size of 50MB`)
      }

      if (!file.mimeType || typeof file.mimeType !== 'string') {
        validationErrors.push(`File ${i}: mimeType is required`)
      } else if (!ALLOWED_MIME_TYPES.includes(file.mimeType.toLowerCase())) {
        validationErrors.push(`File ${i} (${file.filename}): unsupported mimeType ${file.mimeType}`)
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      )
    }

    // Create a processing batch for this chunk of files
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

    // Link batch to upload session
    const { error: linkError } = await linkBatchToSession(batch.id, body.sessionId)
    if (linkError) {
      console.error('Failed to link batch to session:', linkError)
      // Continue - batch already created
    }

    // Camera lookup - use first file's EXIF for camera identification
    let sharedCameraId: string | null = null
    const firstFile = body.files[0]
    if (firstFile?.exifData) {
      const exif = firstFile.exifData
      if (exif.make || exif.model || exif.deviceIdentifier || exif.exifSignature) {
        const { data: camera } = await findOrCreateCamera(user.id, {
          make: exif.make ?? null,
          model: exif.model ?? null,
          deviceIdentifier: exif.deviceIdentifier ?? null,
          exifSignature: exif.exifSignature ?? null,
        })
        if (camera !== null) {
          sharedCameraId = camera.id
        }
      }
    }

    // Generate signed URLs and create image records in parallel
    const uploadPromises = body.files.map(async (file) => {
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
    const successes = results.filter((r) => r.error === null && r.uploadData)
    const errors = results.filter((r) => r.error !== null).map((r) => r.error!)

    if (successes.length === 0) {
      return NextResponse.json(
        { error: 'Failed to generate any upload URLs', details: errors },
        { status: 500 }
      )
    }

    // Batch insert all pending image records
    const photoRecords = successes.map((r) => ({
      user_id: user.id,
      file_path: r.uploadData!.path,
      batch_id: batch.id,
      camera_id: r.cameraId ?? null,
      file_size_bytes: r.file.size,
      detection_status: 'pending' as const,
      captured_at: r.file.exifData?.dateTime ?? null,
      exif_data: r.file.exifData ? (r.file.exifData as unknown as Json) : null,
    }))

    const { data: photos, error: insertError } = await supabase
      .from('images')
      .insert(photoRecords)
      .select('id, file_path')

    if (insertError !== null || !photos) {
      console.error('Failed to batch insert photos:', insertError)
      return NextResponse.json(
        { error: 'Failed to create photo records' },
        { status: 500 }
      )
    }

    // Build response: map photos back to their signed URLs
    const urls: SignedUrlResponse[] = successes.map((r, index) => ({
      filename: r.file.filename,
      imageId: photos[index]!.id,
      signedUrl: r.uploadData!.signedUrl,
      storagePath: r.uploadData!.path,
    }))

    const response: SignedUrlsResponse = { urls }

    if (errors.length > 0) {
      response.warnings = errors
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error('Unexpected error in signed-urls endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
