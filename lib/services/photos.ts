import { createClient } from '@/lib/supabase/server'
import type { Image, ImageInsert, ImageUpdate, Detection } from '@/types/database'

// Filter types for querying photos
export interface PhotoFilters {
  status?: string
  hasDeer?: boolean
  batchId?: string
  cameraId?: string
  isArchived?: boolean
  qualityStatus?: string
  limit?: number
  offset?: number
}

// Data types for creating and updating photos
export interface CreatePhotoData {
  file_path: string
  camera_id?: string | null
  file_size_bytes?: number | null
  captured_at?: string | null
  detection_status?: string
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

  // If filtering by quality status, we need to join with detections
  if (filters?.qualityStatus !== undefined && filters.qualityStatus !== 'all') {
    // Use a subquery approach: get image IDs that have detections with the specified quality status
    const { data: detections, error: detectionsError } = await supabase
      .from('detections')
      .select('image_id')
      .eq('quality_status', filters.qualityStatus)

    if (detectionsError !== null) {
      return { data: null, error: detectionsError, count: null }
    }

    const imageIds = [...new Set((detections ?? []).map((d: { image_id: string }) => d.image_id))]

    if (imageIds.length === 0) {
      return { data: [], error: null, count: 0 }
    }

    // Build query with image ID filter
    let query = supabase
      .from('images')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .in('id', imageIds)
      .order('created_at', { ascending: false })

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

    if (filters?.cameraId !== undefined) {
      query = query.eq('camera_id', filters.cameraId)
    }

    if (filters?.isArchived !== undefined) {
      query = query.eq('is_archived', filters.isArchived)
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

  // Standard query without quality status filter
  let query = supabase
    .from('images')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

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

  if (filters?.cameraId !== undefined) {
    query = query.eq('camera_id', filters.cameraId)
  }

  if (filters?.isArchived !== undefined) {
    query = query.eq('is_archived', filters.isArchived)
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

  // Get detections for this photo
  const { data: detections, error: detectionsError } = await supabase
    .from('detections')
    .select('*')
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
    ...(data.camera_id !== undefined && { camera_id: data.camera_id }),
    ...(data.file_size_bytes !== undefined && { file_size_bytes: data.file_size_bytes }),
    ...(data.captured_at !== undefined && { captured_at: data.captured_at }),
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
 * Delete a photo (soft delete by archiving or hard delete)
 */
export async function deletePhoto(
  userId: string,
  photoId: string
): Promise<{
  error: Error | null
}> {
  const supabase = await createClient()

  // Hard delete - will cascade to detections via database constraints
  const { error } = await supabase
    .from('images')
    .delete()
    .eq('id', photoId)
    .eq('user_id', userId)

  return { error }
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
