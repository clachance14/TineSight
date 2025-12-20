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

/**
 * Create a new processing batch
 */
export async function createBatch(
  userId: string,
  totalImages: number
): Promise<{
  data: ProcessingBatch | null
  error: Error | null
}> {
  const supabase = await createClient()

  const insertData: ProcessingBatchInsert = {
    user_id: userId,
    total_images: totalImages,
    status: 'pending',
  }

  const { data, error } = await supabase
    .from('processing_batches')
    .insert(insertData as never)
    .select()
    .single()

  return { data: data as ProcessingBatch | null, error }
}

/**
 * Get a batch by ID
 */
export async function getBatch(
  batchId: string
): Promise<{
  data: ProcessingBatch | null
  error: Error | null
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('processing_batches')
    .select('*')
    .eq('id', batchId)
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
 * Update batch status
 */
export async function updateBatchStatus(
  batchId: string,
  status: BatchStatus,
  errorMessage?: string
): Promise<{
  data: ProcessingBatch | null
  error: Error | null
}> {
  const supabase = await createClient()

  const updateData: Record<string, unknown> = {
    status,
  }

  if (errorMessage !== undefined) {
    updateData['error_message'] = errorMessage
  }

  const { data, error } = await supabase
    .from('processing_batches')
    .update(updateData as never)
    .eq('id', batchId)
    .select()
    .single()

  return { data: data as ProcessingBatch | null, error }
}

/**
 * Atomically increment batch counters
 *
 * Uses the increment_batch_counters RPC function to avoid race conditions.
 * This is the preferred method for updating batch progress from background jobs.
 *
 * @param batchId - The batch ID to update
 * @param params - Counter increments (processed, successful, failed)
 * @returns Error if the operation failed
 */
export async function incrementBatchCounters(
  batchId: string,
  params: {
    incrementProcessed?: number
    incrementSuccessful?: number
    incrementFailed?: number
  }
): Promise<{ error: Error | null }> {
  const supabase = await createClient()

  const { error } = await supabase.rpc('increment_batch_counters', {
    batch_id: batchId,
    increment_processed: params.incrementProcessed ?? 0,
    increment_successful: params.incrementSuccessful ?? 0,
    increment_failed: params.incrementFailed ?? 0,
  })

  return { error }
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
 * Mark batch as completed
 */
export async function completeBatch(
  batchId: string
): Promise<{
  data: ProcessingBatch | null
  error: Error | null
}> {
  const supabase = await createClient()

  const updateData = {
    status: 'completed' as const,
    completed_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('processing_batches')
    .update(updateData as never)
    .eq('id', batchId)
    .select()
    .single()

  return { data: data as ProcessingBatch | null, error }
}
