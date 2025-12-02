import { createClient } from '@/lib/supabase/server'
import type {
  ProcessingBatch,
  ProcessingBatchInsert,
  ProcessingBatchUpdate,
  BatchStatus,
} from '@/types/database'

// Re-export types for consumers
export type { ProcessingBatch, ProcessingBatchInsert, ProcessingBatchUpdate, BatchStatus }

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
 * Increment uploaded_images count
 */
export async function incrementUploaded(
  batchId: string
): Promise<{
  data: ProcessingBatch | null
  error: Error | null
}> {
  const supabase = await createClient()

  // First get the current batch to read the uploaded_images value
  const { data: currentBatch, error: fetchError } = await supabase
    .from('processing_batches')
    .select('uploaded_images')
    .eq('id', batchId)
    .single()

  if (fetchError !== null) {
    return { data: null, error: fetchError }
  }

  // Increment the count
  const currentCount = (currentBatch as ProcessingBatch).uploaded_images
  const { data, error } = await supabase
    .from('processing_batches')
    .update({ uploaded_images: currentCount + 1 } as never)
    .eq('id', batchId)
    .select()
    .single()

  return { data: data as ProcessingBatch | null, error }
}

/**
 * Increment processed_images count and update success/failure counts
 */
export async function incrementProcessed(
  batchId: string,
  success: boolean
): Promise<{
  data: ProcessingBatch | null
  error: Error | null
}> {
  const supabase = await createClient()

  // First get the current batch to read the counts
  const { data: currentBatch, error: fetchError } = await supabase
    .from('processing_batches')
    .select('processed_images, successful_images, failed_images')
    .eq('id', batchId)
    .single()

  if (fetchError !== null) {
    return { data: null, error: fetchError }
  }

  // Build update object with incremented counts
  const batch = currentBatch as ProcessingBatch
  const updateData = {
    processed_images: batch.processed_images + 1,
    successful_images: success
      ? batch.successful_images + 1
      : batch.successful_images,
    failed_images: success
      ? batch.failed_images
      : batch.failed_images + 1,
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
