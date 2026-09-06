import { createClient } from '@/lib/supabase/server'
import type {
  ProcessingBatch,
  ProcessingBatchInsert,
  ProcessingBatchUpdate,
} from '@/types/database'

// Define BatchStatus type locally (not an enum in the database)
export type BatchStatus = 'pending' | 'processing' | 'completed' | 'failed'

// Re-export types for consumers
export type { ProcessingBatch, ProcessingBatchInsert, ProcessingBatchUpdate }

/**
 * Batches Service
 *
 * Provides data access functions for processing_batches table.
 * Manages batch upload and processing progress tracking.
 */

export interface CreateBatchLocationData {
  locationId?: string
  locationLat?: number
  locationLng?: number
  areaName?: string
  directionCompass?: number
  directionNotes?: string
}

/**
 * Create a new processing batch
 */
export async function createBatch(
  userId: string,
  totalImages: number,
  locationData?: CreateBatchLocationData
): Promise<{
  data: ProcessingBatch | null
  error: Error | null
}> {
  const supabase = await createClient()

  const insertData: ProcessingBatchInsert = {
    user_id: userId,
    total_images: totalImages,
    status: 'pending',
    ...(locationData?.locationId && { location_id: locationData.locationId }),
    ...(locationData?.locationLat !== undefined && { location_lat: locationData.locationLat }),
    ...(locationData?.locationLng !== undefined && { location_lng: locationData.locationLng }),
    ...(locationData?.areaName !== undefined && { area_name: locationData.areaName }),
    ...(locationData?.directionCompass !== undefined && { direction_compass: locationData.directionCompass }),
    ...(locationData?.directionNotes !== undefined && { direction_notes: locationData.directionNotes }),
  }

  const { data, error } = await supabase
    .from('processing_batches')
    .insert(insertData as never)
    .select()
    .single()

  return { data: data as ProcessingBatch | null, error }
}

/**
 * Get all batches for a user, optionally filtered by status
 */
export async function getBatches(
  userId: string,
  status?: BatchStatus
): Promise<{
  data: ProcessingBatch[] | null
  error: Error | null
}> {
  const supabase = await createClient()

  let query = supabase
    .from('processing_batches')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (status !== undefined) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  return { data: data as ProcessingBatch[] | null, error }
}

/**
 * Get batches with photo counts for dropdown display
 * Returns batches ordered by creation date (newest first)
 */
export async function getBatchesWithCounts(
  userId: string,
  limit: number = 50
): Promise<{
  data: Array<{
    id: string
    created_at: string
    total_images: number
  }> | null
  error: Error | null
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('processing_batches')
    .select('id, created_at, total_images')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return { data, error }
}

/**
 * Link a batch to an upload session
 */
export async function linkBatchToSession(
  batchId: string,
  uploadSessionId: string
): Promise<{ error: Error | null }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('processing_batches')
    .update({ upload_session_id: uploadSessionId })
    .eq('id', batchId)

  return { error }
}

/**
 * Get distinct area names for a user (for autocomplete/filter dropdown)
 */
export async function getDistinctAreaNames(
  userId: string
): Promise<{
  data: string[] | null
  error: Error | null
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('processing_batches')
    .select('area_name')
    .eq('user_id', userId)
    .not('area_name', 'is', null)
    .order('area_name')

  if (error) return { data: null, error }

  // Extract unique area names
  const uniqueAreas = Array.from(new Set(data?.map(row => row.area_name).filter(Boolean) as string[]))
  return { data: uniqueAreas, error: null }
}
