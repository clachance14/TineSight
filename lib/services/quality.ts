/**
 * Quality Service
 *
 * Data access layer for quality scoring and feedback.
 * Handles quality status updates, feedback collection, and
 * interaction with the compute_quality_score database function.
 */

import { createClient } from '@/lib/supabase/server'

/**
 * Quality status for a detection
 */
export type QualityStatus = 'pending' | 'high_quality' | 'low_quality' | 'manual_review'

/**
 * Feedback type for rejected detections
 */
export type FeedbackType =
  | 'distant'
  | 'partial_view'
  | 'no_antlers'
  | 'obstructed'
  | 'wrong_angle'
  | 'blurry'
  | 'other'

/**
 * Quality thresholds
 */
export const QUALITY_THRESHOLDS = {
  HIGH: 0.7,    // >= 0.7 = high_quality (auto-process)
  LOW: 0.4,     // < 0.4 = low_quality (skip)
  // Between 0.4 and 0.7 = manual_review
  MIN_REFERENCES: 3,  // Minimum reference ROIs before auto-filtering activates
}

/**
 * Feedback data
 */
export interface FeedbackData {
  id: string
  detection_id: string
  feedback_type: FeedbackType
  notes: string | null
  created_at: string
  created_by: string | null
}

/**
 * Data for creating feedback
 */
export interface CreateFeedbackData {
  detection_id: string
  feedback_type: FeedbackType
  notes?: string | null
}

/**
 * Detection with quality info
 */
export interface DetectionQuality {
  id: string
  quality_status: QualityStatus
  quality_score: number | null
}

/**
 * Compute quality score for a detection
 *
 * Uses the database function compute_quality_score() which compares
 * the detection's embedding against reference ROI embeddings.
 *
 * @param detectionId - UUID of the detection
 * @param userId - UUID of the user (for finding their reference ROIs)
 * @returns Quality score (0-1) or null if insufficient references
 */
export async function computeQualityScore(
  detectionId: string,
  userId: string
): Promise<{ data: number | null; error: Error | null }> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .rpc('compute_quality_score', {
      target_detection_id: detectionId,
      query_user_id: userId,
    })

  return { data: data as number | null, error }
}

/**
 * Get the number of reference ROIs for a user
 *
 * Uses the database function count_reference_rois().
 *
 * @param userId - UUID of the user
 * @returns Number of reference ROIs
 */
export async function getReferenceCount(
  userId: string
): Promise<{ data: number; error: Error | null }> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .rpc('count_reference_rois', {
      query_user_id: userId,
    })

  return { data: (data as number | null) ?? 0, error }
}

/**
 * Determine quality status from score
 *
 * @param score - Quality score (0-1)
 * @returns Quality status classification
 */
export function scoreToStatus(score: number | null): QualityStatus {
  if (score === null) {
    return 'pending'
  }
  if (score >= QUALITY_THRESHOLDS.HIGH) {
    return 'high_quality'
  }
  if (score < QUALITY_THRESHOLDS.LOW) {
    return 'low_quality'
  }
  return 'manual_review'
}

/**
 * Update quality status and score for a detection
 *
 * @param detectionId - UUID of the detection
 * @param score - Quality score (0-1) or null
 * @param status - Quality status (derived from score if not provided)
 * @returns Updated detection quality info
 */
export async function updateQualityStatus(
  detectionId: string,
  score: number | null,
  status?: QualityStatus
): Promise<{ data: DetectionQuality | null; error: Error | null }> {
  const supabase = await createClient()

  const qualityStatus = status ?? scoreToStatus(score)

  const { data, error } = await supabase
    .from('detections')
    .update({
      quality_score: score,
      quality_status: qualityStatus,
    } as never)
    .eq('id', detectionId)
    .select('id, quality_status, quality_score')
    .single()

  return { data: data as DetectionQuality | null, error }
}

/**
 * Create quality feedback for a detection
 *
 * @param data - Feedback data
 * @param userId - UUID of the user submitting feedback
 * @returns Created feedback record
 */
export async function createFeedback(
  data: CreateFeedbackData,
  userId: string
): Promise<{ data: FeedbackData | null; error: Error | null }> {
  const supabase = await createClient()

  const { data: result, error } = await supabase
    .from('roi_feedback')
    .insert({
      detection_id: data.detection_id,
      feedback_type: data.feedback_type,
      notes: data.notes ?? null,
      created_by: userId,
    } as never)
    .select()
    .single()

  return { data: result as FeedbackData | null, error }
}

/**
 * Get all feedback for a detection
 *
 * @param detectionId - UUID of the detection
 * @returns Array of feedback records
 */
export async function getFeedbackForDetection(
  detectionId: string
): Promise<{ data: FeedbackData[] | null; error: Error | null }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('roi_feedback')
    .select('*')
    .eq('detection_id', detectionId)
    .order('created_at', { ascending: false })

  return { data: data as FeedbackData[] | null, error }
}

/**
 * Get detections pending quality review
 *
 * @returns Array of detections needing manual review
 */
export async function getDetectionsPendingReview(): Promise<{
  data: DetectionQuality[] | null
  error: Error | null
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('detections')
    .select('id, quality_status, quality_score')
    .eq('quality_status', 'manual_review')
    .order('created_at', { ascending: true })

  return { data: data as DetectionQuality[] | null, error }
}

/**
 * Get quality statistics for the current user's detections
 *
 * @returns Counts by quality status
 */
export async function getQualityStats(): Promise<{
  data: {
    pending: number
    high_quality: number
    low_quality: number
    manual_review: number
    total: number
  }
  error: Error | null
}> {
  const supabase = await createClient()

  // Get counts for each status
  const statuses: QualityStatus[] = ['pending', 'high_quality', 'low_quality', 'manual_review']

  const counts: Record<QualityStatus, number> = {
    pending: 0,
    high_quality: 0,
    low_quality: 0,
    manual_review: 0,
  }

  for (const status of statuses) {
    const { count, error } = await supabase
      .from('detections')
      .select('*', { count: 'exact', head: true })
      .eq('quality_status', status)

    if (error) {
      return {
        data: { ...counts, total: 0 },
        error,
      }
    }

    counts[status] = count ?? 0
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  return {
    data: { ...counts, total },
    error: null,
  }
}

/**
 * Check if auto-filtering is enabled for a user
 *
 * Auto-filtering requires at least MIN_REFERENCES reference ROIs.
 *
 * @param userId - UUID of the user
 * @returns Whether auto-filtering is enabled
 */
export async function isAutoFilteringEnabled(
  userId: string
): Promise<{ data: boolean; error: Error | null }> {
  const { data, error } = await getReferenceCount(userId)

  if (error) {
    return { data: false, error }
  }

  return { data: data >= QUALITY_THRESHOLDS.MIN_REFERENCES, error: null }
}
