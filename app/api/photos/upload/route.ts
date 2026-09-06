import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createBatch, linkBatchToSession, type CreateBatchLocationData } from '@/lib/services/batches'
import { getSignedUploadUrl } from '@/lib/services/photos'
import { findOrCreateCamera } from '@/lib/services/cameras'
import { createLocation } from '@/lib/services/locations'
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
  contentSha256?: string
  id: string
  filename: string
  contentType: string
  size: number
  // EXIF metadata fields
  cameraId?: string | null
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
  locationId?: string
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
export async function POST(request: NextRequest): Promise<NextResponse<{ error: string; }> | NextResponse<UploadInitiationResponse & { warnings?: string[]; }>> {
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

    if (body.files === undefined || !Array.isArray(body.files) || body.files.length === 0 || body.files.length > 100) {
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

      if (file.contentSha256 !== undefined && !/^[0-9a-f]{64}$/.test(file.contentSha256)) validationErrors.push(`File ${index}: invalid content hash`)

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        validationErrors.push(
          `File ${index} (${file.filename}): exceeds maximum size of 50MB`
        )
      }

      // Validate content type
      if (typeof file.contentType !== 'string' || !ALLOWED_CONTENT_TYPES.includes(file.contentType.toLowerCase())) {
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

    if (body.uploadSessionId != null) {
      const { data: session } = await supabase.from('upload_sessions').select('id, status').eq('id', body.uploadSessionId).eq('user_id', user.id).single()
      if (!session || session.status === 'cancelled') return NextResponse.json({ error: 'Upload session unavailable' }, { status: 409 })
    }

    const explicitCameraIds = [...new Set(body.files.map(file => file.cameraId).filter((id): id is string => !(id == null)))]
    if (explicitCameraIds.length > 0) {
      const { data: cameras, error } = await supabase.from('cameras').select('id').eq('user_id', user.id).in('id', explicitCameraIds)
      if (error || cameras?.length !== explicitCameraIds.length) return NextResponse.json({ error: 'Invalid camera assignment' }, { status: 400 })
    }

    // Resolve location ID - either use provided ID, find existing, or create new
    let resolvedLocationId: string | undefined = body.locationId

    // If locationId provided, verify user owns it
    if (body.locationId != null) {
      const { data: location } = await supabase
        .from('locations')
        .select('id')
        .eq('id', body.locationId)
        .eq('user_id', user.id)
        .single()

      if (!location) {
        return NextResponse.json({ error: 'Invalid location' }, { status: 400 })
      }
      resolvedLocationId = body.locationId
    } else if (body.areaName != null) {
      // Try to find existing location with same name first
      const { data: existing } = await supabase
        .from('locations')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', body.areaName.trim())
        .single()

      if (existing) {
        resolvedLocationId = existing.id
      } else {
        // Create new only if doesn't exist
        try {
          const { data: newLocation } = await createLocation(user.id, {
            name: body.areaName.trim(),
            lat: body.locationLat ?? 0,
            lng: body.locationLng ?? 0,
            ...(body.directionCompass !== undefined && { directionCompass: body.directionCompass }),
            ...(body.directionNotes !== undefined && { directionNotes: body.directionNotes }),
          })
          resolvedLocationId = newLocation?.id
        } catch (e) {
          console.error('Location creation failed, proceeding without:', e)
        }
      }
    }

    // Create processing batch with location data if provided
    const locationData: CreateBatchLocationData | undefined =
      body.locationLat !== undefined ||
      body.locationLng !== undefined ||
      body.areaName !== undefined ||
      body.directionCompass !== undefined ||
      body.directionNotes !== undefined ||
      resolvedLocationId !== undefined
        ? {
            ...(body.locationLat !== undefined && { locationLat: body.locationLat }),
            ...(body.locationLng !== undefined && { locationLng: body.locationLng }),
            ...(body.areaName !== undefined && { areaName: body.areaName }),
            ...(body.directionCompass !== undefined && { directionCompass: body.directionCompass }),
            ...(body.directionNotes !== undefined && { directionNotes: body.directionNotes }),
            ...((resolvedLocationId != null) && { locationId: resolvedLocationId }),
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
    if (body.uploadSessionId != null) {
      const { error: linkError } = await linkBatchToSession(batch.id, body.uploadSessionId)

      if (linkError) {
        console.error('Failed to link batch to session:', linkError)
        // Note: batch already created, continue with warning
      }
    }

    // Resolve each source independently; a transport chunk may span cameras.
    const cameraIds = new Map<string, Promise<string | null>>()
    const cameraFor = (file: UploadFileRequest): Promise<string | null> => {
      if (file.cameraId != null) return Promise.resolve(file.cameraId)
      // Make/model identifies a product, not an individual physical camera.
      if (file.deviceIdentifier == null) return Promise.resolve(null)
      const metadata = { make: file.make ?? null, model: file.model ?? null, deviceIdentifier: file.deviceIdentifier ?? null, exifSignature: file.exifSignature ?? null }
      const key = JSON.stringify(metadata)
      if (!cameraIds.has(key)) cameraIds.set(key, findOrCreateCamera(user.id, metadata).then(result => result.data?.id ?? null))
      return cameraIds.get(key) ?? Promise.resolve(null)
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

      return { file, uploadData, cameraId: await cameraFor(file), error: null }
    })

    const results = await Promise.all(uploadPromises)

    // Separate successes and errors
    const successes = results.filter(r => r.error === null && r.uploadData !== undefined)
    const errors = results.filter(r => r.error !== null).map(r => r.error)

    // Batch insert all photos at once
    const photoRecords = successes.map(r => ({
      user_id: user.id,
      file_path: r.uploadData.path,
      batch_id: batch.id,
      camera_id: r.cameraId ?? null,
      file_size_bytes: r.file.size,
      original_filename: r.file.filename,
      content_sha256: r.file.contentSha256 ?? null,
      detection_status: 'pending' as const,
      captured_at: r.file.capturedAt ?? null,
      exif_data: r.file.exifData ?? null,
    }))

    const { data: photos, error: insertError } = await supabase
      .from('images')
      .insert(photoRecords)
      .select()

    if (insertError !== null) {
      console.error('Failed to batch insert photos:', insertError)
      return NextResponse.json({ error: 'Failed to create photo records' }, { status: 500 })
    }

    // Build upload response
    const photosByPath = new Map(photos.map(photo => [photo.file_path, photo]))
    const uploads = successes.map((r) => {
      const photo = photosByPath.get(r.uploadData.path)
      if (photo === undefined) throw new Error("Uploaded photo reservation is missing")
      return ({
      fileId: r.file.id,
      filename: r.file.filename,
      uploadUrl: r.uploadData.signedUrl,
      imageId: photo.id,
      path: r.uploadData.path,
    })})

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
