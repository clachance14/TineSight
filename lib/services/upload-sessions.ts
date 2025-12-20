import { createClient } from '@/lib/supabase/server'

// Define UploadSession types based on migration schema
// TODO: Regenerate database types with: npx supabase gen types typescript --linked > types/database.ts
export type UploadSessionStatus =
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'partial_error'
  | 'failed'

export type UploadSession = {
  id: string
  user_id: string
  total_batches: number
  total_images: number
  status: UploadSessionStatus
  created_at: string
  completed_at: string | null
}

export type UploadSessionInsert = {
  id?: string
  user_id: string
  total_batches?: number
  total_images?: number
  status?: UploadSessionStatus
  created_at?: string
  completed_at?: string | null
}

export type UploadSessionUpdate = {
  id?: string
  user_id?: string
  total_batches?: number
  total_images?: number
  status?: UploadSessionStatus
  created_at?: string
  completed_at?: string | null
}

/**
 * Upload Sessions Service
 *
 * Provides data access functions for upload_sessions table.
 * Groups processing_batches from the same upload event.
 */

/**
 * Create a new upload session
 */
export async function createUploadSession(
  userId: string
): Promise<{
  data: UploadSession | null
  error: Error | null
}> {
  const supabase = await createClient()

  const insertData: UploadSessionInsert = {
    user_id: userId,
    status: 'uploading',
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
  if (status === 'completed' || status === 'failed' || status === 'partial_error') {
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
