import { createClient } from '@/lib/supabase/server'
import type { Tables, TablesInsert } from '@/types/database'

export type Location = Tables<'locations'>
export type LocationInsert = TablesInsert<'locations'>

// Location with photo count from aggregated query
export interface LocationWithPhotoCount extends Location {
  photo_count: number
}

export interface CreateLocationData {
  name: string
  lat: number
  lng: number
  directionCompass?: number
  directionNotes?: string
  notes?: string
}

/**
 * Get all locations for a user with photo counts
 * Photo count is based on processing_batches linked to each location
 */
export async function getLocations(
  userId: string
): Promise<{
  data: LocationWithPhotoCount[] | null
  error: Error | null
}> {
  const supabase = await createClient()

  // Query locations with batch count (which represents photo groups)
  // We count images in batches linked to each location
  const { data, error } = await supabase
    .from('locations')
    .select(`
      *,
      processing_batches(count)
    `)
    .eq('user_id', userId)
    .order('name', { ascending: true })

  if (error) {
    return { data: null, error }
  }

  // Now get photo counts for each location via processing_batches
  const locationIds = (data ?? []).map(l => l.id)

  // Get image counts per location
  const { data: imageCounts } = await supabase
    .from('processing_batches')
    .select('location_id, images(count)')
    .in('location_id', locationIds)
    .not('location_id', 'is', null)

  // Build a map of location_id -> total photo count
  const photoCountMap = new Map<string, number>()
  for (const batch of imageCounts ?? []) {
    if (batch.location_id) {
      const count = Array.isArray(batch.images) ? batch.images[0]?.count ?? 0 : 0
      photoCountMap.set(
        batch.location_id,
        (photoCountMap.get(batch.location_id) ?? 0) + count
      )
    }
  }

  // Transform response to include photo_count
  const locations: LocationWithPhotoCount[] = (data ?? []).map((location) => {
    // Remove the processing_batches array from the result
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { processing_batches, ...locationData } = location

    return {
      ...locationData,
      photo_count: photoCountMap.get(location.id) ?? 0,
    } as LocationWithPhotoCount
  })

  return { data: locations, error: null }
}

/**
 * Get a single location by ID
 */
export async function getLocation(
  locationId: string
): Promise<{
  data: Location | null
  error: Error | null
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .eq('id', locationId)
    .single()

  if (error) {
    return { data: null, error }
  }

  return { data, error: null }
}

/**
 * Create a new location
 */
export async function createLocation(
  userId: string,
  locationData: CreateLocationData
): Promise<{
  data: Location | null
  error: Error | null
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('locations')
    .insert({
      user_id: userId,
      name: locationData.name,
      lat: locationData.lat,
      lng: locationData.lng,
      direction_compass: locationData.directionCompass ?? null,
      direction_notes: locationData.directionNotes ?? null,
      notes: locationData.notes ?? null,
    })
    .select()
    .single()

  if (error) {
    return { data: null, error }
  }

  return { data, error: null }
}

/**
 * Update an existing location
 */
export async function updateLocation(
  locationId: string,
  updates: Partial<CreateLocationData>
): Promise<{
  data: Location | null
  error: Error | null
}> {
  const supabase = await createClient()

  const updateData: Record<string, unknown> = {}
  if (updates.name !== undefined) updateData['name'] = updates.name
  if (updates.lat !== undefined) updateData['lat'] = updates.lat
  if (updates.lng !== undefined) updateData['lng'] = updates.lng
  if (updates.directionCompass !== undefined) updateData['direction_compass'] = updates.directionCompass
  if (updates.directionNotes !== undefined) updateData['direction_notes'] = updates.directionNotes
  if (updates.notes !== undefined) updateData['notes'] = updates.notes

  const { data, error } = await supabase
    .from('locations')
    .update(updateData)
    .eq('id', locationId)
    .select()
    .single()

  if (error) {
    return { data: null, error }
  }

  return { data, error: null }
}

/**
 * Delete a location
 * Note: This will set location_id to NULL on any linked processing_batches (ON DELETE SET NULL)
 */
export async function deleteLocation(
  locationId: string
): Promise<{
  error: Error | null
}> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('locations')
    .delete()
    .eq('id', locationId)

  if (error) {
    return { error }
  }

  return { error: null }
}
