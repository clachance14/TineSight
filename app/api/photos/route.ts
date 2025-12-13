import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPhotos } from '@/lib/services/photos'
import { getSignedViewUrl } from '@/lib/services/photos'
import type { Image } from '@/types/database'

interface PhotoResponse extends Image {
  thumbnailUrl: string | null
  imageUrl: string | null
  bestQualityStatus: string | null
}

interface GetPhotosResponse {
  photos: PhotoResponse[]
  nextCursor: string | null
  total: number
}

/**
 * GET /api/photos
 * Lists user's photos with pagination and optional filters
 */
export async function GET(request: NextRequest): Promise<NextResponse<GetPhotosResponse | { error: string; details?: string[] }>> {
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

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const hasDeerParam = searchParams.get('hasDeer')
    const batchId = searchParams.get('batchId')
    const cursor = searchParams.get('cursor')
    const limitParam = searchParams.get('limit')
    const minConfidenceParam = searchParams.get('minConfidence')
    const sexParam = searchParams.get('sex')
    const minPointsParam = searchParams.get('min_points')
    const maxPointsParam = searchParams.get('max_points')

    // Validate and parse limit (default 50, max 100)
    let limit = 50
    if (limitParam !== null) {
      const parsedLimit = parseInt(limitParam, 10)
      if (isNaN(parsedLimit) || parsedLimit <= 0) {
        return NextResponse.json(
          { error: 'Invalid limit: must be a positive number' },
          { status: 400 }
        )
      }
      limit = Math.min(parsedLimit, 100)
    }

    // Parse hasDeer filter
    let hasDeer: boolean | undefined
    if (hasDeerParam !== null) {
      if (hasDeerParam === 'true') {
        hasDeer = true
      } else if (hasDeerParam === 'false') {
        hasDeer = false
      } else {
        return NextResponse.json(
          { error: 'Invalid hasDeer: must be "true" or "false"' },
          { status: 400 }
        )
      }
    }

    // Parse minConfidence filter
    let minConfidence: number | undefined
    if (minConfidenceParam !== null) {
      const parsed = parseInt(minConfidenceParam, 10)
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
        minConfidence = parsed
      } else {
        return NextResponse.json(
          { error: 'Invalid minConfidence: must be an integer between 0 and 100' },
          { status: 400 }
        )
      }
    }

    // Parse sex filter
    let sex: string | undefined
    if (sexParam !== null && ['buck', 'doe', 'fawn', 'unknown'].includes(sexParam)) {
      sex = sexParam
    }

    // Parse min_points filter
    let minPoints: number | undefined
    if (minPointsParam !== null) {
      const parsed = parseInt(minPointsParam, 10)
      if (!isNaN(parsed) && parsed >= 0) {
        minPoints = parsed
      }
    }

    // Parse max_points filter
    let maxPoints: number | undefined
    if (maxPointsParam !== null) {
      const parsed = parseInt(maxPointsParam, 10)
      if (!isNaN(parsed) && parsed >= 0) {
        maxPoints = parsed
      }
    }

    // Build query to get photos
    // First, get one extra photo to determine if there's a next page
    const fetchLimit = limit + 1

    // Build filters object
    const filters: {
      status?: string
      hasDeer?: boolean
      batchId?: string
      minConfidence?: number
      sex?: string
      minPoints?: number
      maxPoints?: number
      cursor?: string
      limit: number
      offset: number
    } = {
      limit: fetchLimit,
      offset: 0,
    }

    if (status !== null) {
      filters.status = status
    }

    if (hasDeer !== undefined) {
      filters.hasDeer = hasDeer
    }

    if (minConfidence !== undefined) {
      filters.minConfidence = minConfidence
    }

    if (sex !== undefined) {
      filters.sex = sex
    }

    if (minPoints !== undefined) {
      filters.minPoints = minPoints
    }

    if (maxPoints !== undefined) {
      filters.maxPoints = maxPoints
    }

    if (batchId !== null) {
      // Note: batchId is not in the PhotoFilters interface in the service
      // We'll handle this by adding it if the service supports it
      // For now, we'll omit it as the service doesn't support it yet
      // TODO: Add batchId filter support to photos service
    }

    // Apply cursor for pagination
    if (cursor !== null) {
      filters.cursor = cursor
    }

    // Get photos
    const { data: photos, error: photosError, count } = await getPhotos(user.id, filters)

    if (photosError !== null) {
      console.error('Failed to get photos:', photosError)
      return NextResponse.json(
        { error: 'Failed to retrieve photos' },
        { status: 500 }
      )
    }

    if (photos === null) {
      return NextResponse.json(
        { error: 'Failed to retrieve photos' },
        { status: 500 }
      )
    }

    // Determine if there's a next page
    const hasNextPage = photos.length > limit
    const photosToReturn = hasNextPage ? photos.slice(0, limit) : photos
    const lastPhoto = photosToReturn[photosToReturn.length - 1]
    // Cursor format: created_at::id (avoids extra DB lookup on pagination)
    const nextCursor = hasNextPage && lastPhoto !== undefined
      ? `${lastPhoto.created_at}::${lastPhoto.id}`
      : null

    // Fetch quality status and generate signed URLs in parallel for performance
    const photoIds = photosToReturn.map((p) => p.id)

    // Build URL generation promises (thumbnail + full image for each photo)
    const urlPromises = photosToReturn.flatMap((photo) => [
      photo.thumbnail_path
        ? getSignedViewUrl(photo.thumbnail_path)
        : Promise.resolve({ data: null, error: null }),
      getSignedViewUrl(photo.file_path),
    ])

    // Build quality status query promise
    const qualityPromise = photoIds.length > 0
      ? supabase
          .from('detections')
          .select('image_id, quality_status')
          .in('image_id', photoIds)
          .not('quality_status', 'is', null)
      : Promise.resolve({ data: null })

    // Execute all in parallel - this is the key performance optimization
    const [urlResults, qualityResult] = await Promise.all([
      Promise.all(urlPromises),
      qualityPromise,
    ])

    // Process quality status results into a map
    const qualityMap = new Map<string, string | null>()
    const qualityPriority: Record<string, number> = {
      high_quality: 1,
      manual_review: 2,
      low_quality: 3,
    }

    if (qualityResult.data) {
      for (const detection of qualityResult.data as { image_id: string; quality_status: string }[]) {
        const current = qualityMap.get(detection.image_id)
        const currentPriority = current ? qualityPriority[current] ?? 99 : 99
        const newPriority = qualityPriority[detection.quality_status] ?? 99

        if (newPriority < currentPriority) {
          qualityMap.set(detection.image_id, detection.quality_status)
        }
      }
    }

    // Map URL results back to photos (2 URLs per photo: thumbnail, full)
    const photosWithUrls: PhotoResponse[] = photosToReturn.map((photo, index) => {
      const thumbnailResult = urlResults[index * 2]
      const imageResult = urlResults[index * 2 + 1]

      return {
        ...photo,
        thumbnailUrl: thumbnailResult?.data ?? null,
        imageUrl: imageResult?.data ?? null,
        bestQualityStatus: qualityMap.get(photo.id) ?? null,
      }
    })

    // Build response
    const response: GetPhotosResponse = {
      photos: photosWithUrls,
      nextCursor,
      total: count ?? 0,
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error('Unexpected error in GET /api/photos:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
