import type { PostgrestFilterBuilder } from '@supabase/postgrest-js'
import type { Database } from '@/types/database'
import { cache } from 'react'
import { photoOrder, photoCursorPredicate, encodePhotoCursor } from '@/lib/photos/order'
import { createClient } from '@/lib/supabase/server'
import type { Image, ImageInsert, ImageUpdate, Detection, Json } from '@/types/database'

type PhotoQuery = PostgrestFilterBuilder<{ PostgrestVersion: '13.0.5' }, Database['public'], Image, Image[]>

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

// Variant pipeline state (images.variant_status). Declared as a union rather than
// `string` so a typo in a comparison is a compile error — the grid branches on
// 'failed' to decide between "Preparing…" and a terminal "No preview".
export type VariantStatus = 'pending' | 'processing' | 'ready' | 'failed'

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
  filters?: PhotoFilters,
  // Callers that only need the count pass false: the RPC then skips array_agg and
  // returns an empty array, so the id set never crosses the wire. getPhotos reads
  // only `total`, and on a large account the ids were ~1.5MB of JSON per page.
  returnIds = true
): Promise<{ ids: string[]; total: number; error: Error | null }> {
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
    ...(returnIds ? {} : { p_return_ids: false }),
  }

  const { data, error } = await supabase.rpc('get_filtered_detection_images', args)
  if (error !== null) {
    return { ids: [], total: 0, error }
  }
  const row = data?.[0]
  return { ids: row?.image_ids ?? [], total: Number(row?.total_count ?? 0), error: null }
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
  triageView?: 'priority' | 'all' | 'trophy' | 'buck' | 'doe' | 'other' | 'empty' | 'unprocessed' | 'security'
  reviewStatus?: 'unreviewed' | 'keep' | 'review_later'
  emptyOnly?: boolean // Completed, no live detections, and no known animal/security activity
  hasDetections?: boolean  // true = with detections, false = without, undefined = all
  batchId?: string
  uploadSessionId?: string
  cameraId?: string
  includeArchived?: boolean // Explicit all-photos view; otherwise active photos only
  isArchived?: boolean
  qualityStatus?: string
  minConfidence?: number  // 0-100 integer
  sex?: string  // 'buck' | 'doe' | 'fawn' | 'unknown'
  minPoints?: number
  maxPoints?: number
  sizeClass?: string  // 'trophy' | 'standard' | 'basket' | 'spike' | 'unknown'
  minScore?: number  // photo-level: images.best_score >= minScore (authoritative gross, else estimate)
  datePreset?: 'today' | 'last7days' | 'last30days' | 'custom'
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

// Photo ids per `.in()` call. PostgREST serializes `.in()` into the query string and
// rejects it somewhere between 250 and 500 uuids (~18KB, measured), so any caller
// handed a user-sized id set must chunk rather than cap. 150 keeps clear margin.
export const PHOTO_ID_BATCH_SIZE = 150

/**
 * Validate a client-supplied photo-id batch.
 *
 * Shared so that every bulk route applies the SAME guard: the archive route used to
 * plain-assign `body.photo_ids` into `.in('id', ...)` while its two sibling routes
 * validated uuids first — same field, same shape, one guarded and one not.
 */
export function parsePhotoIdBatch(ids: unknown): { ids: string[] } | { error: string } {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { error: 'photoIds must be a non-empty array' }
  }
  if (ids.some((id: unknown) => typeof id !== 'string' || !UUID_RE.test(id))) {
    return { error: 'All photoIds must be valid UUIDs' }
  }
  return { ids: ids as string[] }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Split ids into `.in()`-safe chunks. */
function idChunks(ids: string[]): string[][] {
  const out: string[][] = []
  for (let i = 0; i < ids.length; i += PHOTO_ID_BATCH_SIZE) {
    out.push(ids.slice(i, i + PHOTO_ID_BATCH_SIZE))
  }
  return out
}

/**
 * Narrow an untyped PostgREST payload to id-bearing rows.
 *
 * The query builders below are `any` (supabase-js builder types don't unify across
 * select shapes), so their results arrive untyped. Asserting `as Array<{id: string}>`
 * would be unchecked: if a select shape ever changed, `row.id` would silently become
 * `undefined` and flow into a delete payload. This checks instead of asserting.
 */
function asIdRows(data: unknown): Array<{ id: string }> {
  if (!Array.isArray(data)) return []
  return data.filter(
    (row): row is { id: string } =>
      typeof row === 'object' && row !== null && typeof (row as { id?: unknown }).id === 'string'
  )
}

function sourceBatchSelect(selection: string, filters?: PhotoFilters): string {
  return filters?.uploadSessionId !== undefined || filters?.areaName !== undefined || (filters?.areaNames?.length ?? 0) > 0
    ? `${selection}, source_batch:processing_batches!batch_id(area_name,upload_session_id)`
    : selection
}

/** Dynamic embeds do not change top-level image fields. ID-only callers read only id. */
function selectPhotos(supabase: Awaited<ReturnType<typeof createClient>>, filters: PhotoFilters | undefined, selection: string, exactCount = false): PhotoQuery {
  return supabase.from('images').select(sourceBatchSelect(selection, filters), exactCount ? { count: 'exact' } : {}) as unknown as PhotoQuery
}

/**
 * Apply every PHOTO-level predicate. One definition, used by all five query builders.
 *
 * These had drifted into five hand-maintained copies with materially different filter
 * sets — Select All applied `has_deer=false` to `otherAnimals` while the grid did not
 * (so it selected fewer photos than were displayed), `areaName` was honoured by the
 * grid but ignored entirely by Select All (so it selected far MORE), and lightbox
 * navigation applied neither. Keeping one definition is what makes that class of bug
 * impossible rather than merely fixed.
 *
 * Canonical semantics are the GRID's, because that is what the user can see:
 * `otherAnimals` means "contains any of these animals", NOT "and no deer".
 */

function applyPhotoLevelFilters(query: PhotoQuery, filters: PhotoFilters | undefined): PhotoQuery {

  // 'all' is the UI's "no filter" sentinel; passing it through would filter
  // detection_status to the literal string 'all' and match nothing.
  // Reservations enter the gallery only once original storage has been verified.
  query = query.not('upload_completed_at', 'is', null)
  if (filters?.reviewStatus !== undefined) query = query.eq('review_status', filters.reviewStatus)
  if (filters?.triageView === 'priority') query = query.or('triage_tier.eq.trophy,has_people.is.true,has_vehicles.is.true')
  else if (filters?.triageView === 'security') query = query.or('has_people.is.true,has_vehicles.is.true')
  else if (filters?.triageView !== undefined && filters.triageView !== 'all') query = query.eq('triage_tier', filters.triageView)
  if (filters?.emptyOnly === true) {
    query = query.eq('detection_status', 'completed').eq('has_deer', false)
    for (const flag of ['has_hogs', 'has_cows', 'has_goats', 'has_people', 'has_vehicles']) query = query.eq(flag, false)
  }
  if (filters?.status !== undefined && filters.status !== 'all') {
    query = query.eq('detection_status', filters.status)
  }

  if (filters?.hasDeer !== undefined) {
    query = query.eq('has_deer', filters.hasDeer)
  }
  if (filters?.batchId !== undefined) query = query.eq('batch_id', filters.batchId)

  const selectedAreas = (filters?.areaNames?.length ?? 0) > 0 ? filters?.areaNames ?? [] : filters?.areaName !== undefined ? [filters.areaName] : []
  const includeNoArea = selectedAreas.includes('__no_area__')
  const namedAreas = selectedAreas.filter(area => area !== '__no_area__')
  if (filters?.uploadSessionId !== undefined) {
    query = query.eq('source_batch.upload_session_id', filters.uploadSessionId).not('source_batch', 'is', null)
  }
  if (selectedAreas.length > 0) {
    if (includeNoArea && namedAreas.length > 0) {
      const quoted = namedAreas.map(area => JSON.stringify(area)).join(',')
      query = query.or(`area_name.in.(${quoted}),area_name.is.null`, { referencedTable: 'source_batch' })
    } else if (includeNoArea) query = query.is('source_batch.area_name', null)
    else query = query.in('source_batch.area_name', namedAreas)
    query = includeNoArea && filters?.uploadSessionId === undefined
      ? query.or('source_batch.not.is.null,batch_id.is.null')
      : query.not('source_batch', 'is', null)
  }

  if ((filters?.otherAnimals?.length ?? 0) > 0) {
    const orFilter = buildOtherAnimalsOrFilter(filters?.otherAnimals ?? [])
    if (orFilter !== '') {
      query = query.or(orFilter)
    }
  }

  if (filters?.cameraId !== undefined) {
    query = query.eq('camera_id', filters.cameraId)
  }
  if (filters?.isArchived !== undefined || filters?.includeArchived !== true) {
    query = query.eq('is_archived', filters?.isArchived ?? false)
  }
  if (filters?.dateFrom !== undefined) {
    query = query.gte('captured_at', filters.dateFrom)
  }
  if (filters?.dateTo !== undefined) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo)) {
      const end = new Date(`${filters.dateTo}T00:00:00.000Z`)
      end.setUTCDate(end.getUTCDate() + 1)
      query = query.lt('captured_at', end.toISOString())
    } else {
      query = query.lte('captured_at', filters.dateTo)
    }
  }
  if (filters?.minScore !== undefined) {
    query = query.gte('best_score', filters.minScore)
  }
  return query

}

/**
 * Apply every DETECTION-level predicate to an embedded `detections!inner(...)` select.
 * Evaluated by Postgres — no image-id list is ever serialized into the query string,
 * which PostgREST rejects past ~250-500 uuids.
 */

function applyDetectionEmbedFilters(query: PhotoQuery, filters: PhotoFilters | undefined): PhotoQuery {

  query = query.is('detections.deleted_at', null)

  if (filters?.qualityStatus !== undefined && filters.qualityStatus !== 'all') {
    query = query.eq('detections.quality_status', filters.qualityStatus)
  }
  if (filters?.minConfidence !== undefined) {
    query = query.gte('detections.confidence', filters.minConfidence / 100)
  }
  if (filters?.sex !== undefined) {
    query = query.eq('detections.sex', filters.sex)
  }
  if (filters?.sizeClass !== undefined) {
    query = query.eq('detections.size_class', filters.sizeClass)
  }
  if (filters?.deerId !== undefined) {
    query = query.eq('detections.deer_id', filters.deerId)
  }
  // Range overlap via the generated bounds (migrations 051/052). Unparseable ranges
  // have NULL bounds and are excluded by these comparisons.
  if (filters?.minPoints !== undefined) {
    query = query.gte('detections.point_max', filters.minPoints)
  }
  if (filters?.maxPoints !== undefined) {
    query = query.lte('detections.point_min', filters.maxPoints)
  }
  return query

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
  const needsHasDetectionsFilter = filters?.hasDetections !== undefined || filters?.emptyOnly === true

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
    const canUseInnerJoin = filters?.hasDetections !== false && filters?.emptyOnly !== true

    // Batch-id lookups that need a round-trip, resolved once for this call.

    // --- Distinct matching image-id set (the exact-count source) ---
    // Only the inner-join path needs it, and only for the COUNT — the data query
    // filters server-side. The absence branch takes its count from its own query,
    // so it skips this entirely rather than scanning detections for a discarded
    // result. With no detection filters the RPC receives no filter args and returns
    // every image that has a live detection, which is the hasDetections===true case.
    let matchedCount = 0
    if (canUseInnerJoin) {
      // Count only — getPhotos never filters by this id set (the data query applies
      // the predicates server-side), so the array would be pure wire cost.
      const { total, error: matchedError } = await resolveMatchedImageIds(
        supabase,
        userId,
        filters,
        false
      )
      if (matchedError !== null) {
        return { data: null, error: matchedError, count: null }
      }
      matchedCount = total
    }

    // Are any NON-detection, NON-pagination filters active? If so the count must
    // also reflect those, so matchedImageIds.length is no longer the total and we
    // fall back to the query's own exact count.
    const hasOtherImageFilters =
      filters?.triageView !== undefined || filters?.reviewStatus !== undefined ||
      filters?.includeArchived !== true ||
      filters?.batchId !== undefined ||
      filters?.areaName !== undefined ||
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
    if (filters?.hasDetections !== false && filters?.emptyOnly !== true && matchedCount === 0) {
      return { data: [], error: null, count: 0 }
    }

    // Exact distinct count is available from the prefetch only when we take the
    // inner-join path AND no other image-level filters narrow the set.
    const useExactCount = canUseInnerJoin && !hasOtherImageFilters


    let query: PhotoQuery
    if (canUseInnerJoin) {
      query = applyDetectionEmbedFilters(
        selectPhotos(supabase, filters, '*, detections!inner(id)', !useExactCount)
          .eq('user_id', userId),
        filters
      )
    } else {
      // Detection ABSENCE. Expressed as a left-join that must come back empty, so
      // Postgres evaluates it — the old form sent every id that HAS a detection as
      // a `.not('id','in',(...))` list and overflowed the query string.
      query = selectPhotos(supabase, filters, '*, detections!left(id)', true)
        .eq('user_id', userId)
        // Constrain the embed to LIVE detections before testing it for emptiness.
        // Without this a photo whose only detection was soft-deleted still has a
        // non-empty embed, so it drops out of "No Deer" — and the RPC that backs
        // "With Deer" filters deleted_at IS NULL, so it drops out of that too. The
        // photo would exist in neither view.
        .is('detections.deleted_at', null)
        .is('detections', null)
    }

    const { field, ascending } = photoOrder(filters)
    query = query.order(field, { ascending, nullsFirst: false }).order('id', { ascending })
    if (filters?.cursor !== undefined && filters.cursor !== '') query = query.or(photoCursorPredicate(field, ascending, filters.cursor))

    // Apply other filters
    // Photo-level predicates come from ONE shared definition (see
    // applyPhotoLevelFilters) — these had drifted into five hand-maintained
    // copies with materially different filter sets.
    query = applyPhotoLevelFilters(query, filters)

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
    return { data: cleaned, error: null, count: useExactCount ? matchedCount : count }
  }

  // Batch-id lookups that need a round-trip, resolved once for this call.

  const { field, ascending } = photoOrder(filters)
  let query = selectPhotos(supabase, filters, '*', true)
    .eq('user_id', userId)
    .order(field, { ascending, nullsFirst: false })
    .order('id', { ascending })
  if (filters?.cursor !== undefined && filters.cursor !== '') query = query.or(photoCursorPredicate(field, ascending, filters.cursor))

  // Photo-level predicates come from ONE shared definition (see
  // applyPhotoLevelFilters).
  query = applyPhotoLevelFilters(query, filters)

  // Apply pagination
  const limit = filters?.limit ?? 50
  const offset = filters?.offset ?? 0
  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query.returns<Image[]>()

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
  const needsHasDetectionsFilter = filters?.hasDetections !== undefined || filters?.emptyOnly === true

  // If filtering by detection-related fields, we need to join with detections
  if (needsQualityFilter || needsConfidenceFilter || needsSexFilter || needsSizeClassFilter || needsPointsFilter || needsDeerFilter || needsHasDetectionsFilter) {

    // See getPhotos. The RPC resolves the distinct matching id set in one round-trip,
    // and it is the ANSWER this function returns on the detection-only path below —
    // exact, uncapped, and never serialized into a URL. The absence branch derives
    // its answer from the images query instead, so it skips this.
    let matchedImageIds: string[] = []
    if (filters?.hasDetections !== false && filters?.emptyOnly !== true) {
      const { ids, error: matchedError } = await resolveMatchedImageIds(supabase, userId, filters)
      if (matchedError !== null) {
        return { data: null, error: matchedError, count: 0 }
      }
      matchedImageIds = ids
    }

    const hasOtherImageFilters =
      filters?.triageView !== undefined || filters?.reviewStatus !== undefined ||
      filters?.includeArchived !== true ||
      filters?.batchId !== undefined ||
      filters?.areaName !== undefined ||
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
    if (filters?.hasDetections !== false && filters?.emptyOnly !== true && !hasOtherImageFilters) {
      return { data: matchedImageIds, error: null, count: matchedImageIds.length }
    }

    if (filters?.hasDetections !== false && filters?.emptyOnly !== true && matchedImageIds.length === 0) {
      return { data: [], error: null, count: 0 }
    }

    // Otherwise filter an images query by the detection predicates + the other
    // filters. The predicates go server-side rather than as an id list: PostgREST
    // serializes `.in()` into the query string and rejects it somewhere between 250
    // and 500 uuids (~18KB, measured).
    // Resolve batch-id lookups once, up front: the factory below is re-invoked per
    // page and must stay synchronous.


    const buildQuery = (): PhotoQuery => {

      let query: PhotoQuery
      if (filters?.hasDetections === false || filters?.emptyOnly === true) {
        query = selectPhotos(supabase, filters, 'id, detections!left(id)')
          .eq('user_id', userId)
          // Constrain the embed to live detections before testing it for emptiness,
          // or a photo whose only detection was soft-deleted falls out of BOTH the
          // "with" and "without" views.
          .is('detections.deleted_at', null)
          .is('detections', null)
      } else {
        query = applyDetectionEmbedFilters(
          selectPhotos(supabase, filters, 'id, detections!inner(id)')
            .eq('user_id', userId),
          filters
        )
      }

      // Shared photo-level definition. This is what fixes Select All disagreeing
      // with the grid: `areaName` was ignored here entirely (so a buck+area filter
      // selected every buck in the account) and `otherAnimals` additionally applied
      // has_deer=false (so it selected fewer photos than were displayed).

      return applyPhotoLevelFilters(query, filters).order('id')
    }

    // Page past the max-rows ceiling. This function's contract is the COMPLETE id
    // set: /api/photos/ids backs "Select All", so a truncated result means a bulk
    // archive or delete silently acts on a subset of what the user selected.
    const ids: string[] = []
    for (let from = 0; ; ) {

      const { data, error } = await buildQuery().range(from, from + PHOTO_ID_PAGE_SIZE - 1)
      if (error !== null) {
        return { data: null, error: error as Error, count: 0 }
      }
      const rows = asIdRows(data)
      if (rows.length === 0) break
      for (const row of rows) ids.push(row.id)
      // Advance by rows actually returned, so this stays correct whatever max-rows is.
      from += rows.length
    }

    return { data: ids, error: null, count: ids.length }
  }

  // Standard query without detection-based filters - select only id. This is the
  // DEFAULT "Select All" path, so truncation here silently under-selects for every
  // account over the max-rows ceiling.


  const buildStdQuery = (): PhotoQuery => {
    const base = selectPhotos(supabase, filters, 'id').eq('user_id', userId)

    return applyPhotoLevelFilters(base, filters).order('id')
  }

  const ids: string[] = []
  for (let from = 0; ; ) {

    const { data, error } = await buildStdQuery().range(from, from + PHOTO_ID_PAGE_SIZE - 1)
    if (error !== null) {
      return { data: null, error: error as Error, count: 0 }
    }
    const rows = asIdRows(data)
    if (rows.length === 0) break
    for (const row of rows) ids.push(row.id)
    from += rows.length
  }

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
      .eq('image_id', photoId)
      .is('deleted_at', null),
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
  const needsHasDetectionsFilter = filters?.hasDetections !== undefined || filters?.emptyOnly === true
  const hasDetectionFilters = needsQualityFilter || needsConfidenceFilter || needsSexFilter || needsSizeClassFilter || needsPointsFilter || needsDeerFilter || needsHasDetectionsFilter

  // See getPhotos for the rationale: every detection predicate is evaluated by
  // Postgres. Nothing resolves to an image-id list here, because PostgREST puts
  // `.in()` in the query string and rejects it past ~250-500 uuids — which would
  // dead-end lightbox next/prev on exactly the large accounts that need it.
  const canUseInnerJoin = filters?.hasDetections !== false && filters?.emptyOnly !== true

  // A factory, not a builder. Neighbours are resolved with two independent bounded
  // queries (one either side of the cursor), and a PostgrestFilterBuilder resolves
  // once — so each side needs its own fully-filtered query.

  const buildQuery = (): PhotoQuery => {

    let query: PhotoQuery = selectPhotos(supabase, filters, hasDetectionFilters
          ? (canUseInnerJoin ? 'id, detections!inner(id)' : 'id, detections!left(id)')
          : 'id')
      .eq('user_id', userId)

    if (hasDetectionFilters) {
      query = canUseInnerJoin
        ? applyDetectionEmbedFilters(query, filters)
        // Detection ABSENCE: the left-joined embed must come back empty, counting
        // only LIVE detections. A soft-deleted-only photo otherwise belongs to
        // neither the "with" nor the "without" view.

        : query.is('detections.deleted_at', null).is('detections', null)
    }

    // Photo-level predicates come from the one shared definition, so lightbox
    // navigation can no longer walk outside the set the grid is showing — it
    // previously ignored uploadSessionId, areaName, areaNames and otherAnimals.
    return applyPhotoLevelFilters(query, filters)
  }

  // Locate the cursor row. Everything below compares against it by key rather than
  // fetching every matching id and scanning in JS: that older approach was capped by
  // max-rows, so any photo past position ~1000 fell outside the window, findIndex
  // returned -1, and the viewer reported no neighbours at all.
  const { data: current, error: currentError } = await supabase
    .from('images')
    .select('id, imported_at, captured_at, best_score')
    .eq('id', currentPhotoId)
    .eq('user_id', userId)
    .maybeSingle()

  if (currentError !== null) {
    // This signature has no error channel, and returning nulls is indistinguishable
    // from "no neighbours" — which silently dead-ends navigation. Surface it.
    console.error('getAdjacentPhotos: cursor lookup failed:', currentError)
    return { prevId: null, nextId: null }
  }

  if (!current) {
    return { prevId: null, nextId: null }
  }

  const { field, ascending } = photoOrder(filters)
  const cursor = encodePhotoCursor(current, field)
  const [prevRes, nextRes] = await Promise.all([
    buildQuery()
      .or(photoCursorPredicate(field, ascending, cursor, 'before'))
      .order(field, { ascending: !ascending, nullsFirst: true })
      .order('id', { ascending: !ascending })
      .limit(1),
    buildQuery()
      .or(photoCursorPredicate(field, ascending, cursor))
      .order(field, { ascending, nullsFirst: false })
      .order('id', { ascending })
      .limit(1),
  ])
  if (prevRes.error || nextRes.error) {
    throw new Error('Unable to load neighboring photos')
  }

  // Note: neighbours are now resolved from the cursor's POSITION, so a photo that
  // does not itself match the active filters still navigates into the filtered set.
  // Previously findIndex missed it and returned nothing, which dead-ended deep links.
  const result = {
    prevId: (prevRes.data as Array<{ id: string }> | null)?.[0]?.id ?? null,
    nextId: (nextRes.data as Array<{ id: string }> | null)?.[0]?.id ?? null,
  }

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

  if (photo.file_path !== null && photo.file_path !== '') {
    storagePaths.push(photo.file_path)
  }
  if (photo.thumbnail_path !== null && photo.thumbnail_path !== '') {
    storagePaths.push(photo.thumbnail_path)
  }
  if (detections) {
    for (const d of detections) {
      if (d.crop_file_path !== null && d.crop_file_path !== '') {
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

  // Camera cards routinely reuse basenames. Every photo gets its own object key.
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${userId}/${batchId}/${crypto.randomUUID()}-${safeFilename}`

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
  if (data !== null) {
    for (const item of data) {
      if (item.error !== null && item.error !== '') {
        errors.push(`${item.path}: ${item.error}`)
      } else if (item.signedUrl !== '' && item.path !== null && item.path !== '') {
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

  // Chunked: a user-sized id set overflows the PostgREST query string.
  let updated = 0
  for (const chunk of idChunks(photoIds)) {
    const { count, error } = await supabase
      .from('images')
      .update({ location_id: locationId } as never)
      .eq('user_id', userId)
      .in('id', chunk)

    if (error !== null) {
      return { data: null, error }
    }
    updated += count ?? chunk.length
  }

  return { data: { count: updated }, error: null }
}

/**
 * Archive multiple photos (bulk operation).
 *
 * Lives in the service layer so the archive route stops issuing its own unguarded,
 * unchunked `.in('id', body.photo_ids)` — it was the one bulk path with neither uuid
 * validation nor a size bound.
 */
export async function archivePhotos(
  userId: string,
  photoIds: string[],
  isArchived = true
): Promise<{ data: { count: number } | null; error: Error | null }> {
  if (photoIds.length === 0) {
    return { data: { count: 0 }, error: null }
  }

  const supabase = await createClient()
  let archived = 0

  for (const chunk of idChunks(photoIds)) {
    const { data, error } = await supabase
      .from('images')
      .update({ is_archived: isArchived } as never)
      .eq('user_id', userId)
      .in('id', chunk)
      .select('id')

    if (error !== null) {
      return { data: null, error }
    }
    archived += data?.length ?? 0
  }

  return { data: { count: archived }, error: null }
}

/**
 * Set the review status of multiple photos (bulk operation).
 *
 * Same contract as archivePhotos: owner-scoped, readiness-guarded, and chunked so a
 * full "Select All" can never overflow the PostgREST query string. The review route
 * used to issue one unbounded `.in('id', ...)`, relying on client-side slicing.
 */
export async function setPhotoReviewStatus(
  userId: string,
  photoIds: string[],
  reviewStatus: 'unreviewed' | 'keep' | 'review_later'
): Promise<{ data: { count: number } | null; error: Error | null }> {
  if (photoIds.length === 0) {
    return { data: { count: 0 }, error: null }
  }

  const supabase = await createClient()
  let updated = 0

  for (const chunk of idChunks(photoIds)) {
    const { data, error } = await supabase
      .from('images')
      .update({ review_status: reviewStatus } as never)
      .eq('user_id', userId)
      .in('id', chunk)
      .not('upload_completed_at', 'is', null)
      .select('id')

    if (error !== null) {
      return { data: null, error }
    }
    updated += data?.length ?? 0
  }

  return { data: { count: updated }, error: null }
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

  // Every `.in()` below is chunked: "Select All" now yields the complete id set, and
  // PostgREST rejects a query string past ~250-500 uuids. Previously the routes capped
  // the request at 500 instead, which simply refused legitimate selections.
  const chunks = idChunks(photoIds)
  const storagePaths: string[] = []
  let photoCount = 0

  // 1. Collect storage paths BEFORE deleting — the rows are the only way to find
  //    them (variants and crops live in flat, shared prefixes).
  for (const chunk of chunks) {
    const { data: photos, error: fetchError } = await supabase
      .from('images')
      .select('id, file_path, thumbnail_path, medium_path')
      .eq('user_id', userId)
      .in('id', chunk)

    if (fetchError !== null) {
      return { data: null, error: fetchError }
    }

    for (const photo of photos ?? []) {
      photoCount += 1
      if (photo.file_path !== null && photo.file_path !== '') storagePaths.push(photo.file_path)
      if (photo.thumbnail_path !== null && photo.thumbnail_path !== '') storagePaths.push(photo.thumbnail_path)
      // medium_path was omitted here historically, orphaning every medium variant.
      if (photo.medium_path !== null && photo.medium_path !== '') storagePaths.push(photo.medium_path)
    }

    const { data: detections } = await supabase
      .from('detections')
      .select('crop_file_path')
      .in('image_id', chunk)

    for (const detection of detections ?? []) {
      if (detection.crop_file_path !== null && detection.crop_file_path !== '') storagePaths.push(detection.crop_file_path)
    }
  }

  // 2. Delete database records (cascades to detections via FK)
  let count = 0
  for (const chunk of chunks) {
    const { error: deleteError, count: chunkCount } = await supabase
      .from('images')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .in('id', chunk)

    if (deleteError !== null) {
      return { data: null, error: deleteError }
    }
    count += chunkCount ?? chunk.length
  }

  // 3. Delete storage files in batches (Supabase limit: 1000 per call)
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
      deletedCount: count > 0 ? count : photoCount,
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
    if (img.original_filename !== null && img.original_filename !== '' && img.file_size_bytes !== null) {
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
    if (file.exifData?.dateTime !== undefined && file.exifData.dateTime !== '') {
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

    const safeFilename = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${userId}/${sessionId}/${crypto.randomUUID()}-${safeFilename}`

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

  if (insertedImages === null || insertedImages.length === 0) {
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

  if (fetchError !== null || image === null) {
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
