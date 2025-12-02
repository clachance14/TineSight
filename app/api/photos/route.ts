import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPhotos } from '@/lib/services/photos'
import { getSignedViewUrl } from '@/lib/services/photos'
import type { Image } from '@/types/database'

interface PhotoResponse extends Image {
  thumbnailUrl: string | null
  imageUrl: string | null
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

    // Build query to get photos
    // First, get one extra photo to determine if there's a next page
    const fetchLimit = limit + 1

    // Build filters object
    const filters: {
      status?: string
      hasDeer?: boolean
      batchId?: string
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

    if (batchId !== null) {
      // Note: batchId is not in the PhotoFilters interface in the service
      // We'll handle this by adding it if the service supports it
      // For now, we'll omit it as the service doesn't support it yet
      // TODO: Add batchId filter support to photos service
    }

    // If cursor is provided, we need to implement cursor-based pagination
    // For simplicity, we'll use offset-based pagination for now
    // In a production system, cursor-based pagination is more efficient
    if (cursor !== null) {
      // Cursor-based pagination would require additional implementation
      // For now, we'll return an error
      return NextResponse.json(
        { error: 'Cursor-based pagination not yet implemented' },
        { status: 400 }
      )
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
    const nextCursor = hasNextPage && lastPhoto !== undefined ? lastPhoto.id : null

    // Generate signed URLs for each photo
    const photosWithUrls: PhotoResponse[] = []
    for (const photo of photosToReturn) {
      let thumbnailUrl: string | null = null
      let imageUrl: string | null = null

      // Get thumbnail URL if thumbnail exists
      if (photo.thumbnail_path !== null) {
        const { data: thumbUrl, error: thumbError } = await getSignedViewUrl(
          photo.thumbnail_path
        )
        if (thumbError === null && thumbUrl !== null) {
          thumbnailUrl = thumbUrl
        }
      }

      // Get full image URL
      const { data: fullUrl, error: fullError } = await getSignedViewUrl(photo.file_path)
      if (fullError === null && fullUrl !== null) {
        imageUrl = fullUrl
      }

      photosWithUrls.push({
        ...photo,
        thumbnailUrl,
        imageUrl,
      })
    }

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
