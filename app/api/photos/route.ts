import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPhotos, getSignedViewUrls, type PhotoSortField, type OtherAnimalType } from '@/lib/services/photos'
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
    const dateFromParam = searchParams.get('dateFrom')
    const dateToParam = searchParams.get('dateTo')
    const sizeClassParam = searchParams.get('sizeClass')
    const qualityStatusParam = searchParams.get('qualityStatus')
    const cameraIdParam = searchParams.get('cameraId')
    const deerIdParam = searchParams.get('deerId')
    const uploadSessionId = searchParams.get('uploadSessionId') ?? undefined
    const areaNameParam = searchParams.get('areaName')
    const otherAnimalsParam = searchParams.get('otherAnimals')

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

    // Parse hasDetections filter
    const hasDetectionsParam = searchParams.get('hasDetections')
    let hasDetections: boolean | undefined
    if (hasDetectionsParam !== null) {
      if (hasDetectionsParam === 'true') {
        hasDetections = true
      } else if (hasDetectionsParam === 'false') {
        hasDetections = false
      } else {
        return NextResponse.json(
          { error: 'Invalid hasDetections: must be "true" or "false"' },
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

    // Parse dateFrom filter
    let dateFrom: string | undefined
    if (dateFromParam !== null) {
      const date = new Date(dateFromParam)
      if (!isNaN(date.getTime())) {
        dateFrom = dateFromParam
      } else {
        return NextResponse.json(
          { error: 'Invalid dateFrom: must be a valid ISO date string' },
          { status: 400 }
        )
      }
    }

    // Parse dateTo filter
    let dateTo: string | undefined
    if (dateToParam !== null) {
      const date = new Date(dateToParam)
      if (!isNaN(date.getTime())) {
        dateTo = dateToParam
      } else {
        return NextResponse.json(
          { error: 'Invalid dateTo: must be a valid ISO date string' },
          { status: 400 }
        )
      }
    }

    // Parse sizeClass filter
    let sizeClass: string | undefined
    if (sizeClassParam !== null) {
      const validSizeClasses = ['trophy', 'standard', 'basket', 'spike', 'unknown', 'all']
      if (validSizeClasses.includes(sizeClassParam)) {
        sizeClass = sizeClassParam === 'all' ? undefined : sizeClassParam
      } else {
        return NextResponse.json(
          { error: `Invalid sizeClass: must be one of ${validSizeClasses.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // Parse qualityStatus filter
    let qualityStatus: string | undefined
    if (qualityStatusParam !== null) {
      const validQualityStatuses = ['high_quality', 'manual_review', 'low_quality', 'all']
      if (validQualityStatuses.includes(qualityStatusParam)) {
        qualityStatus = qualityStatusParam === 'all' ? undefined : qualityStatusParam
      } else {
        return NextResponse.json(
          { error: `Invalid qualityStatus: must be one of ${validQualityStatuses.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // Parse cameraId filter
    let cameraId: string | undefined
    if (cameraIdParam !== null && cameraIdParam.trim() !== '') {
      cameraId = cameraIdParam
    }

    // Parse sortBy filter
    const sortByParam = searchParams.get('sortBy')
    let sortBy: PhotoSortField | undefined
    if (sortByParam !== null) {
      if (sortByParam === 'captured_at' || sortByParam === 'imported_at') {
        sortBy = sortByParam
      } else {
        return NextResponse.json(
          { error: 'Invalid sortBy: must be "captured_at" or "imported_at"' },
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
      hasDetections?: boolean
      batchId?: string
      qualityStatus?: string
      minConfidence?: number
      sex?: string
      minPoints?: number
      maxPoints?: number
      dateFrom?: string
      dateTo?: string
      sizeClass?: string
      cameraId?: string
      deerId?: string
      uploadSessionId?: string
      areaName?: string
      otherAnimals?: OtherAnimalType[]
      sortBy?: PhotoSortField
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

    if (hasDetections !== undefined) {
      filters.hasDetections = hasDetections
    }

    if (qualityStatus !== undefined) {
      filters.qualityStatus = qualityStatus
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

    if (dateFrom !== undefined) {
      filters.dateFrom = dateFrom
    }

    if (dateTo !== undefined) {
      filters.dateTo = dateTo
    }

    if (sizeClass !== undefined) {
      filters.sizeClass = sizeClass
    }

    if (cameraId !== undefined) {
      filters.cameraId = cameraId
    }

    if (deerIdParam !== null && deerIdParam.trim() !== '') {
      filters.deerId = deerIdParam
    }

    if (batchId !== null) {
      filters.batchId = batchId
    }

    if (uploadSessionId !== undefined) {
      filters.uploadSessionId = uploadSessionId
    }

    if (areaNameParam !== null && areaNameParam.trim() !== '') {
      filters.areaName = areaNameParam
    }

    if (otherAnimalsParam !== null && otherAnimalsParam.trim() !== '') {
      const validAnimals: OtherAnimalType[] = ['hogs', 'cows', 'goats', 'people', 'vehicles']
      const animals = otherAnimalsParam.split(',').filter((a): a is OtherAnimalType =>
        validAnimals.includes(a as OtherAnimalType)
      )
      if (animals.length > 0) {
        filters.otherAnimals = animals
      }
    }

    if (sortBy !== undefined) {
      filters.sortBy = sortBy
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
    // Cursor format: timestamp::id using the active sort field (avoids extra DB lookup on pagination)
    const activeSortField = sortBy ?? 'imported_at'
    let nextCursor: string | null = null
    if (hasNextPage && lastPhoto !== undefined) {
      const cursorTimestamp = activeSortField === 'captured_at'
        ? (lastPhoto.captured_at ?? lastPhoto.imported_at)
        : lastPhoto.imported_at
      nextCursor = `${cursorTimestamp}::${lastPhoto.id}`
    }

    // Fetch quality status and generate signed URLs in parallel for performance
    const photoIds = photosToReturn.map((p) => p.id)

    // Collect all file paths for batch URL generation (much faster than individual calls)
    const allPaths: string[] = []
    const thumbnailPaths: string[] = []
    const imagePaths: string[] = []

    for (const photo of photosToReturn) {
      if (photo.thumbnail_path) {
        thumbnailPaths.push(photo.thumbnail_path)
        allPaths.push(photo.thumbnail_path)
      }
      allPaths.push(photo.file_path)
      imagePaths.push(photo.file_path)
    }

    // Build quality status query promise
    const qualityPromise = photoIds.length > 0
      ? supabase
          .from('detections')
          .select('image_id, quality_status')
          .in('image_id', photoIds)
          .not('quality_status', 'is', null)
      : Promise.resolve({ data: null })

    // Execute batch URL generation and quality query in parallel
    const [urlResult, qualityResult] = await Promise.all([
      getSignedViewUrls(allPaths),
      qualityPromise,
    ])

    const urlMap = urlResult.data

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
        imageUrl: urlMap.get(photo.file_path) ?? null,
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
