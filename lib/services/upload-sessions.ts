import { createClient } from '@/lib/supabase/server'

// Define UploadSession types based on migration schema
// TODO: Regenerate database types with: npx supabase gen types typescript --linked > types/database.ts
export type UploadSessionStatus =
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'partial_error'
  | 'failed'
  | 'cancelled'

export type UploadSession = {
  id: string
  user_id: string
  total_batches: number
  total_images: number
  uploaded_count: number
  processed_count: number
  failed_count: number
  skipped_count: number
  status: UploadSessionStatus
  created_at: string
  completed_at: string | null
}

export type UploadSessionInsert = {
  id?: string
  user_id: string
  total_batches?: number
  total_images?: number
  uploaded_count?: number
  processed_count?: number
  failed_count?: number
  skipped_count?: number
  status?: UploadSessionStatus
  created_at?: string
  completed_at?: string | null
}

export type UploadSessionUpdate = {
  id?: string
  user_id?: string
  total_batches?: number
  total_images?: number
  uploaded_count?: number
  processed_count?: number
  failed_count?: number
  skipped_count?: number
  status?: UploadSessionStatus
  created_at?: string
  completed_at?: string | null
}

export type CancelSessionResult = {
  session_id: string
  batches_cancelled: number
  photos_marked_for_deletion: number
  photos_retained: number
}

/**
 * Upload Sessions Service
 *
 * Provides data access functions for upload_sessions table.
 * Groups processing_batches from the same upload event.
 */

/**
 * Create a new upload session
 * @param userId - User ID
 * @param totalImages - Total number of images to be uploaded (optional)
 */
export async function createUploadSession(
  userId: string,
  totalImages?: number
): Promise<{
  data: UploadSession | null
  error: Error | null
}> {
  const supabase = await createClient()

  const insertData: UploadSessionInsert = {
    user_id: userId,
    status: 'uploading',
    ...(totalImages !== undefined && { total_images: totalImages }),
  }

  const { data, error } = await supabase
    .from('upload_sessions')
    .insert(insertData as never)
    .select()
    .single()

  return { data: data as UploadSession | null, error }
}

/**
 * Get an upload session by ID
 */
export async function getUploadSession(
  sessionId: string
): Promise<{
  data: UploadSession | null
  error: Error | null
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('upload_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  return { data: data as UploadSession | null, error }
}

/**
 * Get all upload sessions for a user, optionally filtered by status
 */
export async function getUploadSessions(
  userId: string,
  status?: UploadSessionStatus
): Promise<{
  data: UploadSession[] | null
  error: Error | null
}> {
  const supabase = await createClient()

  let query = supabase
    .from('upload_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (status !== undefined) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  return { data: data as UploadSession[] | null, error }
}

/**
 * Update an upload session with partial data
 * Used for updating progress counters and status
 */
export async function updateUploadSession(
  sessionId: string,
  updates: {
    uploadedCount?: number
    processedCount?: number
    failedCount?: number
    skippedCount?: number
    status?: UploadSessionStatus
  }
): Promise<{
  data: UploadSession | null
  error: Error | null
}> {
  const supabase = await createClient()

  const updateData: Record<string, unknown> = {}

  if (updates.uploadedCount !== undefined) {
    updateData['uploaded_count'] = updates.uploadedCount
  }
  if (updates.processedCount !== undefined) {
    updateData['processed_count'] = updates.processedCount
  }
  if (updates.failedCount !== undefined) {
    updateData['failed_count'] = updates.failedCount
  }
  if (updates.skippedCount !== undefined) {
    updateData['skipped_count'] = updates.skippedCount
  }
  if (updates.status !== undefined) {
    updateData['status'] = updates.status
    // Set completed_at when transitioning to a terminal state
    if (updates.status === 'completed' || updates.status === 'failed' || updates.status === 'partial_error' || updates.status === 'cancelled') {
      updateData['completed_at'] = new Date().toISOString()
    }
  }

  // No updates to make
  if (Object.keys(updateData).length === 0) {
    return { data: null, error: new Error('No valid fields to update') }
  }

  const { data, error } = await supabase
    .from('upload_sessions')
    .update(updateData as never)
    .eq('id', sessionId)
    .select()
    .single()

  return { data: data as UploadSession | null, error }
}

/**
 * Update upload session status
 */
export async function updateUploadSessionStatus(
  sessionId: string,
  status: UploadSessionStatus
): Promise<{
  data: UploadSession | null
  error: Error | null
}> {
  const supabase = await createClient()

  const updateData: Record<string, unknown> = {
    status,
  }

  // Set completed_at when transitioning to a terminal state
  if (status === 'completed' || status === 'failed' || status === 'partial_error' || status === 'cancelled') {
    updateData['completed_at'] = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('upload_sessions')
    .update(updateData as never)
    .eq('id', sessionId)
    .select()
    .single()

  return { data: data as UploadSession | null, error }
}

/**
 * Get upload sessions with image counts for dropdown display
 * Returns sessions ordered by creation date (newest first)
 */
export async function getUploadSessionsWithCounts(
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
    .from('upload_sessions')
    .select('id, created_at, total_images')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return { data, error }
}

/**
 * Mark upload session as completed
 */
export async function completeUploadSession(
  sessionId: string
): Promise<{
  data: UploadSession | null
  error: Error | null
}> {
  const supabase = await createClient()

  const updateData = {
    status: 'completed' as const,
    completed_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('upload_sessions')
    .update(updateData as never)
    .eq('id', sessionId)
    .select()
    .single()

  return { data: data as UploadSession | null, error }
}

/**
 * Cancel an upload session and mark photos for deletion
 *
 * @param userId - User ID to verify ownership
 * @param sessionId - Upload session ID to cancel
 * @param deleteScope - 'pending' to delete only unprocessed photos, 'all' to delete all photos
 * @returns Stats about cancelled batches and photos
 */
export async function cancelSession(
  userId: string,
  sessionId: string,
  deleteScope: 'pending' | 'all'
): Promise<{
  data: CancelSessionResult | null
  error: Error | null
}> {
  const supabase = await createClient()

  try {
    // 1. Verify ownership
    const { data: session, error: sessionError } = await supabase
      .from('upload_sessions')
      .select('id, user_id, total_images')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single()

    if (sessionError || !session) {
      return {
        data: null,
        error: new Error('Session not found or access denied'),
      }
    }

    // 2. Get batch IDs for this session
    const { data: batches, error: batchesError } = await supabase
      .from('processing_batches')
      .select('id')
      .eq('upload_session_id', sessionId)

    if (batchesError) {
      return { data: null, error: batchesError }
    }

    const batchIds = batches?.map((b) => b.id) || []

    // 3. Atomically update batches to cancelled status (only those still processing)
    const { data: cancelledBatches, error: batchUpdateError } = await supabase
      .from('processing_batches')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      } as never)
      .eq('upload_session_id', sessionId)
      .eq('status', 'processing')
      .select('id')

    if (batchUpdateError) {
      return { data: null, error: batchUpdateError }
    }

    const batchesCancelled = cancelledBatches?.length || 0

    // 4. Mark images for deletion based on scope
    let photosMarkedForDeletion = 0

    if (batchIds.length > 0) {
      let imageQuery = supabase
        .from('images')
        .update({ is_cancelled: true } as never)
        .in('batch_id', batchIds)

      // Apply scope filter
      if (deleteScope === 'pending') {
        imageQuery = imageQuery.in('detection_status', ['pending', 'processing'])
      }
      // For 'all' scope, no additional filter needed

      const { data: markedImages, error: imageUpdateError } = await imageQuery.select('id')

      if (imageUpdateError) {
        return { data: null, error: imageUpdateError }
      }

      photosMarkedForDeletion = markedImages?.length || 0
    }

    // 5. Update session status to cancelled
    const { error: sessionUpdateError } = await supabase
      .from('upload_sessions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      } as never)
      .eq('id', sessionId)

    if (sessionUpdateError) {
      return { data: null, error: sessionUpdateError }
    }

    // 6. Return stats
    const totalImages = session.total_images || 0
    const photosRetained = totalImages - photosMarkedForDeletion

    return {
      data: {
        session_id: sessionId,
        batches_cancelled: batchesCancelled,
        photos_marked_for_deletion: photosMarkedForDeletion,
        photos_retained: photosRetained,
      },
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Unknown error during cancellation'),
    }
  }
}
