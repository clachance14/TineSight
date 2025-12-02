import { createClient } from '@/lib/supabase/server'
import type { Detection, DetectionInsert, DeerEmbedding } from '@/types/database'

/**
 * Data structure for creating a new detection
 */
export interface CreateDetectionData {
  bbox_x?: number | null
  bbox_y?: number | null
  bbox_width?: number | null
  bbox_height?: number | null
  class?: string | null
  confidence?: number | null
  deer_id?: string | null
}

/**
 * Detection with associated deer information
 */
export interface DetectionWithDeer extends Detection {
  deer?: {
    id: string
    name: string | null
    status: string
  } | null
}

/**
 * Orphaned embedding (not linked to a deer profile yet)
 */
export interface OrphanedEmbedding extends DeerEmbedding {
  detection: {
    id: string
    image_id: string
    class: string | null
    confidence: number | null
  }
  image: {
    id: string
    file_path: string
    captured_at: string | null
  }
}

/**
 * Create multiple detections for an image (from AI results)
 *
 * @param imageId - UUID of the image
 * @param detections - Array of detection data from AI processing
 * @returns Array of created detection records
 */
export async function createDetections(
  imageId: string,
  detections: CreateDetectionData[]
): Promise<{ data: Detection[] | null; error: Error | null }> {
  const supabase = await createClient()

  // Build insert records
  const insertData: DetectionInsert[] = detections.map((detection) => ({
    image_id: imageId,
    bbox_x: detection.bbox_x ?? null,
    bbox_y: detection.bbox_y ?? null,
    bbox_width: detection.bbox_width ?? null,
    bbox_height: detection.bbox_height ?? null,
    class: detection.class ?? null,
    confidence: detection.confidence ?? null,
    deer_id: detection.deer_id ?? null,
  }))

  const { data, error } = await supabase
    .from('detections')
    .insert(insertData as never[])
    .select()

  return { data: data as Detection[] | null, error }
}

/**
 * Get all detections for a specific image
 *
 * @param imageId - UUID of the image
 * @returns Array of detections for the image
 */
export async function getDetectionsForImage(
  imageId: string
): Promise<{ data: Detection[] | null; error: Error | null }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('detections')
    .select('*')
    .eq('image_id', imageId)
    .order('confidence', { ascending: false, nullsFirst: false })

  return { data: data as Detection[] | null, error }
}

/**
 * Get a single detection with associated deer information
 *
 * @param detectionId - UUID of the detection
 * @returns Detection record with deer info
 */
export async function getDetection(
  detectionId: string
): Promise<{ data: DetectionWithDeer | null; error: Error | null }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('detections')
    .select(`
      *,
      deer:deer_id (
        id,
        name,
        status
      )
    `)
    .eq('id', detectionId)
    .single()

  return { data: data as DetectionWithDeer | null, error }
}

/**
 * Update the classification of a detection (for manual corrections)
 *
 * @param detectionId - UUID of the detection
 * @param className - New classification (e.g., "deer", "buck", "doe", etc.)
 * @returns Updated detection record
 */
export async function updateDetectionClass(
  detectionId: string,
  className: string
): Promise<{ data: Detection | null; error: Error | null }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('detections')
    .update({ class: className } as never)
    .eq('id', detectionId)
    .select()
    .single()

  return { data: data as Detection | null, error }
}

/**
 * Link a detection to a deer profile (after match confirmation)
 *
 * @param detectionId - UUID of the detection
 * @param deerId - UUID of the deer profile
 * @returns Updated detection record
 */
export async function linkDetectionToDeer(
  detectionId: string,
  deerId: string
): Promise<{ data: Detection | null; error: Error | null }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('detections')
    .update({ deer_id: deerId } as never)
    .eq('id', detectionId)
    .select()
    .single()

  return { data: data as Detection | null, error }
}

/**
 * Store an embedding vector for a detection
 *
 * @param detectionId - UUID of the detection
 * @param embedding - Embedding vector (512-dimensional array)
 * @returns Created embedding record
 */
export async function createEmbedding(
  detectionId: string,
  embedding: number[]
): Promise<{ data: DeerEmbedding | null; error: Error | null }> {
  const supabase = await createClient()

  // Check if detection is linked to a deer
  const { data: detectionRecord } = await supabase
    .from('detections')
    .select('deer_id')
    .eq('id', detectionId)
    .single()

  const detectionData = detectionRecord as { deer_id: string | null } | null

  // Build insert data conditionally based on deer_id
  const insertData: Record<string, unknown> = {
    detection_id: detectionId,
    embedding,
  }

  // Only add deer_id if detection is linked to a deer (not null/undefined)
  if (detectionData?.deer_id) {
    insertData['deer_id'] = detectionData.deer_id
  }

  const { data, error } = await supabase
    .from('deer_embeddings')
    .insert(insertData as never)
    .select()
    .single()

  return { data: data as DeerEmbedding | null, error }
}

/**
 * Check if a detection has an embedding
 *
 * @param detectionId - UUID of the detection
 * @returns True if embedding exists, false otherwise
 */
export async function hasEmbedding(
  detectionId: string
): Promise<{ data: boolean; error: Error | null }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('deer_embeddings')
    .select('id')
    .eq('detection_id', detectionId)
    .maybeSingle()

  if (error !== null) {
    return { data: false, error }
  }

  return { data: data !== null, error: null }
}

/**
 * Get embeddings that are not linked to any deer profile
 * (orphaned embeddings awaiting match confirmation)
 *
 * @param _userId - UUID of the user (used implicitly through RLS via detection->image chain)
 * @returns Array of orphaned embeddings with detection and image info
 */
export async function getOrphanedEmbeddings(
  _userId: string
): Promise<{ data: OrphanedEmbedding[] | null; error: Error | null }> {
  const supabase = await createClient()

  // Note: _userId is used implicitly through RLS policies on deer_embeddings
  // which check ownership via the detection->image->user chain
  const { data, error } = await supabase
    .from('deer_embeddings')
    .select(`
      *,
      detection:detection_id (
        id,
        image_id,
        class,
        confidence,
        image:image_id (
          id,
          file_path,
          captured_at
        )
      )
    `)
    .is('deer_id', null)
    .order('created_at', { ascending: false })

  if (error !== null) {
    return { data: null, error }
  }

  if (!data || data.length === 0) {
    return { data: [], error: null }
  }

  // Flatten the nested structure for type safety
  // RLS has already filtered by userId through the detection->image chain
  const flattenedData = data.map((item: unknown) => {
    const embedding = item as Record<string, unknown>
    const detectionData = embedding['detection'] as Record<string, unknown>
    const imageData = detectionData['image'] as Record<string, unknown>

    return {
      id: embedding['id'] as string,
      deer_id: embedding['deer_id'] as string,
      detection_id: embedding['detection_id'] as string,
      embedding: embedding['embedding'] as number[],
      created_at: embedding['created_at'] as string,
      detection: {
        id: detectionData['id'] as string,
        image_id: detectionData['image_id'] as string,
        class: detectionData['class'] as string | null,
        confidence: detectionData['confidence'] as number | null,
      },
      image: {
        id: imageData['id'] as string,
        file_path: imageData['file_path'] as string,
        captured_at: imageData['captured_at'] as string | null,
      },
    } as OrphanedEmbedding
  })

  return { data: flattenedData, error: null }
}
