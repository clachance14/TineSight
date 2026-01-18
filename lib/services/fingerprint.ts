import { createClient } from '@/lib/supabase/server'
import type { AntlerFingerprint } from '@/types/fingerprint'

/**
 * Get the antler fingerprint for a detection
 */
export async function getFingerprint(
  detectionId: string
): Promise<{ data: AntlerFingerprint | null; error: Error | null }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('detections')
    .select('antler_fingerprint')
    .eq('id', detectionId)
    .single()

  if (error) {
    return { data: null, error }
  }

  // Type assertion needed until database types are regenerated
  const result = data as unknown as { antler_fingerprint: AntlerFingerprint | null }
  return { data: result?.antler_fingerprint ?? null, error: null }
}

/**
 * Save an antler fingerprint to a detection
 */
export async function saveFingerprint(
  detectionId: string,
  fingerprint: AntlerFingerprint
): Promise<{ success: boolean; error: Error | null }> {
  const supabase = await createClient()

  // Type assertion needed until database types are regenerated
  const { error } = await supabase
    .from('detections')
    .update({ antler_fingerprint: fingerprint } as never)
    .eq('id', detectionId)

  if (error) {
    return { success: false, error }
  }

  return { success: true, error: null }
}

/**
 * Get all trophy-tier detections with fingerprints for a user
 */
export async function getTrophyDetections(
  userId: string
): Promise<{
  data: Array<{
    id: string
    crop_file_path: string | null
    antler_fingerprint: AntlerFingerprint | null
    captured_at: string | null
  }> | null
  error: Error | null
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('detections')
    .select('id, crop_file_path, antler_fingerprint, images!inner(user_id, captured_at)')
    .eq('size_class', 'trophy')
    .eq('images.user_id', userId)
    .not('antler_fingerprint', 'is', null)
    .is('deleted_at', null)
    .order('images.captured_at', { ascending: false })

  if (error) {
    return { data: null, error }
  }

  // Map to flatten the joined structure
  // Type assertion needed until database types are regenerated
  const mapped = (data || []).map((d) => {
    const detection = d as unknown as {
      id: string
      crop_file_path: string | null
      antler_fingerprint: AntlerFingerprint | null
      images: { user_id: string; captured_at: string | null }
    }
    return {
      id: detection.id,
      crop_file_path: detection.crop_file_path,
      antler_fingerprint: detection.antler_fingerprint,
      captured_at: detection.images.captured_at,
    }
  })

  return { data: mapped, error: null }
}

/**
 * Get unassigned trophy detections (not assigned to deer or clusters)
 */
export async function getUnassignedTrophyDetections(
  userId: string
): Promise<{
  data: Array<{
    detection_id: string
    fingerprint: AntlerFingerprint
    crop_file_path: string | null
    captured_at: string | null
  }> | null
  error: Error | null
}> {
  const supabase = await createClient()

  // Type assertion needed until database types are regenerated
  const { data, error } = await supabase.rpc('get_unassigned_trophy_detections' as never, {
    p_user_id: userId,
  } as never)

  if (error) {
    return { data: null, error }
  }

  return {
    data: data as unknown as Array<{
      detection_id: string
      fingerprint: AntlerFingerprint
      crop_file_path: string | null
      captured_at: string | null
    }>,
    error: null,
  }
}

/**
 * Update match candidate antler print similarity score
 */
export async function updateMatchCandidateSimilarity(
  matchId: string,
  similarity: number
): Promise<{ success: boolean; error: Error | null }> {
  const supabase = await createClient()

  // Type assertion needed until database types are regenerated
  const { error } = await supabase
    .from('match_candidates')
    .update({ antler_print_similarity: similarity } as never)
    .eq('id', matchId)

  if (error) {
    return { success: false, error }
  }

  return { success: true, error: null }
}

/**
 * Batch fetch fingerprints for multiple detections
 */
export async function getDetectionsWithFingerprints(
  detectionIds: string[]
): Promise<{
  data: Array<{
    id: string
    antler_fingerprint: AntlerFingerprint | null
    crop_file_path: string | null
  }> | null
  error: Error | null
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('detections')
    .select('id, antler_fingerprint, crop_file_path')
    .in('id', detectionIds)
    .not('antler_fingerprint', 'is', null)

  if (error) {
    return { data: null, error }
  }

  // Type assertion needed until database types are regenerated
  return {
    data: data as unknown as Array<{
      id: string
      antler_fingerprint: AntlerFingerprint | null
      crop_file_path: string | null
    }>,
    error: null,
  }
}
