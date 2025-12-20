import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPhoto, getSignedViewUrl } from '@/lib/services/photos'
import type { Detection } from '@/types/database'

interface DetectionResponse {
  id: string
  image_id: string
  bbox_x: number
  bbox_y: number
  bbox_width: number
  bbox_height: number
  confidence: number
  class_name: string | null
  created_at: string
  has_embedding: boolean
}

interface PhotoDetailResponse {
  photo: {
    id: string
    user_id: string
    file_path: string
    camera_id: string | null
    file_size_bytes: number | null
    captured_at: string | null
    detection_status: string
    classification: string | null
    confidence: number | null
    is_archived: boolean
    created_at: string
    updated_at: string
    imageUrl: string | null
    thumbnailUrl: string | null
    detections: DetectionResponse[]
  }
}

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/photos/[id]
 * Returns photo details with detections and signed URLs
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse<PhotoDetailResponse | { error: string }>> {
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

    // Get photo with detections
    const { data: photo, error: photoError } = await getPhoto(user.id, id)

    if (photoError !== null) {
      console.error('Failed to get photo:', photoError)
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
    }

    if (photo === null) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
    }

    // Get signed URL for full image
    let imageUrl: string | null = null
    const { data: fullUrl, error: fullError } = await getSignedViewUrl(photo.file_path)
    if (fullError === null && fullUrl !== null) {
      imageUrl = fullUrl
    }

    // Get signed URL for thumbnail if it exists
    let thumbnailUrl: string | null = null
    if (photo.thumbnail_path !== null) {
      const { data: thumbUrl, error: thumbError } = await getSignedViewUrl(
        photo.thumbnail_path
      )
      if (thumbError === null && thumbUrl !== null) {
        thumbnailUrl = thumbUrl
      }
    }

    // Get embedding status for each detection
    const detectionIds = photo.detections.map((d: Detection) => d.id)
    const embeddingMap = new Map<string, boolean>()

    if (detectionIds.length > 0) {
      const { data: embeddings } = await supabase
        .from('deer_embeddings')
        .select('detection_id')
        .in('detection_id', detectionIds)

      if (embeddings) {
        for (const e of embeddings) {
          const embeddingData = e as { detection_id: string }
          embeddingMap.set(embeddingData.detection_id, true)
        }
      }
    }

    // Transform detections to API format
    const detections: DetectionResponse[] = photo.detections.map((d: Detection) => ({
      id: d.id,
      image_id: d.image_id,
      bbox_x: d.bbox_x ?? 0,
      bbox_y: d.bbox_y ?? 0,
      bbox_width: d.bbox_width ?? 0,
      bbox_height: d.bbox_height ?? 0,
      confidence: d.confidence ?? 0,
      class_name: d.class ?? null,
      created_at: d.created_at,
      has_embedding: embeddingMap.get(d.id) ?? false,
    }))

    // Build response
    const response: PhotoDetailResponse = {
      photo: {
        id: photo.id,
        user_id: photo.user_id,
        file_path: photo.file_path,
        camera_id: photo.camera_id,
        file_size_bytes: photo.file_size_bytes,
        captured_at: photo.captured_at,
        detection_status: photo.detection_status,
        classification: photo.classification,
        confidence: photo.confidence,
        is_archived: photo.is_archived,
        created_at: photo.created_at,
        updated_at: photo.created_at, // Using created_at as updated_at not in schema
        imageUrl,
        thumbnailUrl,
        detections,
      },
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error('Unexpected error in GET /api/photos/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
