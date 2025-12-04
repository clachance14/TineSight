/**
 * ROI Service
 *
 * Data access layer for detection ROIs (Region of Interest).
 * ROIs are user-defined regions around the head/antler area of detected deer,
 * used for improved embedding generation and quality filtering.
 */

import { createClient } from '@/lib/supabase/server'

/**
 * ROI coordinates (normalized 0-10000 scale)
 */
export interface ROIData {
  id: string
  detection_id: string
  roi_x: number
  roi_y: number
  roi_width: number
  roi_height: number
  is_reference: boolean
  created_at: string
  updated_at: string
  created_by: string | null
}

/**
 * Data for creating a new ROI
 */
export interface CreateROIData {
  detection_id: string
  roi_x: number
  roi_y: number
  roi_width: number
  roi_height: number
  is_reference?: boolean
}

/**
 * Data for updating an existing ROI
 */
export interface UpdateROIData {
  roi_x?: number
  roi_y?: number
  roi_width?: number
  roi_height?: number
  is_reference?: boolean
}

/**
 * ROI with detection and image info
 */
export interface ROIWithContext extends ROIData {
  detection: {
    id: string
    image_id: string
    bbox_x: number | null
    bbox_y: number | null
    bbox_width: number | null
    bbox_height: number | null
  }
  image: {
    id: string
    file_path: string
  }
}

/**
 * Get ROI for a detection
 *
 * @param detectionId - UUID of the detection
 * @returns ROI data or null if not set
 */
export async function getROI(
  detectionId: string
): Promise<{ data: ROIData | null; error: Error | null }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('detection_rois')
    .select('*')
    .eq('detection_id', detectionId)
    .maybeSingle()

  return { data: data as ROIData | null, error }
}

/**
 * Get ROI with detection and image context
 *
 * @param detectionId - UUID of the detection
 * @returns ROI with full context
 */
export async function getROIWithContext(
  detectionId: string
): Promise<{ data: ROIWithContext | null; error: Error | null }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('detection_rois')
    .select(`
      *,
      detection:detection_id (
        id,
        image_id,
        bbox_x,
        bbox_y,
        bbox_width,
        bbox_height,
        image:image_id (
          id,
          file_path
        )
      )
    `)
    .eq('detection_id', detectionId)
    .maybeSingle()

  if (error || !data) {
    return { data: null, error }
  }

  // Flatten nested structure
  const roiData = data as Record<string, unknown>
  const detectionData = roiData['detection'] as Record<string, unknown>
  const imageData = detectionData['image'] as Record<string, unknown>

  const result: ROIWithContext = {
    id: roiData['id'] as string,
    detection_id: roiData['detection_id'] as string,
    roi_x: roiData['roi_x'] as number,
    roi_y: roiData['roi_y'] as number,
    roi_width: roiData['roi_width'] as number,
    roi_height: roiData['roi_height'] as number,
    is_reference: roiData['is_reference'] as boolean,
    created_at: roiData['created_at'] as string,
    updated_at: roiData['updated_at'] as string,
    created_by: roiData['created_by'] as string | null,
    detection: {
      id: detectionData['id'] as string,
      image_id: detectionData['image_id'] as string,
      bbox_x: detectionData['bbox_x'] as number | null,
      bbox_y: detectionData['bbox_y'] as number | null,
      bbox_width: detectionData['bbox_width'] as number | null,
      bbox_height: detectionData['bbox_height'] as number | null,
    },
    image: {
      id: imageData['id'] as string,
      file_path: imageData['file_path'] as string,
    },
  }

  return { data: result, error: null }
}

/**
 * Create or update ROI for a detection
 *
 * Uses upsert since there's a unique constraint on detection_id.
 *
 * @param data - ROI data to create/update
 * @param userId - UUID of the user creating the ROI
 * @returns Created/updated ROI
 */
export async function upsertROI(
  data: CreateROIData,
  userId: string
): Promise<{ data: ROIData | null; error: Error | null }> {
  const supabase = await createClient()

  const { data: result, error } = await supabase
    .from('detection_rois')
    .upsert({
      detection_id: data.detection_id,
      roi_x: data.roi_x,
      roi_y: data.roi_y,
      roi_width: data.roi_width,
      roi_height: data.roi_height,
      is_reference: data.is_reference ?? false,
      created_by: userId,
      updated_at: new Date().toISOString(),
    } as never, {
      onConflict: 'detection_id',
    })
    .select()
    .single()

  return { data: result as ROIData | null, error }
}

/**
 * Update ROI reference status
 *
 * @param detectionId - UUID of the detection
 * @param isReference - Whether this ROI is a reference example
 * @returns Updated ROI
 */
export async function setROIReference(
  detectionId: string,
  isReference: boolean
): Promise<{ data: ROIData | null; error: Error | null }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('detection_rois')
    .update({
      is_reference: isReference,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('detection_id', detectionId)
    .select()
    .single()

  return { data: data as ROIData | null, error }
}

/**
 * Delete ROI for a detection
 *
 * @param detectionId - UUID of the detection
 * @returns Success status
 */
export async function deleteROI(
  detectionId: string
): Promise<{ error: Error | null }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('detection_rois')
    .delete()
    .eq('detection_id', detectionId)

  return { error }
}

/**
 * Get all reference ROIs for a user
 *
 * @returns Array of reference ROIs
 */
export async function getReferenceROIs(): Promise<{
  data: ROIWithContext[] | null
  error: Error | null
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('detection_rois')
    .select(`
      *,
      detection:detection_id (
        id,
        image_id,
        bbox_x,
        bbox_y,
        bbox_width,
        bbox_height,
        image:image_id (
          id,
          file_path
        )
      )
    `)
    .eq('is_reference', true)
    .order('created_at', { ascending: false })

  if (error || !data) {
    return { data: null, error }
  }

  // Flatten nested structures
  const results = data.map((item: unknown) => {
    const roiData = item as Record<string, unknown>
    const detectionData = roiData['detection'] as Record<string, unknown>
    const imageData = detectionData['image'] as Record<string, unknown>

    return {
      id: roiData['id'] as string,
      detection_id: roiData['detection_id'] as string,
      roi_x: roiData['roi_x'] as number,
      roi_y: roiData['roi_y'] as number,
      roi_width: roiData['roi_width'] as number,
      roi_height: roiData['roi_height'] as number,
      is_reference: roiData['is_reference'] as boolean,
      created_at: roiData['created_at'] as string,
      updated_at: roiData['updated_at'] as string,
      created_by: roiData['created_by'] as string | null,
      detection: {
        id: detectionData['id'] as string,
        image_id: detectionData['image_id'] as string,
        bbox_x: detectionData['bbox_x'] as number | null,
        bbox_y: detectionData['bbox_y'] as number | null,
        bbox_width: detectionData['bbox_width'] as number | null,
        bbox_height: detectionData['bbox_height'] as number | null,
      },
      image: {
        id: imageData['id'] as string,
        file_path: imageData['file_path'] as string,
      },
    } as ROIWithContext
  })

  return { data: results, error: null }
}

/**
 * Count reference ROIs for the current user
 *
 * @returns Number of reference ROIs
 */
export async function countReferenceROIs(): Promise<{
  data: number
  error: Error | null
}> {
  const supabase = await createClient()

  const { count, error } = await supabase
    .from('detection_rois')
    .select('*', { count: 'exact', head: true })
    .eq('is_reference', true)

  return { data: count ?? 0, error }
}
