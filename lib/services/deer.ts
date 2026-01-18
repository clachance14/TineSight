import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { generateFingerprint } from '@/trigger/jobs/generate-fingerprint'
import { postCreationScan } from '@/trigger/jobs/post-creation-scan'

export interface Deer {
  id: string
  user_id: string
  name: string
  notes: string | null
  reference_detection_id: string | null
  created_at: string
  updated_at: string
}

export interface CreateDeerData {
  name: string
  notes?: string | null
  detection_id: string  // Detection to use as reference
}

export interface UpdateDeerData {
  name?: string
  notes?: string | null
  reference_detection_id?: string
}

export interface DeerWithSightings extends Deer {
  sighting_count: number
  reference_image_url?: string | null
  reference_bbox?: {
    x: number | null
    y: number | null
    width: number | null
    height: number | null
  } | null
}

export interface DeerCatalogFilters {
  search?: string
  limit?: number
  cursor?: string  // Format: "created_at::id" for cursor-based pagination
}

export interface PaginatedDeerCatalog {
  deer: DeerWithSightings[]
  total: number
  nextCursor: string | null
}

/**
 * Create a new deer profile from a detection
 */
export async function createDeer(
  userId: string,
  data: CreateDeerData
): Promise<{ data: Deer | null; error: Error | null }> {
  const supabase = await createClient()

  // Check for duplicate name
  const { data: existing } = await supabase
    .from('deer')
    .select('name')
    .eq('user_id', userId)
    .ilike('name', data.name)
    .maybeSingle()

  if (existing) {
    // Generate suggestion by appending number
    const { data: similar } = await supabase
      .from('deer')
      .select('name')
      .eq('user_id', userId)
      .ilike('name', `${data.name}%`)

    const count = similar?.length ?? 0
    const suggestion = `${data.name} (${count + 1})`

    return {
      data: null,
      error: new Error(`A deer named "${data.name}" already exists. Try "${suggestion}" instead.`),
    }
  }

  // Verify detection exists and get image_id for linking
  const { data: detection, error: detectionError } = await supabase
    .from('detections')
    .select('id, image_id')
    .eq('id', data.detection_id)
    .single()

  if (detectionError || !detection) {
    return { data: null, error: new Error('Detection not found') }
  }

  // Create deer profile
  const { data: deer, error: createError } = await supabase
    .from('deer')
    .insert({
      user_id: userId,
      name: data.name,
      notes: data.notes ?? null,
      reference_detection_id: data.detection_id,
    } as never)
    .select()
    .single()

  if (createError) {
    return { data: null, error: createError }
  }

  // Set detection as reference and link to deer
  await supabase
    .from('detections')
    .update({ is_reference: true, deer_id: deer.id } as never)
    .eq('id', data.detection_id)

  // Queue fingerprint generation if the reference detection doesn't have one yet
  // This ensures all named bucks get fingerprints, not just trophy-tier
  const { data: refDetection } = await supabase
    .from('detections')
    .select('id, antler_fingerprint')
    .eq('id', data.detection_id)
    .single()

  if (refDetection && !refDetection.antler_fingerprint) {
    try {
      await generateFingerprint.trigger({
        detectionId: refDetection.id,
        userId,
      })
    } catch (fpError) {
      // Don't fail deer creation if fingerprint queuing fails
      // The fingerprint can be generated later
      console.error('Failed to queue fingerprint generation:', fpError)
    }
  }

  // Trigger post-creation scan to find matching unassigned detections
  // This happens asynchronously and doesn't block deer creation
  try {
    await postCreationScan.trigger({
      deerId: deer.id,
      userId,
    })
  } catch (scanError) {
    // Don't fail deer creation if scan queuing fails
    // User can manually review matches later
    console.error('Failed to queue post-creation scan:', scanError)
  }

  return { data: deer as unknown as Deer, error: null }
}

/**
 * Get deer catalog with pagination and parallelized URL generation
 */
export async function getDeerCatalog(
  userId: string,
  filters?: DeerCatalogFilters
): Promise<{ data: PaginatedDeerCatalog | null; error: Error | null }> {
  const supabase = await createClient()

  const limit = filters?.limit ?? 24  // Default page size
  const fetchLimit = limit + 1  // Fetch one extra to detect next page

  let query = supabase
    .from('deer')
    .select(`
      *,
      detections:detections!deer_id(count),
      reference_detection:detections!reference_detection_id(
        bbox_x,
        bbox_y,
        bbox_width,
        bbox_height,
        images!inner(file_path)
      )
    `, { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })  // Secondary sort for stable pagination

  if (filters?.search) {
    query = query.ilike('name', `%${filters.search}%`)
  }

  // Apply cursor-based pagination if cursor provided
  if (filters?.cursor) {
    const [cursorCreatedAt, cursorId] = filters.cursor.split('::')
    if (cursorCreatedAt && cursorId) {
      query = query.or(
        `created_at.lt.${cursorCreatedAt},and(created_at.eq.${cursorCreatedAt},id.lt.${cursorId})`
      )
    }
  }

  query = query.limit(fetchLimit)

  const { data, error, count } = await query

  if (error) {
    return { data: null, error }
  }

  // Determine if there's a next page
  const hasNextPage = (data ?? []).length > limit
  const deerToReturn = hasNextPage ? (data ?? []).slice(0, limit) : (data ?? [])

  // Collect all file paths for PARALLEL URL generation
  const filePaths: Array<{ index: number; path: string }> = []

  deerToReturn.forEach((d: Record<string, unknown>, index: number) => {
    const refDetection = d['reference_detection'] as {
      images: { file_path: string }
    } | null

    if (refDetection?.images?.file_path) {
      filePaths.push({ index, path: refDetection.images.file_path })
    }
  })

  // Generate ALL signed URLs in parallel (single batch operation)
  const urlPromises = filePaths.map(({ path }) =>
    supabase.storage.from('photos').createSignedUrl(path, 3600)
  )

  const urlResults = await Promise.all(urlPromises)

  // Map URLs back to deer records by index
  const urlMap = new Map<number, string>()
  filePaths.forEach(({ index }, i) => {
    const result = urlResults[i]
    if (result?.data?.signedUrl) {
      urlMap.set(index, result.data.signedUrl)
    }
  })

  // Build response with URLs mapped back
  const deerWithImages = deerToReturn.map((d: Record<string, unknown>, index: number) => {
    const refDetection = d['reference_detection'] as {
      bbox_x: number | null
      bbox_y: number | null
      bbox_width: number | null
      bbox_height: number | null
      images: { file_path: string }
    } | null

    return {
      ...d,
      sighting_count: Array.isArray(d['detections']) && d['detections'][0]
        ? (d['detections'][0] as { count: number }).count
        : 0,
      reference_image_url: urlMap.get(index) ?? null,
      reference_bbox: refDetection ? {
        x: refDetection.bbox_x,
        y: refDetection.bbox_y,
        width: refDetection.bbox_width,
        height: refDetection.bbox_height,
      } : null,
      detections: undefined,
      reference_detection: undefined,
    }
  })

  // Build next cursor from last item
  const lastDeer = deerToReturn[deerToReturn.length - 1] as Record<string, unknown> | undefined
  const nextCursor = hasNextPage && lastDeer
    ? `${lastDeer['created_at']}::${lastDeer['id']}`
    : null

  return {
    data: {
      deer: deerWithImages as unknown as DeerWithSightings[],
      total: count ?? 0,
      nextCursor,
    },
    error: null,
  }
}

/**
 * Get a single deer profile by ID
 * Wrapped with React.cache() for per-request deduplication
 */
export const getDeerById = cache(async (
  userId: string,
  deerId: string
): Promise<{ data: DeerWithSightings | null; error: Error | null }> => {
  const supabase = await createClient()

  // Parallelize the deer fetch and sighting count
  const [deerResult, countResult] = await Promise.all([
    supabase
      .from('deer')
      .select('*')
      .eq('id', deerId)
      .eq('user_id', userId)
      .single(),
    supabase
      .from('detections')
      .select('*', { count: 'exact', head: true })
      .eq('deer_id', deerId),
  ])

  if (deerResult.error) {
    return { data: null, error: deerResult.error }
  }

  return {
    data: { ...(deerResult.data as unknown as Deer), sighting_count: countResult.count ?? 0 },
    error: null,
  }
})

/**
 * Update a deer profile
 */
export async function updateDeer(
  userId: string,
  deerId: string,
  data: UpdateDeerData
): Promise<{ data: Deer | null; error: Error | null }> {
  const supabase = await createClient()

  // Check for duplicate name if name is being changed
  if (data.name) {
    const { data: existing } = await supabase
      .from('deer')
      .select('id, name')
      .eq('user_id', userId)
      .ilike('name', data.name)
      .neq('id', deerId)
      .maybeSingle()

    if (existing) {
      return {
        data: null,
        error: new Error(`A deer named "${data.name}" already exists.`),
      }
    }
  }

  // Handle reference photo change if provided
  if (data.reference_detection_id !== undefined) {
    // Get current deer record to check if reference is actually changing
    const { data: currentDeer } = await supabase
      .from('deer')
      .select('reference_detection_id')
      .eq('id', deerId)
      .eq('user_id', userId)
      .single()

    if (currentDeer && currentDeer.reference_detection_id !== data.reference_detection_id) {
      // Verify new detection exists and belongs to this deer
      const { data: newDetection, error: detectionError } = await supabase
        .from('detections')
        .select('id, deer_id, antler_fingerprint')
        .eq('id', data.reference_detection_id)
        .single()

      if (detectionError || !newDetection) {
        return { data: null, error: new Error('New reference detection not found') }
      }

      if (newDetection.deer_id !== deerId) {
        return {
          data: null,
          error: new Error('Reference detection must belong to this deer')
        }
      }

      // Clear is_reference flag on old reference detection
      if (currentDeer.reference_detection_id) {
        await supabase
          .from('detections')
          .update({
            is_reference: false,
            antler_fingerprint: null // Clear old fingerprint
          } as never)
          .eq('id', currentDeer.reference_detection_id)
      }

      // Set is_reference flag on new reference detection
      await supabase
        .from('detections')
        .update({
          is_reference: true,
          antler_fingerprint: null // Clear fingerprint to trigger regeneration
        } as never)
        .eq('id', data.reference_detection_id)

      // Queue fingerprint generation for new reference detection
      try {
        await generateFingerprint.trigger({
          detectionId: data.reference_detection_id,
          userId,
        })
      } catch (fpError) {
        // Don't fail the update if fingerprint queuing fails
        console.error('Failed to queue fingerprint generation:', fpError)
      }
    }
  }

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (data.name !== undefined) updateData['name'] = data.name
  if (data.notes !== undefined) updateData['notes'] = data.notes
  if (data.reference_detection_id !== undefined) {
    updateData['reference_detection_id'] = data.reference_detection_id
  }

  const { data: deer, error } = await supabase
    .from('deer')
    .update(updateData as never)
    .eq('id', deerId)
    .eq('user_id', userId)
    .select()
    .single()

  return { data: deer as unknown as Deer | null, error }
}

/**
 * Delete a deer profile (detections remain but become unassigned)
 */
export async function deleteDeer(
  userId: string,
  deerId: string
): Promise<{ error: Error | null }> {
  const supabase = await createClient()

  // Unlink detections first
  await supabase
    .from('detections')
    .update({ deer_id: null, is_reference: false } as never)
    .eq('deer_id', deerId)

  // Delete deer
  const { error } = await supabase
    .from('deer')
    .delete()
    .eq('id', deerId)
    .eq('user_id', userId)

  return { error }
}
