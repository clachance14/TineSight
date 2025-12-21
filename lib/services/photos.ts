import { createClient } from '@/lib/supabase/server'
import type { Image, ImageInsert, ImageUpdate, Detection, Json } from '@/types/database'

// Sort field options - extended for faceted sidebar
export type PhotoSortField =
  | 'captured_at'
  | 'imported_at'
  | 'confidence'
  | 'points'
  | 'size_class'
  | 'deer_name'
  | 'deer_count'

// Sort direction
export type PhotoSortDirection = 'asc' | 'desc'

// Result type for area filter helper
interface AreaFilterResult {
  batchIds: string[] | null  // null means no filter needed, [] means no matches
  includeNullBatchId: boolean  // Whether to also include batch_id IS NULL
}

/**
 * Helper to get batch IDs for area filtering
 * Returns batch IDs to filter by, or indicates if no filter is needed
 */
async function getAreaFilterBatchIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  areaName: string
): Promise<AreaFilterResult> {
  if (areaName === '__no_area__') {
    // Get batches without area_name (null)
    const { data: noAreaBatches } = await supabase
      .from('processing_batches')
      .select('id')
      .eq('user_id', userId)
      .is('area_name', null)

    const batchIds = noAreaBatches?.map(b => b.id) ?? []
    // Include both: batches with null area AND images with null batch_id
    return { batchIds, includeNullBatchId: true }
  } else {
    // Get batches with the specified area_name
    const { data: areaBatches } = await supabase
      .from('processing_batches')
      .select('id')
      .eq('user_id', userId)
      .eq('area_name', areaName)

    if (areaBatches && areaBatches.length > 0) {
      return { batchIds: areaBatches.map(b => b.id), includeNullBatchId: false }
    } else {
      // No batches found for this area - return empty to indicate no matches
      return { batchIds: [], includeNullBatchId: false }
    }
  }
}

/**
 * Helper to get batch IDs for multi-area filtering (OR logic)
 * Returns batch IDs for any of the selected areas
 */
async function getMultiAreaFilterBatchIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  areaNames: string[]
): Promise<AreaFilterResult> {
  const includesNoArea = areaNames.includes('__no_area__')
  const namedAreas = areaNames.filter(a => a !== '__no_area__')

  let allBatchIds: string[] = []

  // Get batches for named areas
  if (namedAreas.length > 0) {
    const { data: areaBatches } = await supabase
      .from('processing_batches')
      .select('id')
      .eq('user_id', userId)
      .in('area_name', namedAreas)

    if (areaBatches) {
      allBatchIds = areaBatches.map(b => b.id)
    }
  }

  // Get batches with null area_name if "No Area" is selected
  if (includesNoArea) {
    const { data: noAreaBatches } = await supabase
      .from('processing_batches')
      .select('id')
      .eq('user_id', userId)
      .is('area_name', null)

    if (noAreaBatches) {
      allBatchIds = [...allBatchIds, ...noAreaBatches.map(b => b.id)]
    }
  }

  return {
    batchIds: allBatchIds,
    includeNullBatchId: includesNoArea  // Include images with null batch_id if "No Area" selected
  }
}

/**
 * Build OR filter string for other animals (hogs, cows, goats, people, vehicles)
 */
function buildOtherAnimalsOrFilter(animals: OtherAnimalType[]): string {
  const conditions: string[] = []

  for (const animal of animals) {
    switch (animal) {
      case 'hogs':
        conditions.push('has_hogs.is.true')
        break
      case 'cows':
        conditions.push('has_cows.is.true')
        break
      case 'goats':
        conditions.push('has_goats.is.true')
        break
      case 'people':
        conditions.push('has_people.is.true')
        break
      case 'vehicles':
        conditions.push('has_vehicles.is.true')
        break
    }
  }

  return conditions.join(',')
}

// Other animal types for multi-select filter
export type OtherAnimalType = 'hogs' | 'cows' | 'goats' | 'people' | 'vehicles'

// Filter types for querying photos
export interface PhotoFilters {
  status?: string
  hasDeer?: boolean
  hasDetections?: boolean  // true = with detections, false = without, undefined = all
  batchId?: string
  uploadSessionId?: string
  cameraId?: string
  isArchived?: boolean
  qualityStatus?: string
  minConfidence?: number  // 0-100 integer
  sex?: string  // 'buck' | 'doe' | 'fawn' | 'unknown'
  minPoints?: number
  maxPoints?: number
  sizeClass?: string  // 'trophy' | 'standard' | 'basket' | 'spike' | 'unknown'
  dateFrom?: string  // ISO date string
  dateTo?: string  // ISO date string
  deerId?: string  // Filter by named deer
  areaName?: string  // Filter by area name, or '__no_area__' for photos without area (legacy, single)
  areaNames?: string[]  // Multi-select areas (OR logic), can include '__no_area__'
  otherAnimals?: OtherAnimalType[]  // Multi-select other animals (OR logic)
  sortBy?: PhotoSortField  // Sort by capture time or upload time (default: imported_at)
  sortDirection?: PhotoSortDirection  // Sort direction (default: desc for newest first)
  limit?: number
  offset?: number
  cursor?: string  // Format: timestamp::id for cursor-based pagination
}

// Data types for creating and updating photos
export interface CreatePhotoData {
  file_path: string
  batch_id?: string | null
  camera_id?: string | null
  file_size_bytes?: number | null
  captured_at?: string | null
  detection_status?: string
  exif_data?: Json | null
}

export interface UpdatePhotoData {
  camera_id?: string | null
  captured_at?: string | null
  detection_status?: string
  classification?: string | null
  confidence?: number | null
  is_archived?: boolean
}

// Extended photo type with detections
export interface PhotoWithDetections extends Image {
  detections: Detection[]
}

/**
 * Get paginated list of photos for a user with optional filters
 */
export async function getPhotos(
  userId: string,
  filters?: PhotoFilters
): Promise<{
  data: Image[] | null
  error: Error | null
  count: number | null
}> {
  const supabase = await createClient()

  // Determine if we need to filter by detections
  const needsQualityFilter = filters?.qualityStatus !== undefined && filters.qualityStatus !== 'all'
  const needsConfidenceFilter = filters?.minConfidence !== undefined
  const needsSexFilter = filters?.sex !== undefined
  const needsSizeClassFilter = filters?.sizeClass !== undefined
  const needsPointsFilter = filters?.minPoints !== undefined || filters?.maxPoints !== undefined
  const needsDeerFilter = filters?.deerId !== undefined
  const needsHasDetectionsFilter = filters?.hasDetections !== undefined

  // If filtering by detection-related fields, we need to join with detections
  if (needsQualityFilter || needsConfidenceFilter || needsSexFilter || needsSizeClassFilter || needsPointsFilter || needsDeerFilter || needsHasDetectionsFilter) {

    // For hasDetections filter, we need ALL image_ids with any detection (unfiltered)
    let allImageIdsWithDetections: string[] = []
    if (needsHasDetectionsFilter) {
      const { data: allDetections } = await supabase
        .from('detections')
        .select('image_id')
        .is('deleted_at', null)
      allImageIdsWithDetections = [...new Set((allDetections ?? []).map((d: { image_id: string }) => d.image_id))]
    }

    // Build detection query based on OTHER filters (not hasDetections)
    let detectionQuery = supabase.from('detections').select('image_id, estimated_point_range')
      .is('deleted_at', null)  // Exclude soft-deleted detections

    // Apply quality status filter
    if (needsQualityFilter) {
      detectionQuery = detectionQuery.eq('quality_status', filters!.qualityStatus!)
    }

    // Apply confidence filter (convert 0-100 to 0-1 scale)
    if (needsConfidenceFilter) {
      const threshold = filters!.minConfidence! / 100
      detectionQuery = detectionQuery.gte('confidence', threshold)
    }

    // Apply sex filter
    if (needsSexFilter) {
      detectionQuery = detectionQuery.eq('sex', filters!.sex!)
    }

    // Apply size class filter
    if (needsSizeClassFilter) {
      detectionQuery = detectionQuery.eq('size_class', filters!.sizeClass!)
    }

    // Apply deer filter
    if (needsDeerFilter) {
      detectionQuery = detectionQuery.eq('deer_id', filters!.deerId!)
    }

    const { data: detections, error: detectionsError } = await detectionQuery

    if (detectionsError !== null) {
      return { data: null, error: detectionsError, count: null }
    }

    // Filter detections by point range if needed
    let filteredDetections = detections ?? []
    if (needsPointsFilter) {
      filteredDetections = filteredDetections.filter((d: { estimated_point_range: string | null }) => {
        if (!d.estimated_point_range) return false

        // Parse point range (e.g., "8-10" or "10-12")
        const match = d.estimated_point_range.match(/(\d+)-(\d+)/)
        if (!match) return false

        const minRange = parseInt(match[1]!, 10)
        const maxRange = parseInt(match[2]!, 10)

        // Check if range overlaps with filter criteria
        if (filters?.minPoints !== undefined && maxRange < filters.minPoints) return false
        if (filters?.maxPoints !== undefined && minRange > filters.maxPoints) return false

        return true
      })
    }

    // Get unique image IDs that match the filtered detection criteria
    const filteredImageIds = [...new Set(filteredDetections.map((d: { image_id: string }) => d.image_id))]

    // Build query with image ID filter
    let query = supabase
      .from('images')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)

    // Handle hasDetections filter - uses ALL detections, not filtered ones
    if (filters?.hasDetections === false) {
      // Show images WITHOUT any detections
      if (allImageIdsWithDetections.length > 0) {
        query = query.not('id', 'in', `(${allImageIdsWithDetections.join(',')})`)
      }
      // If no images have detections, all images match (no filter needed)
    } else if (filters?.hasDetections === true) {
      // Show images WITH detections (any detection, then apply other filters)
      // If other filters are also active, intersect with those
      const hasOtherFilters = needsQualityFilter || needsConfidenceFilter || needsSexFilter || needsSizeClassFilter || needsPointsFilter || needsDeerFilter
      const imageIdsToUse = hasOtherFilters ? filteredImageIds : allImageIdsWithDetections

      if (imageIdsToUse.length === 0) {
        return { data: [], error: null, count: 0 }
      }
      query = query.in('id', imageIdsToUse)
    } else {
      // hasDetections is undefined but other detection filters are active
      if (filteredImageIds.length === 0) {
        return { data: [], error: null, count: 0 }
      }
      query = query.in('id', filteredImageIds)
    }

    // Apply dynamic ordering based on sortBy (default: imported_at)
    const sortField = filters?.sortBy ?? 'imported_at'
    if (sortField === 'captured_at') {
      // Photos without captured_at (null) should appear last
      query = query
        .order('captured_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
    } else {
      query = query
        .order('imported_at', { ascending: false })
        .order('id', { ascending: false })
    }

    // Apply other filters
    if (filters?.status !== undefined) {
      query = query.eq('detection_status', filters.status)
    }

    if (filters?.hasDeer !== undefined) {
      if (filters.hasDeer) {
        query = query.not('classification', 'is', null)
      } else {
        query = query.is('classification', null)
      }
    }

    // Filter by upload session (batches linked to session)
    if (filters?.uploadSessionId !== undefined) {
      // Subquery to get batch IDs that belong to this session
      const { data: sessionBatches } = await supabase
        .from('processing_batches')
        .select('id')
        .eq('upload_session_id', filters.uploadSessionId)

      if (sessionBatches && sessionBatches.length > 0) {
        const batchIds = sessionBatches.map(b => b.id)
        query = query.in('batch_id', batchIds)
      } else {
        // No batches found for this session, return empty
        return { data: [], error: null, count: 0 }
      }
    }

    // Filter by area name (via processing_batches) - legacy single select
    if (filters?.areaName !== undefined && !filters?.areaNames?.length) {
      const areaResult = await getAreaFilterBatchIds(supabase, userId, filters.areaName)
      if (areaResult.batchIds !== null) {
        if (areaResult.batchIds.length === 0 && !areaResult.includeNullBatchId) {
          // No matches found
          return { data: [], error: null, count: 0 }
        }
        if (areaResult.includeNullBatchId) {
          // Include both batches with null area AND images with null batch_id
          if (areaResult.batchIds.length > 0) {
            query = query.or(`batch_id.in.(${areaResult.batchIds.join(',')}),batch_id.is.null`)
          } else {
            query = query.is('batch_id', null)
          }
        } else {
          query = query.in('batch_id', areaResult.batchIds)
        }
      }
    }

    // Filter by multiple area names (OR logic) - new multi-select
    if (filters?.areaNames?.length) {
      const areaResult = await getMultiAreaFilterBatchIds(supabase, userId, filters.areaNames)
      const batchIds = areaResult.batchIds ?? []
      if (batchIds.length === 0 && !areaResult.includeNullBatchId) {
        // No matches found
        return { data: [], error: null, count: 0 }
      }
      if (areaResult.includeNullBatchId) {
        // Include both batches matching areas AND images with null batch_id
        if (batchIds.length > 0) {
          query = query.or(`batch_id.in.(${batchIds.join(',')}),batch_id.is.null`)
        } else {
          query = query.is('batch_id', null)
        }
      } else if (batchIds.length > 0) {
        query = query.in('batch_id', batchIds)
      }
    }

    // Filter by other animals (OR logic) - show photos with ANY selected animal
    if (filters?.otherAnimals?.length) {
      const orFilter = buildOtherAnimalsOrFilter(filters.otherAnimals)
      if (orFilter) {
        query = query.or(orFilter)
      }
    }

    if (filters?.cameraId !== undefined) {
      query = query.eq('camera_id', filters.cameraId)
    }

    if (filters?.isArchived !== undefined) {
      query = query.eq('is_archived', filters.isArchived)
    }

    // Apply date range filters
    if (filters?.dateFrom !== undefined) {
      query = query.gte('captured_at', filters.dateFrom)
    }

    if (filters?.dateTo !== undefined) {
      query = query.lte('captured_at', filters.dateTo)
    }

    // Apply cursor-based pagination using the active sort field
    // Cursor format: timestamp::id (no DB lookup needed)
    if (filters?.cursor !== undefined) {
      const [cursorTimestamp, cursorId] = filters.cursor.split('::')
      if (cursorTimestamp && cursorId) {
        // Use the same field we're sorting by
        const cursorField = sortField
        // Filter for photos that come after the cursor (descending order)
        query = query.or(
          `${cursorField}.lt.${cursorTimestamp},and(${cursorField}.eq.${cursorTimestamp},id.lt.${cursorId})`
        )
      }
    }

    // Apply pagination
    const limit = filters?.limit ?? 50
    const offset = filters?.offset ?? 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error !== null) {
      return { data: null, error, count: null }
    }

    return { data, error: null, count }
  }

  // Standard query without detection-based filters
  // Apply dynamic ordering based on sortBy (default: imported_at)
  const sortField = filters?.sortBy ?? 'imported_at'

  let query = supabase
    .from('images')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)

  if (sortField === 'captured_at') {
    // Photos without captured_at (null) should appear last
    query = query
      .order('captured_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
  } else {
    query = query
      .order('imported_at', { ascending: false })
      .order('id', { ascending: false })
  }

  // Apply filters
  if (filters?.status !== undefined) {
    query = query.eq('detection_status', filters.status)
  }

  if (filters?.hasDeer !== undefined) {
    if (filters.hasDeer) {
      query = query.not('classification', 'is', null)
    } else {
      query = query.is('classification', null)
    }
  }

  // Filter by upload session (batches linked to session)
  if (filters?.uploadSessionId !== undefined) {
    // Subquery to get batch IDs that belong to this session
    const { data: sessionBatches } = await supabase
      .from('processing_batches')
      .select('id')
      .eq('upload_session_id', filters.uploadSessionId)

    if (sessionBatches && sessionBatches.length > 0) {
      const batchIds = sessionBatches.map(b => b.id)
      query = query.in('batch_id', batchIds)
    } else {
      // No batches found for this session, return empty
      return { data: [], error: null, count: 0 }
    }
  }

  // Filter by area name (via processing_batches) - legacy single select
  if (filters?.areaName !== undefined && !filters?.areaNames?.length) {
    const areaResult = await getAreaFilterBatchIds(supabase, userId, filters.areaName)
    if (areaResult.batchIds !== null) {
      if (areaResult.batchIds.length === 0 && !areaResult.includeNullBatchId) {
        // No matches found
        return { data: [], error: null, count: 0 }
      }
      if (areaResult.includeNullBatchId) {
        // Include both batches with null area AND images with null batch_id
        if (areaResult.batchIds.length > 0) {
          query = query.or(`batch_id.in.(${areaResult.batchIds.join(',')}),batch_id.is.null`)
        } else {
          query = query.is('batch_id', null)
        }
      } else {
        query = query.in('batch_id', areaResult.batchIds)
      }
    }
  }

  // Filter by multiple area names (OR logic) - new multi-select
  if (filters?.areaNames?.length) {
    const areaResult = await getMultiAreaFilterBatchIds(supabase, userId, filters.areaNames)
    const batchIds = areaResult.batchIds ?? []
    if (batchIds.length === 0 && !areaResult.includeNullBatchId) {
      // No matches found
      return { data: [], error: null, count: 0 }
    }
    if (areaResult.includeNullBatchId) {
      // Include both batches matching areas AND images with null batch_id
      if (batchIds.length > 0) {
        query = query.or(`batch_id.in.(${batchIds.join(',')}),batch_id.is.null`)
      } else {
        query = query.is('batch_id', null)
      }
    } else if (batchIds.length > 0) {
      query = query.in('batch_id', batchIds)
    }
  }

  // Filter by other animals (OR logic) - show photos with ANY selected animal
  if (filters?.otherAnimals?.length) {
    const orFilter = buildOtherAnimalsOrFilter(filters.otherAnimals)
    if (orFilter) {
      query = query.or(orFilter)
    }
  }

  if (filters?.cameraId !== undefined) {
    query = query.eq('camera_id', filters.cameraId)
  }

  if (filters?.isArchived !== undefined) {
    query = query.eq('is_archived', filters.isArchived)
  }

  // Apply date range filters
  if (filters?.dateFrom !== undefined) {
    query = query.gte('captured_at', filters.dateFrom)
  }

  if (filters?.dateTo !== undefined) {
    query = query.lte('captured_at', filters.dateTo)
  }

  // Apply cursor-based pagination using the active sort field
  // Cursor format: timestamp::id (no DB lookup needed)
  if (filters?.cursor !== undefined) {
    const [cursorTimestamp, cursorId] = filters.cursor.split('::')
    if (cursorTimestamp && cursorId) {
      // Use the same field we're sorting by
      const cursorField = sortField
      // Filter for photos that come after the cursor (descending order)
      query = query.or(
        `${cursorField}.lt.${cursorTimestamp},and(${cursorField}.eq.${cursorTimestamp},id.lt.${cursorId})`
      )
    }
  }

  // Apply pagination
  const limit = filters?.limit ?? 50
  const offset = filters?.offset ?? 0
  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error !== null) {
    return { data: null, error, count: null }
  }

  return { data, error: null, count }
}

/**
 * Get all photo IDs matching filters (lightweight, for bulk selection)
 * Returns only IDs without pagination - use for "select all matching" feature
 */
export async function getPhotoIds(
  userId: string,
  filters?: PhotoFilters
): Promise<{
  data: string[] | null
  error: Error | null
  count: number
}> {
  const supabase = await createClient()

  // Determine if we need to filter by detections
  const needsQualityFilter = filters?.qualityStatus !== undefined && filters.qualityStatus !== 'all'
  const needsConfidenceFilter = filters?.minConfidence !== undefined
  const needsSexFilter = filters?.sex !== undefined
  const needsSizeClassFilter = filters?.sizeClass !== undefined
  const needsPointsFilter = filters?.minPoints !== undefined || filters?.maxPoints !== undefined
  const needsDeerFilter = filters?.deerId !== undefined
  const needsHasDetectionsFilter = filters?.hasDetections !== undefined

  // If filtering by detection-related fields, we need to join with detections
  if (needsQualityFilter || needsConfidenceFilter || needsSexFilter || needsSizeClassFilter || needsPointsFilter || needsDeerFilter || needsHasDetectionsFilter) {

    // For hasDetections filter, we need ALL image_ids with any detection (unfiltered)
    let allImageIdsWithDetections: string[] = []
    if (needsHasDetectionsFilter) {
      const { data: allDetections } = await supabase
        .from('detections')
        .select('image_id')
        .is('deleted_at', null)
      allImageIdsWithDetections = [...new Set((allDetections ?? []).map((d: { image_id: string }) => d.image_id))]
    }

    // Build detection query based on OTHER filters (not hasDetections)
    let detectionQuery = supabase.from('detections').select('image_id, estimated_point_range')
      .is('deleted_at', null)

    if (needsQualityFilter) {
      detectionQuery = detectionQuery.eq('quality_status', filters!.qualityStatus!)
    }
    if (needsConfidenceFilter) {
      const threshold = filters!.minConfidence! / 100
      detectionQuery = detectionQuery.gte('confidence', threshold)
    }
    if (needsSexFilter) {
      detectionQuery = detectionQuery.eq('sex', filters!.sex!)
    }
    if (needsSizeClassFilter) {
      detectionQuery = detectionQuery.eq('size_class', filters!.sizeClass!)
    }
    if (needsDeerFilter) {
      detectionQuery = detectionQuery.eq('deer_id', filters!.deerId!)
    }

    const { data: detections, error: detectionsError } = await detectionQuery

    if (detectionsError !== null) {
      return { data: null, error: detectionsError, count: 0 }
    }

    // Filter detections by point range if needed
    let filteredDetections = detections ?? []
    if (needsPointsFilter) {
      filteredDetections = filteredDetections.filter((d: { estimated_point_range: string | null }) => {
        if (!d.estimated_point_range) return false
        const match = d.estimated_point_range.match(/(\d+)-(\d+)/)
        if (!match) return false
        const minRange = parseInt(match[1]!, 10)
        const maxRange = parseInt(match[2]!, 10)
        if (filters?.minPoints !== undefined && maxRange < filters.minPoints) return false
        if (filters?.maxPoints !== undefined && minRange > filters.maxPoints) return false
        return true
      })
    }

    const filteredImageIds = [...new Set(filteredDetections.map((d: { image_id: string }) => d.image_id))]

    // Build query - select only id
    let query = supabase
      .from('images')
      .select('id')
      .eq('user_id', userId)

    // Handle hasDetections filter
    if (filters?.hasDetections === false) {
      if (allImageIdsWithDetections.length > 0) {
        query = query.not('id', 'in', `(${allImageIdsWithDetections.join(',')})`)
      }
    } else if (filters?.hasDetections === true) {
      const hasOtherFilters = needsQualityFilter || needsConfidenceFilter || needsSexFilter || needsSizeClassFilter || needsPointsFilter || needsDeerFilter
      const imageIdsToUse = hasOtherFilters ? filteredImageIds : allImageIdsWithDetections
      if (imageIdsToUse.length === 0) {
        return { data: [], error: null, count: 0 }
      }
      query = query.in('id', imageIdsToUse)
    } else {
      if (filteredImageIds.length === 0) {
        return { data: [], error: null, count: 0 }
      }
      query = query.in('id', filteredImageIds)
    }

    // Apply remaining filters (same as getPhotos)
    if (filters?.status !== undefined && filters.status !== 'all') {
      query = query.eq('detection_status', filters.status)
    }
    if (filters?.hasDeer !== undefined) {
      if (filters.hasDeer) {
        query = query.not('classification', 'is', null)
      } else {
        query = query.is('classification', null)
      }
    }
    if (filters?.uploadSessionId !== undefined) {
      const { data: sessionBatches } = await supabase
        .from('processing_batches')
        .select('id')
        .eq('upload_session_id', filters.uploadSessionId)
      if (sessionBatches && sessionBatches.length > 0) {
        query = query.in('batch_id', sessionBatches.map(b => b.id))
      } else {
        return { data: [], error: null, count: 0 }
      }
    }
    if (filters?.areaNames?.length) {
      const areaResult = await getMultiAreaFilterBatchIds(supabase, userId, filters.areaNames)
      const batchIds = areaResult.batchIds ?? []
      if (batchIds.length === 0 && !areaResult.includeNullBatchId) {
        return { data: [], error: null, count: 0 }
      }
      if (areaResult.includeNullBatchId) {
        if (batchIds.length > 0) {
          query = query.or(`batch_id.in.(${batchIds.join(',')}),batch_id.is.null`)
        } else {
          query = query.is('batch_id', null)
        }
      } else if (batchIds.length > 0) {
        query = query.in('batch_id', batchIds)
      }
    }
    if (filters?.otherAnimals?.length) {
      const orFilter = buildOtherAnimalsOrFilter(filters.otherAnimals)
      if (orFilter) {
        query = query.or(orFilter)
        query = query.eq('has_deer', false)
      }
    }
    if (filters?.cameraId !== undefined) {
      query = query.eq('camera_id', filters.cameraId)
    }
    if (filters?.isArchived !== undefined) {
      query = query.eq('is_archived', filters.isArchived)
    }
    if (filters?.dateFrom !== undefined) {
      query = query.gte('captured_at', filters.dateFrom)
    }
    if (filters?.dateTo !== undefined) {
      query = query.lte('captured_at', filters.dateTo)
    }

    const { data, error } = await query

    if (error !== null) {
      return { data: null, error, count: 0 }
    }

    const ids = (data ?? []).map((row: { id: string }) => row.id)
    return { data: ids, error: null, count: ids.length }
  }

  // Standard query without detection-based filters - select only id
  let query = supabase
    .from('images')
    .select('id')
    .eq('user_id', userId)

  if (filters?.status !== undefined && filters.status !== 'all') {
    query = query.eq('detection_status', filters.status)
  }
  if (filters?.hasDeer !== undefined) {
    if (filters.hasDeer) {
      query = query.not('classification', 'is', null)
    } else {
      query = query.is('classification', null)
    }
  }
  if (filters?.uploadSessionId !== undefined) {
    const { data: sessionBatches } = await supabase
      .from('processing_batches')
      .select('id')
      .eq('upload_session_id', filters.uploadSessionId)
    if (sessionBatches && sessionBatches.length > 0) {
      query = query.in('batch_id', sessionBatches.map(b => b.id))
    } else {
      return { data: [], error: null, count: 0 }
    }
  }
  if (filters?.areaNames?.length) {
    const areaResult = await getMultiAreaFilterBatchIds(supabase, userId, filters.areaNames)
    const batchIds = areaResult.batchIds ?? []
    if (batchIds.length === 0 && !areaResult.includeNullBatchId) {
      return { data: [], error: null, count: 0 }
    }
    if (areaResult.includeNullBatchId) {
      if (batchIds.length > 0) {
        query = query.or(`batch_id.in.(${batchIds.join(',')}),batch_id.is.null`)
      } else {
        query = query.is('batch_id', null)
      }
    } else if (batchIds.length > 0) {
      query = query.in('batch_id', batchIds)
    }
  }
  if (filters?.otherAnimals?.length) {
    const orFilter = buildOtherAnimalsOrFilter(filters.otherAnimals)
    if (orFilter) {
      query = query.or(orFilter)
      query = query.eq('has_deer', false)
    }
  }
  if (filters?.cameraId !== undefined) {
    query = query.eq('camera_id', filters.cameraId)
  }
  if (filters?.isArchived !== undefined) {
    query = query.eq('is_archived', filters.isArchived)
  }
  if (filters?.dateFrom !== undefined) {
    query = query.gte('captured_at', filters.dateFrom)
  }
  if (filters?.dateTo !== undefined) {
    query = query.lte('captured_at', filters.dateTo)
  }

  const { data, error } = await query

  if (error !== null) {
    return { data: null, error, count: 0 }
  }

  const ids = (data ?? []).map((row: { id: string }) => row.id)
  return { data: ids, error: null, count: ids.length }
}

/**
 * Get a single photo by ID with its detections
 */
export async function getPhoto(
  userId: string,
  photoId: string
): Promise<{
  data: PhotoWithDetections | null
  error: Error | null
}> {
  const supabase = await createClient()

  // Get photo
  const { data: photo, error: photoError } = await supabase
    .from('images')
    .select('*')
    .eq('id', photoId)
    .eq('user_id', userId)
    .single()

  if (photoError !== null) {
    return { data: null, error: photoError }
  }

  // Get detections for this photo (with deer name if linked)
  const { data: detections, error: detectionsError } = await supabase
    .from('detections')
    .select('*, deer:deer_id(id, name)')
    .eq('image_id', photoId)

  if (detectionsError !== null) {
    return { data: null, error: detectionsError }
  }

  const photoWithDetections: PhotoWithDetections = {
    ...(photo as Image),
    detections: detections ?? [],
  }

  return { data: photoWithDetections, error: null }
}

/**
 * Get adjacent photo IDs (prev/next) for navigation
 * Returns prev (newer) and next (older) photos based on imported_at order
 * When filters are provided, navigation is constrained to matching photos
 */
export async function getAdjacentPhotos(
  userId: string,
  currentPhotoId: string,
  filters?: Omit<PhotoFilters, 'limit' | 'offset' | 'cursor'>
): Promise<{
  prevId: string | null
  nextId: string | null
}> {
  const supabase = await createClient()

  // Check if any detection-based filters are active
  const needsQualityFilter = filters?.qualityStatus !== undefined && filters.qualityStatus !== 'all'
  const needsConfidenceFilter = filters?.minConfidence !== undefined
  const needsSexFilter = filters?.sex !== undefined
  const needsSizeClassFilter = filters?.sizeClass !== undefined
  const needsPointsFilter = filters?.minPoints !== undefined || filters?.maxPoints !== undefined
  const needsDeerFilter = filters?.deerId !== undefined
  const needsHasDetectionsFilter = filters?.hasDetections !== undefined
  const hasDetectionFilters = needsQualityFilter || needsConfidenceFilter || needsSexFilter || needsSizeClassFilter || needsPointsFilter || needsDeerFilter || needsHasDetectionsFilter

  let allImageIdsWithDetections: string[] = []
  let filteredImageIds: string[] = []

  // If detection filters are active, get matching image IDs first
  if (hasDetectionFilters) {
    // For hasDetections filter, we need ALL image_ids with any detection (unfiltered)
    if (needsHasDetectionsFilter) {
      const { data: allDetections } = await supabase
        .from('detections')
        .select('image_id')
        .is('deleted_at', null)
      allImageIdsWithDetections = [...new Set((allDetections ?? []).map((d: { image_id: string }) => d.image_id))]
    }

    // Build detection query based on OTHER filters (not hasDetections)
    let detectionQuery = supabase.from('detections').select('image_id, estimated_point_range')
      .is('deleted_at', null)  // Exclude soft-deleted detections

    if (needsQualityFilter) {
      detectionQuery = detectionQuery.eq('quality_status', filters!.qualityStatus!)
    }
    if (needsConfidenceFilter) {
      const threshold = filters!.minConfidence! / 100
      detectionQuery = detectionQuery.gte('confidence', threshold)
    }
    if (needsSexFilter) {
      detectionQuery = detectionQuery.eq('sex', filters!.sex!)
    }
    if (needsSizeClassFilter) {
      detectionQuery = detectionQuery.eq('size_class', filters!.sizeClass!)
    }
    if (needsDeerFilter) {
      detectionQuery = detectionQuery.eq('deer_id', filters!.deerId!)
    }

    const { data: detections } = await detectionQuery

    let filteredDetections = detections ?? []
    if (needsPointsFilter) {
      filteredDetections = filteredDetections.filter((d: { estimated_point_range: string | null }) => {
        if (!d.estimated_point_range) return false
        const match = d.estimated_point_range.match(/(\d+)-(\d+)/)
        if (!match) return false
        const minRange = parseInt(match[1]!, 10)
        const maxRange = parseInt(match[2]!, 10)
        if (filters?.minPoints !== undefined && maxRange < filters.minPoints) return false
        if (filters?.maxPoints !== undefined && minRange > filters.maxPoints) return false
        return true
      })
    }

    filteredImageIds = [...new Set(filteredDetections.map((d: { image_id: string }) => d.image_id))]
  }

  // Build query for photo IDs
  let query = supabase
    .from('images')
    .select('id')
    .eq('user_id', userId)
    .order('imported_at', { ascending: false })
    .order('id', { ascending: false })

  // Apply detection-based filters
  if (hasDetectionFilters) {
    if (filters?.hasDetections === false) {
      // Show images WITHOUT any detections
      if (allImageIdsWithDetections.length > 0) {
        query = query.not('id', 'in', `(${allImageIdsWithDetections.join(',')})`)
      }
    } else if (filters?.hasDetections === true) {
      // Show images WITH detections
      const hasOtherFilters = needsQualityFilter || needsConfidenceFilter || needsSexFilter || needsSizeClassFilter || needsPointsFilter || needsDeerFilter
      const imageIdsToUse = hasOtherFilters ? filteredImageIds : allImageIdsWithDetections
      if (imageIdsToUse.length === 0) {
        return { prevId: null, nextId: null }
      }
      query = query.in('id', imageIdsToUse)
    } else if (filteredImageIds.length > 0) {
      // Other detection filters are active (not hasDetections)
      query = query.in('id', filteredImageIds)
    } else if (needsQualityFilter || needsConfidenceFilter || needsSexFilter || needsSizeClassFilter || needsPointsFilter || needsDeerFilter) {
      // Other detection filters active but no matches
      return { prevId: null, nextId: null }
    }
  }

  // Apply photo-level filters
  if (filters?.status !== undefined) {
    query = query.eq('detection_status', filters.status)
  }
  if (filters?.hasDeer !== undefined) {
    if (filters.hasDeer) {
      query = query.not('classification', 'is', null)
    } else {
      query = query.is('classification', null)
    }
  }
  if (filters?.cameraId !== undefined) {
    query = query.eq('camera_id', filters.cameraId)
  }
  if (filters?.isArchived !== undefined) {
    query = query.eq('is_archived', filters.isArchived)
  }
  if (filters?.dateFrom !== undefined) {
    query = query.gte('captured_at', filters.dateFrom)
  }
  if (filters?.dateTo !== undefined) {
    query = query.lte('captured_at', filters.dateTo)
  }

  const { data: photos } = await query

  if (!photos || photos.length === 0) {
    return { prevId: null, nextId: null }
  }

  // Find current photo index
  const currentIndex = photos.findIndex(p => p.id === currentPhotoId)

  if (currentIndex === -1) {
    return { prevId: null, nextId: null }
  }

  // prev = newer photo (lower index), next = older photo (higher index)
  const prevId = currentIndex > 0 ? photos[currentIndex - 1]?.id ?? null : null
  const nextId = currentIndex < photos.length - 1 ? photos[currentIndex + 1]?.id ?? null : null

  return { prevId, nextId }
}

/**
 * Create a new photo record
 */
export async function createPhoto(
  userId: string,
  data: CreatePhotoData
): Promise<{
  data: Image | null
  error: Error | null
}> {
  const supabase = await createClient()

  const photoData: ImageInsert = {
    user_id: userId,
    file_path: data.file_path,
    ...(data.batch_id !== undefined && { batch_id: data.batch_id }),
    ...(data.camera_id !== undefined && { camera_id: data.camera_id }),
    ...(data.file_size_bytes !== undefined && { file_size_bytes: data.file_size_bytes }),
    ...(data.captured_at !== undefined && { captured_at: data.captured_at }),
    ...(data.exif_data !== undefined && { exif_data: data.exif_data }),
    detection_status: data.detection_status ?? 'pending',
  }

  const { data: photo, error } = await supabase
    .from('images')
    .insert(photoData as never)
    .select()
    .single()

  if (error !== null) {
    return { data: null, error }
  }

  return { data: photo, error: null }
}

/**
 * Update an existing photo
 */
export async function updatePhoto(
  userId: string,
  photoId: string,
  data: UpdatePhotoData
): Promise<{
  data: Image | null
  error: Error | null
}> {
  const supabase = await createClient()

  // Build update data without user_id
  const updateData: ImageUpdate = {}

  if (data.camera_id !== undefined) {
    updateData.camera_id = data.camera_id
  }
  if (data.captured_at !== undefined) {
    updateData.captured_at = data.captured_at
  }
  if (data.detection_status !== undefined) {
    updateData.detection_status = data.detection_status
  }
  if (data.classification !== undefined) {
    updateData.classification = data.classification
  }
  if (data.confidence !== undefined) {
    updateData.confidence = data.confidence
  }
  if (data.is_archived !== undefined) {
    updateData.is_archived = data.is_archived
  }

  const { data: photo, error } = await supabase
    .from('images')
    .update(updateData as never)
    .eq('id', photoId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error !== null) {
    return { data: null, error }
  }

  return { data: photo, error: null }
}

/**
 * Delete a photo permanently including storage files
 * Database cascade will handle detection records, but we need to clean up storage
 */
export async function deletePhoto(
  userId: string,
  photoId: string
): Promise<{
  error: Error | null
}> {
  const supabase = await createClient()

  // First, get the photo to retrieve file paths
  const { data: photo, error: fetchError } = await supabase
    .from('images')
    .select('file_path, thumbnail_path')
    .eq('id', photoId)
    .eq('user_id', userId)
    .single()

  if (fetchError !== null) {
    return { error: fetchError }
  }

  // Get detection crop paths before deletion
  const { data: detections } = await supabase
    .from('detections')
    .select('crop_file_path')
    .eq('image_id', photoId)

  // Collect all storage paths to delete
  const storagePaths: string[] = []

  if (photo.file_path) {
    storagePaths.push(photo.file_path)
  }
  if (photo.thumbnail_path) {
    storagePaths.push(photo.thumbnail_path)
  }
  if (detections) {
    for (const d of detections) {
      if (d.crop_file_path) {
        storagePaths.push(d.crop_file_path)
      }
    }
  }

  // Delete database record first (cascades to detections)
  const { error: deleteError } = await supabase
    .from('images')
    .delete()
    .eq('id', photoId)
    .eq('user_id', userId)

  if (deleteError !== null) {
    return { error: deleteError }
  }

  // Delete storage files (non-blocking, log errors but don't fail)
  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from('photos')
      .remove(storagePaths)

    if (storageError !== null) {
      console.error('Failed to delete storage files:', storageError)
      // Don't return error - DB deletion was successful
    }
  }

  return { error: null }
}

/**
 * Update detection status for a photo (used by background jobs)
 */
export async function updateDetectionStatus(
  photoId: string,
  status: string,
  errorMessage?: string
): Promise<{
  error: Error | null
}> {
  const supabase = await createClient()

  const updateData: ImageUpdate = {
    detection_status: status,
  }

  // Add error details if failed
  if (status === 'failed' && errorMessage !== undefined) {
    updateData.error_message = errorMessage
  }

  const { error } = await supabase
    .from('images')
    .update(updateData as never)
    .eq('id', photoId)

  return { error }
}

/**
 * Get a signed URL for uploading a photo
 */
export async function getSignedUploadUrl(
  userId: string,
  batchId: string,
  filename: string
): Promise<{
  data: { signedUrl: string; path: string } | null
  error: Error | null
}> {
  const supabase = await createClient()

  // Construct storage path: user_id/batch_id/filename
  const path = `${userId}/${batchId}/${filename}`

  // Get signed upload URL (valid for 1 hour)
  const { data, error } = await supabase.storage
    .from('photos')
    .createSignedUploadUrl(path)

  if (error !== null) {
    return { data: null, error }
  }

  return {
    data: {
      signedUrl: data.signedUrl,
      path,
    },
    error: null,
  }
}

/**
 * Get a signed URL for viewing a photo
 */
export async function getSignedViewUrl(
  filePath: string
): Promise<{
  data: string | null
  error: Error | null
}> {
  const supabase = await createClient()

  // Get signed URL (valid for 1 hour)
  const { data, error } = await supabase.storage
    .from('photos')
    .createSignedUrl(filePath, 3600)

  if (error !== null) {
    return { data: null, error }
  }

  return { data: data.signedUrl, error: null }
}

/**
 * Get signed URLs for multiple photos in a single batch request
 * Much more efficient than calling getSignedViewUrl for each file
 */
export async function getSignedViewUrls(
  filePaths: string[]
): Promise<{
  data: Map<string, string>
  errors: string[]
}> {
  if (filePaths.length === 0) {
    return { data: new Map(), errors: [] }
  }

  const supabase = await createClient()

  // Batch request for all URLs at once (valid for 1 hour)
  const { data, error } = await supabase.storage
    .from('photos')
    .createSignedUrls(filePaths, 3600)

  const urlMap = new Map<string, string>()
  const errors: string[] = []

  if (error !== null) {
    errors.push(error.message)
    return { data: urlMap, errors }
  }

  // Map results back to paths
  if (data) {
    for (const item of data) {
      if (item.error) {
        errors.push(`${item.path}: ${item.error}`)
      } else if (item.signedUrl && item.path) {
        urlMap.set(item.path, item.signedUrl)
      }
    }
  }

  return { data: urlMap, errors }
}

/**
 * Retry a single failed photo
 */
export async function retryPhoto(
  userId: string,
  photoId: string
): Promise<{
  data: Image | null
  error: Error | null
}> {
  const supabase = await createClient()

  // First, verify photo exists and belongs to user
  const { data: photo, error: fetchError } = await supabase
    .from('images')
    .select('*')
    .eq('id', photoId)
    .eq('user_id', userId)
    .single()

  if (fetchError !== null) {
    return { data: null, error: fetchError }
  }

  // Check detection_status is 'failed'
  const photoData = photo as Image
  if (photoData.detection_status !== 'failed') {
    return {
      data: null,
      error: new Error('Photo must have detection_status of "failed" to retry'),
    }
  }

  // Reset photo for retry
  const updateData: ImageUpdate = {
    retry_count: 0,
    detection_status: 'pending',
    error_message: null,
  }

  const { data: updatedPhoto, error: updateError } = await supabase
    .from('images')
    .update(updateData as never)
    .eq('id', photoId)
    .eq('user_id', userId)
    .select()
    .single()

  if (updateError !== null) {
    return { data: null, error: updateError }
  }

  return { data: updatedPhoto, error: null }
}

/**
 * Retry all failed photos for a user (optionally filtered by batchId)
 */
export async function retryAllFailed(
  userId: string,
  batchId?: string
): Promise<{
  data: { count: number } | null
  error: Error | null
}> {
  const supabase = await createClient()

  // Build query for failed photos
  let query = supabase
    .from('images')
    .select('id', { count: 'exact' })
    .eq('user_id', userId)
    .eq('detection_status', 'failed')

  // Optionally filter by batchId
  if (batchId !== undefined) {
    query = query.eq('batch_id', batchId)
  }

  // Get count of failed photos
  const { count, error: countError } = await query

  if (countError !== null) {
    return { data: null, error: countError }
  }

  if (count === 0) {
    return { data: { count: 0 }, error: null }
  }

  // Reset all failed photos
  const updateData: ImageUpdate = {
    retry_count: 0,
    detection_status: 'pending',
    error_message: null,
  }

  let updateQuery = supabase
    .from('images')
    .update(updateData as never)
    .eq('user_id', userId)
    .eq('detection_status', 'failed')

  // Apply batchId filter if provided
  if (batchId !== undefined) {
    updateQuery = updateQuery.eq('batch_id', batchId)
  }

  const { error: updateError } = await updateQuery

  if (updateError !== null) {
    return { data: null, error: updateError }
  }

  return { data: { count: count ?? 0 }, error: null }
}

/**
 * Update location_id for multiple photos at once (bulk operation)
 * @param userId - User ID for RLS check
 * @param photoIds - Array of photo IDs to update
 * @param locationId - Location ID to assign (null to clear location)
 * @returns Count of updated photos
 */
export async function updatePhotosLocation(
  userId: string,
  photoIds: string[],
  locationId: string | null
): Promise<{
  data: { count: number } | null
  error: Error | null
}> {
  if (photoIds.length === 0) {
    return { data: { count: 0 }, error: null }
  }

  const supabase = await createClient()

  const { count, error } = await supabase
    .from('images')
    .update({ location_id: locationId } as never)
    .eq('user_id', userId)
    .in('id', photoIds)

  if (error !== null) {
    return { data: null, error }
  }

  return { data: { count: count ?? photoIds.length }, error: null }
}

/**
 * Delete multiple photos permanently including storage files (bulk operation)
 * @param userId - User ID for RLS check
 * @param photoIds - Array of photo IDs to delete
 * @returns Count of deleted photos and any storage cleanup errors
 */
export async function deletePhotos(
  userId: string,
  photoIds: string[]
): Promise<{
  data: { deletedCount: number; storageErrors: string[] } | null
  error: Error | null
}> {
  if (photoIds.length === 0) {
    return { data: { deletedCount: 0, storageErrors: [] }, error: null }
  }

  const supabase = await createClient()

  // 1. Get all file paths before deletion
  const { data: photos, error: fetchError } = await supabase
    .from('images')
    .select('id, file_path, thumbnail_path')
    .eq('user_id', userId)
    .in('id', photoIds)

  if (fetchError !== null) {
    return { data: null, error: fetchError }
  }

  // 2. Get detection crop paths
  const { data: detections } = await supabase
    .from('detections')
    .select('crop_file_path')
    .in('image_id', photoIds)

  // 3. Collect all storage paths
  const storagePaths: string[] = []
  for (const photo of photos ?? []) {
    if (photo.file_path) storagePaths.push(photo.file_path)
    if (photo.thumbnail_path) storagePaths.push(photo.thumbnail_path)
  }
  for (const detection of detections ?? []) {
    if (detection.crop_file_path) storagePaths.push(detection.crop_file_path)
  }

  // 4. Delete database records (cascades to detections via FK)
  const { error: deleteError, count } = await supabase
    .from('images')
    .delete()
    .eq('user_id', userId)
    .in('id', photoIds)

  if (deleteError !== null) {
    return { data: null, error: deleteError }
  }

  // 5. Delete storage files in batches (Supabase limit: 1000 per call)
  const storageErrors: string[] = []
  const BATCH_SIZE = 1000

  for (let i = 0; i < storagePaths.length; i += BATCH_SIZE) {
    const batch = storagePaths.slice(i, i + BATCH_SIZE)
    const { error: storageError } = await supabase.storage
      .from('photos')
      .remove(batch)

    if (storageError !== null) {
      storageErrors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${storageError.message}`)
    }
  }

  return {
    data: {
      deletedCount: count ?? photos?.length ?? 0,
      storageErrors,
    },
    error: null,
  }
}

/**
 * Update image with Gemini analysis results
 */
export async function updateImageAnalysis(
  imageId: string,
  analysisData: {
    has_deer: boolean;
    deer_count: number;
    analysis_notes: string | null;
    analyzed_at: string; // ISO timestamp
    detection_status: string;
  }
): Promise<{
  data: Image | null
  error: Error | null
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('images')
    .update({
      has_deer: analysisData.has_deer,
      deer_count: analysisData.deer_count,
      analysis_notes: analysisData.analysis_notes,
      analyzed_at: analysisData.analyzed_at,
      detection_status: analysisData.detection_status,
      error_message: null, // Clear any previous error
    } as never)
    .eq('id', imageId)
    .select()
    .single()

  return { data, error }
}
