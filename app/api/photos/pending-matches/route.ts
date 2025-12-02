import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSignedViewUrl } from '@/lib/services/photos'

interface DetectionSummary {
  id: string
  pending_match_count: number
}

interface PendingMatchPhoto {
  id: string
  file_path: string
  captured_at: string | null
  thumbnailUrl: string | null
  imageUrl: string | null
  detections: DetectionSummary[]
}

interface PendingMatchesResponse {
  photos: PendingMatchPhoto[]
  total: number
}

/**
 * GET /api/photos/pending-matches
 * Returns photos that have detections with pending match candidates
 */
export async function GET(
  _request: NextRequest
): Promise<NextResponse<PendingMatchesResponse | { error: string }>> {
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

    // Query for images with pending match candidates
    // Strategy: Get match_candidates with status='pending', join to detections and images
    const { data: pendingMatches, error: matchError } = await supabase
      .from('match_candidates')
      .select(`
        id,
        detection_id,
        detections!inner(
          id,
          image_id,
          images!inner(
            id,
            file_path,
            captured_at,
            thumbnail_path,
            user_id
          )
        )
      `)
      .eq('status', 'pending')
      .eq('detections.images.user_id', user.id)

    if (matchError !== null) {
      console.error('Failed to get pending matches:', matchError)
      return NextResponse.json(
        { error: 'Failed to fetch pending matches' },
        { status: 500 }
      )
    }

    if (pendingMatches === null || pendingMatches.length === 0) {
      return NextResponse.json({ photos: [], total: 0 }, { status: 200 })
    }

    // Group by image and count pending matches per detection
    const imageMap = new Map<string, {
      image: {
        id: string
        file_path: string
        captured_at: string | null
        thumbnail_path: string | null
      }
      detectionCounts: Map<string, number>
    }>()

    for (const match of pendingMatches) {
      const matchData = match as {
        detection_id: string
        detections: {
          id: string
          image_id: string
          images: {
            id: string
            file_path: string
            captured_at: string | null
            thumbnail_path: string | null
            user_id: string
          }
        }
      }

      const imageId = matchData.detections.images.id
      const detectionId = matchData.detection_id

      if (!imageMap.has(imageId)) {
        imageMap.set(imageId, {
          image: {
            id: matchData.detections.images.id,
            file_path: matchData.detections.images.file_path,
            captured_at: matchData.detections.images.captured_at,
            thumbnail_path: matchData.detections.images.thumbnail_path,
          },
          detectionCounts: new Map(),
        })
      }

      const entry = imageMap.get(imageId)!
      const currentCount = entry.detectionCounts.get(detectionId) ?? 0
      entry.detectionCounts.set(detectionId, currentCount + 1)
    }

    // Build response with signed URLs
    const photos: PendingMatchPhoto[] = []

    for (const [_imageId, entry] of imageMap) {
      const { image, detectionCounts } = entry

      // Get thumbnail URL if available
      let thumbnailUrl: string | null = null
      if (image.thumbnail_path !== null) {
        const { data: thumbUrl, error: thumbError } = await getSignedViewUrl(
          image.thumbnail_path
        )
        if (thumbError === null && thumbUrl !== null) {
          thumbnailUrl = thumbUrl
        }
      }

      // Get full image URL
      let imageUrl: string | null = null
      const { data: fullUrl, error: fullError } = await getSignedViewUrl(image.file_path)
      if (fullError === null && fullUrl !== null) {
        imageUrl = fullUrl
      }

      // Build detection summaries
      const detections: DetectionSummary[] = Array.from(detectionCounts.entries()).map(
        ([detectionId, count]) => ({
          id: detectionId,
          pending_match_count: count,
        })
      )

      photos.push({
        id: image.id,
        file_path: image.file_path,
        captured_at: image.captured_at,
        thumbnailUrl,
        imageUrl,
        detections,
      })
    }

    // Sort by captured_at descending (most recent first)
    photos.sort((a, b) => {
      if (a.captured_at === null && b.captured_at === null) return 0
      if (a.captured_at === null) return 1
      if (b.captured_at === null) return -1
      return new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime()
    })

    return NextResponse.json(
      {
        photos,
        total: photos.length,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Unexpected error in GET /api/photos/pending-matches:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
