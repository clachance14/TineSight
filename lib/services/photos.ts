import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Image, ImageInsert, ImageUpdate, Detection, Json } from '@/types/database'

// Sort field options - extended for faceted sidebar
export type PhotoSortField =
  | 'captured_at'
  | 'imported_at'
  | 'best_score'
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

// Page size for id sweeps that must return a complete set. Requests are clamped by the
// project's PostgREST max-rows regardless; the loops advance by rows actually returned.
const PHOTO_ID_PAGE_SIZE = 1000

/**
 * Resolve the DISTINCT set of image ids matching the detection-level filters.
 *
 * One round-trip via the `get_filtered_detection_images` RPC (migration 050), which
 * does the filtering and the DISTINCT in Postgres and returns the ids as a single-row
 * uuid[]. An array is ONE row, so the `max-rows` ceiling cannot truncate it however
 * many photos the account has.
 *
 * This replaced a prefetch that selected every matching `detections` row and de-duped
 * in JS: unbounded it was silently capped at `max-rows` (losing ~97% of a large
 * account's photos), and paged it cost ~42 sequential round-trips (~5.7s measured).
 *
 * Pass no filters to get every image that has any live detection.
 */
async function resolveMatchedImageIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  filters?: PhotoFilters
): Promise<{ ids: string[]; error: Error | null }> {
  // Built conditionally: `exactOptionalPropertyTypes` rejects explicit undefined,
  // and an omitted arg is what makes the SQL predicate fall through to "no filter".
  const args = {
    p_user_id: userId,
    ...(filters?.qualityStatus !== undefined && filters.qualityStatus !== 'all'
      ? { p_quality_status: filters.qualityStatus }
      : {}),
    ...(filters?.minConfidence !== undefined ? { p_min_confidence: filters.minConfidence / 100 } : {}),
    ...(filters?.sex !== undefined ? { p_sex: filters.sex } : {}),
    ...(filters?.sizeClass !== undefined ? { p_size_class: filters.sizeClass } : {}),
    ...(filters?.deerId !== undefined ? { p_deer_id: filters.deerId } : {}),
    ...(filters?.minPoints !== undefined ? { p_min_points: filters.minPoints } : {}),
    ...(filters?.maxPoints !== undefined ? { p_max_points: filters.maxPoints } : {}),
  }

  const { data, error } = await supabase.rpc('get_filtered_detection_images', args)
  if (error !== null) {
    return { ids: [], error }
  }
  return { ids: data?.[0]?.image_ids ?? [], error: null }
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
  minScore?: number  // photo-level: images.best_score >= minScore (authoritative gross, else estimate)
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

    // Detection-based filtering, resolved in two layers:
    //
    //  - COUNT comes from a prefetch of DISTINCT image_ids (`matchedImageIds`)
    //    pulled from `detections`. That is response data (not a URL), so it never
    //    overflows, and it is an exact distinct count — unlike `count: 'exact'`
    //    over an embedded to-many join, which counts JOIN rows and over-reports
    //    when an image has several matching detections (e.g. doe: 597 join rows
    //    vs 370 distinct images).
    //  - DATA (the page of images) is fetched with a scalable strategy:
    //      (1) `detections!inner(...)` embedded filter by default — Postgres does
    //          the filtering, no image-id list crosses the wire, so it cannot
    //          overflow the PostgREST query-length limit on large result sets.
    //          (The old `.in('id', [...])` approach 500'd once a filter matched a
    //          few hundred photos — e.g. sex=buck.)
    //      (2) an id-list fallback ONLY for the point-range OVERLAP filter (JS-only
    //          on `estimated_point_range`) or detection ABSENCE
    //          (hasDetections === false), neither expressible as an embedded
    //          predicate. Both are selective, so the id list stays small.
    // Point-range is expressible as a SQL predicate since migration 051 (generated
    // point_min/point_max columns), so it no longer forces the id-list fallback.
    // Detection ABSENCE takes a left-join/is-null shape instead, also server-side.
    // Net effect: no image-id list is ever serialized into the query string, which
    // PostgREST rejects somewhere between 250 and 500 uuids (~18KB).
    const canUseInnerJoin = filters?.hasDetections !== false

    // --- Distinct matching image-id set (the exact-count source) ---
    // Only the inner-join path needs it, and only for the COUNT — the data query
    // filters server-side. The absence branch takes its count from its own query,
    // so it skips this entirely rather than scanning detections for a discarded
    // result. With no detection filters the RPC receives no filter args and returns
    // every image that has a live detection, which is the hasDetections===true case.
    let matchedImageIds: string[] = []
    if (canUseInnerJoin) {
      const { ids, error: matchedError } = await resolveMatchedImageIds(supabase, userId, filters)
      if (matchedError !== null) {
        return { data: null, error: matchedError, count: null }
      }
      matchedImageIds = ids
    }

    // Are any NON-detection, NON-pagination filters active? If so the count must
    // also reflect those, so matchedImageIds.length is no longer the total and we
    // fall back to the query's own exact count.
    const hasOtherImageFilters =
      filters?.status !== undefined ||
      filters?.hasDeer !== undefined ||
      filters?.uploadSessionId !== undefined ||
      filters?.areaName !== undefined ||
      (filters?.areaNames?.length ?? 0) > 0 ||
      (filters?.otherAnimals?.length ?? 0) > 0 ||
      filters?.cameraId !== undefined ||
      filters?.isArchived !== undefined ||
      filters?.dateFrom !== undefined ||
      filters?.dateTo !== undefined ||
      filters?.minScore !== undefined

    // Short-circuit when a membership filter matches nothing. (hasDetections ===
    // false is the "absence" case and legitimately matches detection-less images.)
    if (filters?.hasDetections !== false && matchedImageIds.length === 0) {
      return { data: [], error: null, count: 0 }
    }

    // Exact distinct count is available from the prefetch only when we take the
    // inner-join path AND no other image-level filters narrow the set.
    const useExactCount = canUseInnerJoin && !hasOtherImageFilters

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js builder types don't unify across the two select shapes; behaviour is verified empirically
    let query: any
    if (canUseInnerJoin) {
      query = supabase
        .from('images')
        .select('*, detections!inner(id)', useExactCount ? {} : { count: 'exact' })
        .eq('user_id', userId)
        .is('detections.deleted_at', null) // ignore soft-deleted detections
      if (needsQualityFilter) {
        query = query.eq('detections.quality_status', filters!.qualityStatus!)
      }
      if (needsConfidenceFilter) {
        query = query.gte('detections.confidence', filters!.minConfidence! / 100)
      }
      if (needsSexFilter) {
        query = query.eq('detections.sex', filters!.sex!)
      }
      if (needsSizeClassFilter) {
        query = query.eq('detections.size_class', filters!.sizeClass!)
      }
      if (needsDeerFilter) {
        query = query.eq('detections.deer_id', filters!.deerId!)
      }
      if (needsPointsFilter) {
        // Range OVERLAP, same semantics as before: the detection's range must
        // intersect the requested one. Rows whose estimated_point_range does not
        // parse have NULL bounds and are excluded by these comparisons.
        if (filters?.minPoints !== undefined) {
          query = query.gte('detections.point_max', filters.minPoints)
        }
        if (filters?.maxPoints !== undefined) {
          query = query.lte('detections.point_min', filters.maxPoints)
        }
      }
    } else {
      // Detection ABSENCE. Expressed as a left-join that must come back empty, so
      // Postgres evaluates it — the old form sent every id that HAS a detection as
      // a `.not('id','in',(...))` list and overflowed the query string.
      query = supabase
        .from('images')
        .select('*, detections!left(id)', { count: 'exact' })
        .eq('user_id', userId)
        // Constrain the embed to LIVE detections before testing it for emptiness.
        // Without this a photo whose only detection was soft-deleted still has a
        // non-empty embed, so it drops out of "No Deer" — and the RPC that backs
        // "With Deer" filters deleted_at IS NULL, so it drops out of that too. The
        // photo would exist in neither view.
        .is('detections.deleted_at', null)
        .is('detections', null)
    }

    // Apply dynamic ordering based on sortBy (default: imported_at) and sortDirection (default: desc)
    const sortField = filters?.sortBy ?? 'imported_at'
    // Supabase ascending: true = smallest values first (oldest dates)
    // desc (newest) needs ascending: false, asc (oldest) needs ascending: true
    const ascending = filters?.sortDirection === 'asc'
    if (sortField === 'captured_at') {
      // Photos without captured_at (null) should appear last regardless of direction
      query = query
        .order('captured_at', { ascending, nullsFirst: false })
        .order('id', { ascending })
    } else if (sortField === 'best_score') {
      // Highest score first (desc default); un-scored photos last regardless of direction.
      query = query
        .order('best_score', { ascending, nullsFirst: false })
        .order('id', { ascending })
    } else {
      query = query
        .order('imported_at', { ascending })
        .order('id', { ascending })
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

    // Photo-level authoritative-score floor (images.best_score = gross else estimate).
    if (filters?.minScore !== undefined) {
      query = query.gte('best_score', filters.minScore)
    }

    // Apply cursor-based pagination using the active sort field
    // Cursor format: timestamp::id (no DB lookup needed)
    if (filters?.cursor !== undefined) {
      const [cursorTimestamp, cursorId] = filters.cursor.split('::')
      if (cursorTimestamp && cursorId) {
        // Filter for photos that come after the cursor
        // Use .lt for descending (smaller values after), .gt for ascending (larger values after)
        const cmp = ascending ? 'gt' : 'lt'
        // Special handling for captured_at which can be NULL - cursor uses imported_at as fallback
        if (sortField === 'captured_at') {
          // Handle NULL captured_at: compare against both captured_at AND imported_at (for NULL cases)
          query = query.or(
            `captured_at.${cmp}.${cursorTimestamp},` +
            `and(captured_at.eq.${cursorTimestamp},id.${cmp}.${cursorId}),` +
            `and(captured_at.is.null,imported_at.${cmp}.${cursorTimestamp}),` +
            `and(captured_at.is.null,imported_at.eq.${cursorTimestamp},id.${cmp}.${cursorId})`
          )
        } else if (sortField === 'best_score') {
          // best_score sorts desc NULLS LAST. The API encodes the cursor value as
          // the numeric score, or the literal 'null' once paging crosses into the
          // un-scored tail. Scored page: also admit all NULLs (they order after).
          // Null page: only remaining NULLs, tie-broken by id.
          if (cursorTimestamp === 'null') {
            query = query.is('best_score', null).filter('id', cmp, cursorId)
          } else {
            query = query.or(
              `best_score.${cmp}.${cursorTimestamp},` +
              `and(best_score.eq.${cursorTimestamp},id.${cmp}.${cursorId}),` +
              `best_score.is.null`
            )
          }
        } else {
          query = query.or(
            `${sortField}.${cmp}.${cursorTimestamp},and(${sortField}.eq.${cursorTimestamp},id.${cmp}.${cursorId})`
          )
        }
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

    // The inner-join select embeds a `detections` array on each row purely to
    // drive the filter; strip it so the returned shape is plain Image[].
    const cleaned: Image[] | null = data == null
      ? null
      : (data as Array<Record<string, unknown>>).map((row) => {
          if ('detections' in row) {
            const { detections: _omit, ...rest } = row
            return rest as unknown as Image
          }
          return row as unknown as Image
        })

    // Prefer the exact distinct count from the prefetch; only fall back to the
    // query's own count when other image-level filters made the prefetch count
    // insufficient (see useExactCount).
    return { data: cleaned, error: null, count: useExactCount ? matchedImageIds.length : count }
  }

  // Standard query without detection-based filters
  // Apply dynamic ordering based on sortBy (default: imported_at) and sortDirection (default: desc)
  const sortField = filters?.sortBy ?? 'imported_at'
  const ascending = filters?.sortDirection === 'asc'

  let query = supabase
    .from('images')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)

  if (sortField === 'captured_at') {
    // Photos without captured_at (null) should appear last regardless of direction
    query = query
      .order('captured_at', { ascending, nullsFirst: false })
      .order('id', { ascending })
  } else if (sortField === 'best_score') {
    // Highest score first (desc default); un-scored photos last regardless of direction.
    query = query
      .order('best_score', { ascending, nullsFirst: false })
      .order('id', { ascending })
  } else {
    query = query
      .order('imported_at', { ascending })
      .order('id', { ascending })
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

  // Photo-level authoritative-score floor (images.best_score = gross else estimate).
  if (filters?.minScore !== undefined) {
    query = query.gte('best_score', filters.minScore)
  }

  // Apply cursor-based pagination using the active sort field
  // Cursor format: timestamp::id (no DB lookup needed)
  if (filters?.cursor !== undefined) {
    const [cursorTimestamp, cursorId] = filters.cursor.split('::')
    if (cursorTimestamp && cursorId) {
      // Filter for photos that come after the cursor
      // Use .lt for descending (smaller values after), .gt for ascending (larger values after)
      const cmp = ascending ? 'gt' : 'lt'
      // Special handling for captured_at which can be NULL - cursor uses imported_at as fallback
      if (sortField === 'captured_at') {
        // Handle NULL captured_at: compare against both captured_at AND imported_at (for NULL cases)
        query = query.or(
          `captured_at.${cmp}.${cursorTimestamp},` +
          `and(captured_at.eq.${cursorTimestamp},id.${cmp}.${cursorId}),` +
          `and(captured_at.is.null,imported_at.${cmp}.${cursorTimestamp}),` +
          `and(captured_at.is.null,imported_at.eq.${cursorTimestamp},id.${cmp}.${cursorId})`
        )
      } else {
        query = query.or(
          `${sortField}.${cmp}.${cursorTimestamp},and(${sortField}.eq.${cursorTimestamp},id.${cmp}.${cursorId})`
        )
      }
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

    // See getPhotos. The RPC resolves the distinct matching id set in one round-trip,
    // and it is the ANSWER this function returns on the detection-only path below —
    // exact, uncapped, and never serialized into a URL. The absence branch derives
    // its answer from the images query instead, so it skips this.
    let matchedImageIds: string[] = []
    if (filters?.hasDetections !== false) {
      const { ids, error: matchedError } = await resolveMatchedImageIds(supabase, userId, filters)
      if (matchedError !== null) {
        return { data: null, error: matchedError, count: 0 }
      }
      matchedImageIds = ids
    }

    const hasOtherImageFilters =
      (filters?.status !== undefined && filters.status !== 'all') ||
      filters?.hasDeer !== undefined ||
      filters?.uploadSessionId !== undefined ||
      (filters?.areaNames?.length ?? 0) > 0 ||
      (filters?.otherAnimals?.length ?? 0) > 0 ||
      filters?.cameraId !== undefined ||
      filters?.isArchived !== undefined ||
      filters?.dateFrom !== undefined ||
      filters?.dateTo !== undefined ||
      filters?.minScore !== undefined

    // Detection-only: the matching id set IS the answer. Return it directly — exact
    // and scalable, with no images round-trip (avoids the URL-overflow that 500'd
    // on large sets like sex=buck).
    if (filters?.hasDetections !== false && !hasOtherImageFilters) {
      return { data: matchedImageIds, error: null, count: matchedImageIds.length }
    }

    if (filters?.hasDetections !== false && matchedImageIds.length === 0) {
      return { data: [], error: null, count: 0 }
    }

    // Otherwise filter an images query by the detection predicates + the other
    // filters. The predicates go server-side rather than as an id list: PostgREST
    // serializes `.in()` into the query string and rejects it somewhere between 250
    // and 500 uuids (~18KB, measured).
    // Resolve the two filters that need their own round-trip BEFORE building the
    // query, so the factory below stays synchronous and can be re-invoked per page
    // without re-issuing these lookups.
    let sessionBatchIds: string[] | null = null
    if (filters?.uploadSessionId !== undefined) {
      const { data: sessionBatches } = await supabase
        .from('processing_batches')
        .select('id')
        .eq('upload_session_id', filters.uploadSessionId)
      sessionBatchIds = (sessionBatches ?? []).map(b => b.id)
      if (sessionBatchIds.length === 0) {
        return { data: [], error: null, count: 0 }
      }
    }

    let areaResult: AreaFilterResult | null = null
    if (filters?.areaNames?.length) {
      areaResult = await getMultiAreaFilterBatchIds(supabase, userId, filters.areaNames)
      if ((areaResult.batchIds ?? []).length === 0 && !areaResult.includeNullBatchId) {
        return { data: [], error: null, count: 0 }
      }
    }

    // A factory, not a builder: the result set has to be paged past max-rows, and a
    // PostgrestFilterBuilder resolves once.
    //
    // The unsafe-* disables below are the cost of that `any`: supabase-js builder
    // types don't unify across select shapes, so every chained call off the factory
    // trips them. Scoped to the builder chain only — re-enabled immediately after.
    /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js builder types vary by select shape; behaviour is verified empirically
    const buildQuery = (): any => {
    let query: any
    if (filters?.hasDetections === false) {
      query = supabase
        .from('images')
        .select('id, detections!left(id)')
        .eq('user_id', userId)
        // See getPhotos: constrain the embed to live detections, or a photo whose
        // only detection was soft-deleted falls out of both filters.
        .is('detections.deleted_at', null)
        .is('detections', null)
    } else {
      query = supabase
        .from('images')
        .select('id, detections!inner(id)')
        .eq('user_id', userId)
        .is('detections.deleted_at', null)
      if (needsQualityFilter) {
        query = query.eq('detections.quality_status', filters!.qualityStatus!)
      }
      if (needsConfidenceFilter) {
        query = query.gte('detections.confidence', filters!.minConfidence! / 100)
      }
      if (needsSexFilter) {
        query = query.eq('detections.sex', filters!.sex!)
      }
      if (needsSizeClassFilter) {
        query = query.eq('detections.size_class', filters!.sizeClass!)
      }
      if (needsDeerFilter) {
        query = query.eq('detections.deer_id', filters!.deerId!)
      }
      if (needsPointsFilter) {
        if (filters?.minPoints !== undefined) {
          query = query.gte('detections.point_max', filters.minPoints)
        }
        if (filters?.maxPoints !== undefined) {
          query = query.lte('detections.point_min', filters.maxPoints)
        }
      }
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
    if (sessionBatchIds !== null) {
      query = query.in('batch_id', sessionBatchIds)
    }
    if (areaResult !== null) {
      const batchIds = areaResult.batchIds ?? []
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
    if (filters?.minScore !== undefined) {
      query = query.gte('best_score', filters.minScore)
    }

      // Stable order is required for offset paging — without it Postgres may repeat
      // or skip rows across pages.
      return query.order('id')
    }

    // Page past the max-rows ceiling. This function's contract is the COMPLETE id
    // set: /api/photos/ids backs "Select All", so a truncated result here means a
    // bulk archive or delete silently acts on a subset of what the user selected.
    // Every hasDetections === false query reaches this branch (the early return
    // above is gated on `hasDetections !== false`), so it is not a rare path.
    //
    // De-dup is defensive: PostgREST aggregates a to-many embed into a nested array,
    // one row per PARENT (verified: 300 rows, 300 distinct ids, each carrying 10
    // embedded detections), so it is a no-op with today's embed shape.
    const seen = new Set<string>()
    const ids: string[] = []
    for (let from = 0; ; ) {
      const { data, error } = await buildQuery().range(from, from + PHOTO_ID_PAGE_SIZE - 1)
      if (error !== null) {
        return { data: null, error, count: 0 }
      }
      const rows = (data ?? []) as Array<{ id: string }>
      if (rows.length === 0) break
      for (const row of rows) {
        if (!seen.has(row.id)) {
          seen.add(row.id)
          ids.push(row.id)
        }
      }
      // Advance by rows actually returned, so this stays correct whatever max-rows is.
      from += rows.length
    }

    /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */

    return { data: ids, error: null, count: ids.length }
  }

  // Standard query without detection-based filters - select only id.
  // Same treatment as the detection-filtered branch above: the two filters that need
  // a round-trip are resolved up front so the query builder can be a synchronous
  // factory, then the result is paged past max-rows. This is the DEFAULT "Select All"
  // path — no filters at all — so truncation here silently under-selects for every
  // account over the ceiling.
  let stdSessionBatchIds: string[] | null = null
  if (filters?.uploadSessionId !== undefined) {
    const { data: sessionBatches } = await supabase
      .from('processing_batches')
      .select('id')
      .eq('upload_session_id', filters.uploadSessionId)
    stdSessionBatchIds = (sessionBatches ?? []).map(b => b.id)
    if (stdSessionBatchIds.length === 0) {
      return { data: [], error: null, count: 0 }
    }
  }

  let stdAreaResult: AreaFilterResult | null = null
  if (filters?.areaNames?.length) {
    stdAreaResult = await getMultiAreaFilterBatchIds(supabase, userId, filters.areaNames)
    if ((stdAreaResult.batchIds ?? []).length === 0 && !stdAreaResult.includeNullBatchId) {
      return { data: [], error: null, count: 0 }
    }
  }

  /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js builder types vary by select shape
  const buildStdQuery = (): any => {
  let query: any = supabase
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
  if (stdSessionBatchIds !== null) {
    query = query.in('batch_id', stdSessionBatchIds)
  }
  if (stdAreaResult !== null) {
    const batchIds = stdAreaResult.batchIds ?? []
    if (stdAreaResult.includeNullBatchId) {
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
  if (filters?.minScore !== undefined) {
    query = query.gte('best_score', filters.minScore)
  }

    // Stable order — offset paging over an unordered query can skip or repeat.
    return query.order('id')
  }

  const ids: string[] = []
  for (let from = 0; ; ) {
    const { data, error } = await buildStdQuery().range(from, from + PHOTO_ID_PAGE_SIZE - 1)
    if (error !== null) {
      return { data: null, error, count: 0 }
    }
    const rows = (data ?? []) as Array<{ id: string }>
    if (rows.length === 0) break
    for (const row of rows) ids.push(row.id)
    from += rows.length
  }
  /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */

  return { data: ids, error: null, count: ids.length }
}

/**
 * Get a single photo by ID with its detections
 * Wrapped with React.cache() for per-request deduplication
 */
export const getPhoto = cache(async (
  userId: string,
  photoId: string
): Promise<{
  data: PhotoWithDetections | null
  error: Error | null
}> => {
  const supabase = await createClient()

  // Parallelize photo and detections fetch
  const [photoResult, detectionsResult] = await Promise.all([
    supabase
      .from('images')
      .select('*')
      .eq('id', photoId)
      .eq('user_id', userId)
      .single(),
    supabase
      .from('detections')
      .select('*, deer:deer_id(id, name)')
      .eq('image_id', photoId),
  ])

  if (photoResult.error !== null) {
    return { data: null, error: photoResult.error }
  }

  if (detectionsResult.error !== null) {
    return { data: null, error: detectionsResult.error }
  }

  const photoWithDetections: PhotoWithDetections = {
    ...(photoResult.data as Image),
    detections: detectionsResult.data ?? [],
  }

  return { data: photoWithDetections, error: null }
})

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

  // See getPhotos for the rationale: every detection predicate is evaluated by
  // Postgres. Nothing resolves to an image-id list here, because PostgREST puts
  // `.in()` in the query string and rejects it past ~250-500 uuids — which would
  // dead-end lightbox next/prev on exactly the large accounts that need it.
  const canUseInnerJoin = filters?.hasDetections !== false

  // A factory, not a builder. Neighbours are resolved with two independent bounded
  // queries (one either side of the cursor), and a PostgrestFilterBuilder resolves
  // once — so each side needs its own fully-filtered query.
  /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- supabase-js builder types don't unify across the two select shapes; behaviour is verified empirically
  const buildQuery = (): any => {
  let query: any = supabase
    .from('images')
    .select(
      hasDetectionFilters
        ? (canUseInnerJoin ? 'id, detections!inner(id)' : 'id, detections!left(id)')
        : 'id'
    )
    .eq('user_id', userId)

  if (hasDetectionFilters) {
    if (canUseInnerJoin) {
      query = query.is('detections.deleted_at', null)
      if (needsQualityFilter) {
        query = query.eq('detections.quality_status', filters!.qualityStatus!)
      }
      if (needsConfidenceFilter) {
        query = query.gte('detections.confidence', filters!.minConfidence! / 100)
      }
      if (needsSexFilter) {
        query = query.eq('detections.sex', filters!.sex!)
      }
      if (needsSizeClassFilter) {
        query = query.eq('detections.size_class', filters!.sizeClass!)
      }
      if (needsDeerFilter) {
        query = query.eq('detections.deer_id', filters!.deerId!)
      }
      if (needsPointsFilter) {
        // Range overlap via the generated bounds (migration 051). Unparseable
        // ranges have NULL bounds and are excluded, matching the old JS predicate.
        if (filters?.minPoints !== undefined) {
          query = query.gte('detections.point_max', filters.minPoints)
        }
        if (filters?.maxPoints !== undefined) {
          query = query.lte('detections.point_min', filters.maxPoints)
        }
      }
    } else {
      // Detection ABSENCE: the left-joined embed must come back empty, counting
      // only LIVE detections — see getPhotos. A soft-deleted-only photo otherwise
      // belongs to neither the "with" nor the "without" view.
      query = query.is('detections.deleted_at', null).is('detections', null)
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
  if (filters?.minScore !== undefined) {
    query = query.gte('best_score', filters.minScore)
  }

    return query
  }

  // Locate the cursor row. Everything below compares against it by key rather than
  // fetching every matching id and scanning in JS: that older approach was capped by
  // max-rows, so any photo past position ~1000 fell outside the window, findIndex
  // returned -1, and the viewer reported no neighbours at all.
  const { data: current } = await supabase
    .from('images')
    .select('imported_at')
    .eq('id', currentPhotoId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!current) {
    return { prevId: null, nextId: null }
  }

  const cursor = current.imported_at

  // Grid order is (imported_at DESC, id DESC), so prev = newer = a strictly GREATER
  // key, next = older = a strictly LESS one. Each side is one indexed row, whatever
  // the account size. The `.or(...)` row-value comparison mirrors the cursor logic
  // getPhotos already uses.
  const [prevRes, nextRes] = await Promise.all([
    buildQuery()
      .or(`imported_at.gt.${cursor},and(imported_at.eq.${cursor},id.gt.${currentPhotoId})`)
      .order('imported_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1),
    buildQuery()
      .or(`imported_at.lt.${cursor},and(imported_at.eq.${cursor},id.lt.${currentPhotoId})`)
      .order('imported_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1),
  ])

  // Note: neighbours are now resolved from the cursor's POSITION, so a photo that
  // does not itself match the active filters still navigates into the filtered set.
  // Previously findIndex missed it and returned nothing, which dead-ended deep links.
  const result = {
    prevId: (prevRes.data as Array<{ id: string }> | null)?.[0]?.id ?? null,
    nextId: (nextRes.data as Array<{ id: string }> | null)?.[0]?.id ?? null,
  }
  /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
  return result
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

  // Get signed upload URL (valid for 60 seconds - Supabase default)
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

// ============================================================================
// BULK UPLOAD OPERATIONS
// ============================================================================

// Type for images with original_filename column (added via migration 036)
// This column may not exist in database.types.ts yet, so we define it here
interface ImageWithOriginalFilename {
  original_filename: string | null
  file_size_bytes: number | null
}

/**
 * Check for duplicate files by filename + size
 * Uses idx_images_dedup index for fast lookups
 */
export async function checkDuplicates(
  userId: string,
  files: Array<{ filename: string; size: number }>
): Promise<{
  existing: string[]
  toUpload: string[]
  duplicateCount: number
}> {
  if (files.length === 0) {
    return { existing: [], toUpload: [], duplicateCount: 0 }
  }

  const supabase = await createClient()

  // Extract unique filenames for lookup
  const filenames = files.map(f => f.filename)

  // Query for existing files with matching filename AND size
  // The idx_images_dedup index makes this efficient
  // Note: original_filename column is added via migration 036_bulk_upload_support.sql
  const { data, error } = await supabase
    .from('images')
    .select('original_filename, file_size_bytes')
    .eq('user_id', userId)
    .in('original_filename' as never, filenames)

  if (error !== null) {
    console.error('Error checking duplicates:', error)
    // On error, assume no duplicates to allow upload to proceed
    return {
      existing: [],
      toUpload: filenames,
      duplicateCount: 0
    }
  }

  // Cast to the expected type (original_filename may not be in generated types yet)
  const existingImages = data as unknown as ImageWithOriginalFilename[]

  // Build a Set of existing filename+size combinations for O(1) lookups
  const existingSet = new Set<string>()
  for (const img of existingImages ?? []) {
    if (img.original_filename && img.file_size_bytes !== null) {
      existingSet.add(`${img.original_filename}::${img.file_size_bytes}`)
    }
  }

  // Partition files into existing (duplicates) and toUpload (new)
  const existing: string[] = []
  const toUpload: string[] = []

  for (const file of files) {
    const key = `${file.filename}::${file.size}`
    if (existingSet.has(key)) {
      existing.push(file.filename)
    } else {
      toUpload.push(file.filename)
    }
  }

  return {
    existing,
    toUpload,
    duplicateCount: existing.length
  }
}

// Type for bulk insert response (includes original_filename added via migration 036)
interface BulkInsertResult {
  id: string
  file_path: string
  original_filename: string | null
}

/**
 * Create pending image records and generate signed upload URLs
 * Called per chunk (25 files) during bulk upload
 */
export async function createBulkPhotoRecords(
  userId: string,
  sessionId: string,
  files: Array<{
    filename: string
    size: number
    mimeType: string
    exifData?: { make?: string; model?: string; dateTime?: string }
  }>
): Promise<{
  records: Array<{
    imageId: string
    filename: string
    signedUrl: string
    storagePath: string
  }>
  error: Error | null
}> {
  if (files.length === 0) {
    return { records: [], error: null }
  }

  const supabase = await createClient()

  // Prepare image records for bulk insert
  // Note: original_filename column is added via migration 036_bulk_upload_support.sql
  const imageRecords = files.map(file => {
    // Parse captured_at from EXIF dateTime if available
    let capturedAt: string | null = null
    if (file.exifData?.dateTime) {
      try {
        // EXIF dateTime format: "YYYY:MM:DD HH:MM:SS"
        const exifDate = file.exifData.dateTime.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
        capturedAt = new Date(exifDate).toISOString()
      } catch {
        // Ignore parse errors, leave capturedAt null
      }
    }

    // Build EXIF data object if we have any metadata
    const exifData: Json | null = file.exifData
      ? {
          make: file.exifData.make ?? null,
          model: file.exifData.model ?? null,
          dateTime: file.exifData.dateTime ?? null
        }
      : null

    // Storage path format: {userId}/{sessionId}/{filename}
    const storagePath = `${userId}/${sessionId}/${file.filename}`

    return {
      user_id: userId,
      file_path: storagePath,
      original_filename: file.filename,
      file_size_bytes: file.size,
      captured_at: capturedAt,
      exif_data: exifData,
      detection_status: 'pending',
    }
  })

  // Bulk insert image records
  const { data, error: insertError } = await supabase
    .from('images')
    .insert(imageRecords as never[])
    .select('id, file_path, original_filename')

  if (insertError !== null) {
    return { records: [], error: insertError }
  }

  // Cast to expected type (original_filename may not be in generated types yet)
  const insertedImages = data as unknown as BulkInsertResult[]

  if (!insertedImages || insertedImages.length === 0) {
    return { records: [], error: new Error('No images were inserted') }
  }

  // Generate signed upload URLs for each image
  const records: Array<{
    imageId: string
    filename: string
    signedUrl: string
    storagePath: string
  }> = []

  for (const img of insertedImages) {
    const { data: signedData, error: signedError } = await supabase.storage
      .from('photos')
      .createSignedUploadUrl(img.file_path)

    if (signedError !== null) {
      console.error(`Failed to create signed URL for ${img.file_path}:`, signedError)
      // Continue with other files rather than failing the entire batch
      continue
    }

    records.push({
      imageId: img.id,
      filename: img.original_filename ?? '',
      signedUrl: signedData.signedUrl,
      storagePath: img.file_path
    })
  }

  return { records, error: null }
}

/**
 * Generate fresh signed upload URL for a specific image
 * Used when retrying failed uploads (original URL may have expired)
 */
export async function refreshUploadUrl(
  userId: string,
  imageId: string
): Promise<{
  signedUrl: string
  expiresAt: string
} | null> {
  const supabase = await createClient()

  // Get the image record to retrieve the file path
  const { data: image, error: fetchError } = await supabase
    .from('images')
    .select('file_path')
    .eq('id', imageId)
    .eq('user_id', userId)
    .single()

  if (fetchError !== null || !image) {
    console.error('Failed to fetch image for refresh:', fetchError)
    return null
  }

  // Generate a new signed upload URL (60 seconds validity)
  const { data: signedData, error: signedError } = await supabase.storage
    .from('photos')
    .createSignedUploadUrl(image.file_path)

  if (signedError !== null) {
    console.error('Failed to create signed URL:', signedError)
    return null
  }

  // Calculate expiration (Supabase default is 60 seconds for upload URLs)
  const expiresAt = new Date(Date.now() + 60 * 1000).toISOString()

  return {
    signedUrl: signedData.signedUrl,
    expiresAt
  }
}

/**
 * Mark multiple photos as uploaded (status: pending -> processing)
 * Called after each chunk completes uploading
 */
export async function markPhotosUploaded(
  imageIds: string[]
): Promise<{ count: number; error: Error | null }> {
  if (imageIds.length === 0) {
    return { count: 0, error: null }
  }

  const supabase = await createClient()

  // Update detection_status from 'pending' to 'processing' for uploaded images
  const { error, count } = await supabase
    .from('images')
    .update({ detection_status: 'processing' } as never)
    .in('id', imageIds)
    .eq('detection_status', 'pending')

  if (error !== null) {
    return { count: 0, error }
  }

  return { count: count ?? imageIds.length, error: null }
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
