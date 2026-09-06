import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPhotos, type PhotoFilters } from '@/lib/services/photos'
import { parsePhotoFilters } from '@/lib/photos/filters'
import { photoOrder, encodePhotoCursor } from '@/lib/photos/order'
import { getCachedSignedUrls } from '@/lib/cache/signed-url-cache'
import type { Image } from '@/types/database'

interface PhotoResponse extends Image {
  thumbnailUrl: string | null
  mediumUrl: string | null
  imageUrl: string | null
  blurDataUrl: string | null
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

    let filters: PhotoFilters
    try {
      filters = parsePhotoFilters(new URL(request.url).searchParams)
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid photo filters' }, { status: 400 })
    }
    const limit = filters.limit ?? 50
    filters.limit = limit + 1

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
    const { field } = photoOrder(filters)
    const nextCursor = hasNextPage && lastPhoto ? encodePhotoCursor(lastPhoto, field) : null

    // Fetch quality status and generate signed URLs in parallel for performance
    const photoIds = photosToReturn.map((p) => p.id)

    // Collect file paths for batch URL generation (much faster than individual calls).
    // The grid is thumbnail-only and the lightbox loads full-res from the detail
    // endpoint, so the LIST endpoint signs ONLY thumbnail + medium — never the
    // full-res original (ADR 0003: don't ship multi-MB URLs the client won't use).
    const allPaths: string[] = []

    for (const photo of photosToReturn) {
      if (photo.thumbnail_path) {
        allPaths.push(photo.thumbnail_path)
      }
      if (photo.medium_path) {
        allPaths.push(photo.medium_path)
      }
    }

    // Build quality status query promise
    const qualityPromise = photoIds.length > 0
      ? supabase
          .from('detections')
          .select('image_id, quality_status')
          .in('image_id', photoIds)
          .not('quality_status', 'is', null)
      : Promise.resolve({ data: null })

    // Execute cached URL generation and quality query in parallel
    // Cache provides near-instant hits for previously fetched URLs (50-min TTL)
    const [cachedUrls, qualityResult] = await Promise.all([
      getCachedSignedUrls(allPaths, user.id),
      qualityPromise,
    ])

    // Convert array result to Map for downstream compatibility
    const urlMap = new Map<string, string>()
    allPaths.forEach((path, i) => {
      const url = cachedUrls[i]
      if (url !== null && url !== undefined && url !== '') {
        urlMap.set(path, url)
      }
    })

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

    // Map URL results back to photos using the batch URL map
    const photosWithUrls: PhotoResponse[] = photosToReturn.map((photo) => {
      return {
        ...photo,
        thumbnailUrl: photo.thumbnail_path ? urlMap.get(photo.thumbnail_path) ?? null : null,
        mediumUrl: photo.medium_path ? urlMap.get(photo.medium_path) ?? null : null,
        // Full-res is intentionally NOT signed for the list (thumbnail-only grid;
        // the detail endpoint signs full-res where the lightbox needs it).
        imageUrl: null,
        blurDataUrl: photo.blur_data_url ?? null,
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
