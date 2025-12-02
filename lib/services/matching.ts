import { createClient } from '@/lib/supabase/server'
import type { Deer, Detection } from '@/types/database'

// Types for match candidate data
export interface MatchCandidateData {
  candidate_deer_id: string
  similarity_score: number
}

export interface MatchCandidate {
  id: string
  detection_id: string
  candidate_deer_id: string
  similarity_score: number
  status: 'pending' | 'confirmed' | 'rejected'
  reviewed_at: string | null
  created_at: string
}

export interface SimilarDeer {
  deer_id: string
  deer_name: string | null
  similarity: number
  detection_id: string
  image_id: string
  image_path: string
}

export interface FindSimilarOptions {
  matchCount?: number
  threshold?: number
}

/**
 * Find similar deer using pgvector similarity search
 * Calls the find_similar_deer database function
 */
export async function findSimilarDeer(
  embedding: number[],
  userId: string,
  options?: FindSimilarOptions
): Promise<{ data: SimilarDeer[] | null; error: Error | null }> {
  const supabase = await createClient()

  const matchCount = options?.matchCount ?? 5
  const threshold = options?.threshold ?? 0.7

  const { data, error } = await supabase.rpc('find_similar_deer' as never, {
    query_embedding: embedding,
    query_user_id: userId,
    match_count: matchCount,
    similarity_threshold: threshold,
  } as never)

  if (error !== null) {
    return { data: null, error }
  }

  return { data: data as SimilarDeer[], error: null }
}

/**
 * Create match candidates for a detection
 * Stores potential matches for human review
 */
export async function createMatchCandidates(
  detectionId: string,
  candidates: MatchCandidateData[]
): Promise<{ data: MatchCandidate[] | null; error: Error | null }> {
  const supabase = await createClient()

  const candidateRows = candidates.map(candidate => ({
    detection_id: detectionId,
    candidate_deer_id: candidate.candidate_deer_id,
    similarity_score: candidate.similarity_score,
    status: 'pending' as const,
  }))

  const { data, error } = await supabase
    .from('match_candidates')
    .insert(candidateRows as never)
    .select()

  if (error !== null) {
    return { data: null, error }
  }

  return { data: data as MatchCandidate[], error: null }
}

/**
 * Get match candidates for a specific detection
 * Returns candidates with deer details
 */
export async function getMatchCandidates(
  detectionId: string
): Promise<{ data: MatchCandidate[] | null; error: Error | null }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('match_candidates')
    .select('*')
    .eq('detection_id', detectionId)
    .order('similarity_score', { ascending: false })

  if (error !== null) {
    return { data: null, error }
  }

  return { data: data as MatchCandidate[], error: null }
}

/**
 * Get all pending match candidates for a user
 * Returns detections with pending matches that need review
 */
export async function getPendingMatches(
  userId: string
): Promise<{ data: MatchCandidate[] | null; error: Error | null }> {
  const supabase = await createClient()

  // Query match_candidates with status='pending' filtered by user ownership
  // RLS will ensure only accessible matches are returned
  const { data, error } = await supabase
    .from('match_candidates')
    .select(`
      *,
      detections!inner (
        id,
        image_id,
        images!inner (
          user_id
        )
      )
    `)
    .eq('status', 'pending')
    .eq('detections.images.user_id', userId)
    .order('created_at', { ascending: false })

  if (error !== null) {
    return { data: null, error }
  }

  return { data: data as MatchCandidate[], error: null }
}

/**
 * Confirm a match between a detection and a deer
 * Links detection to deer and updates deer.last_seen
 */
export async function confirmMatch(
  detectionId: string,
  deerId: string
): Promise<{ data: Detection | null; error: Error | null }> {
  const supabase = await createClient()

  // Update detection to link it to the deer
  const { data: detection, error: detectionError } = await supabase
    .from('detections')
    .update({ deer_id: deerId } as never)
    .eq('id', detectionId)
    .select()
    .single()

  if (detectionError !== null) {
    return { data: null, error: detectionError }
  }

  // Update match candidate status to 'confirmed'
  await supabase
    .from('match_candidates')
    .update({
      status: 'confirmed',
      reviewed_at: new Date().toISOString(),
    } as never)
    .eq('detection_id', detectionId)
    .eq('candidate_deer_id', deerId)

  // Update deer.last_seen to the image's captured_at timestamp
  const { data: image } = await supabase
    .from('images')
    .select('captured_at')
    .eq('id', (detection as Detection).image_id)
    .single()

  const capturedAt = (image as { captured_at: string | null } | null)?.captured_at
  if (capturedAt !== undefined && capturedAt !== null) {
    await supabase
      .from('deer')
      .update({
        last_seen: capturedAt,
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', deerId)
  }

  // Reject all other candidates for this detection
  await supabase
    .from('match_candidates')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
    } as never)
    .eq('detection_id', detectionId)
    .neq('candidate_deer_id', deerId)

  return { data: detection as Detection, error: null }
}

/**
 * Reject match candidates for a detection
 * Marks specified candidates as rejected
 */
export async function rejectCandidates(
  detectionId: string,
  deerIds: string[]
): Promise<{ error: Error | null }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('match_candidates')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
    } as never)
    .eq('detection_id', detectionId)
    .in('candidate_deer_id', deerIds)

  return { error }
}

/**
 * Create a new deer from a detection
 * Used when user decides this is a new deer (not a match)
 */
export async function createDeerFromDetection(
  detectionId: string,
  userId: string,
  name?: string
): Promise<{ data: Deer | null; error: Error | null }> {
  const supabase = await createClient()

  // Get detection and image details
  const { data: detection, error: detectionError } = await supabase
    .from('detections')
    .select('*, images!inner(captured_at)')
    .eq('id', detectionId)
    .single()

  if (detectionError !== null || detection === null) {
    return { data: null, error: detectionError }
  }

  // Create new deer
  const capturedAt = (detection as any).images.captured_at

  const deerData: Record<string, unknown> = {
    user_id: userId,
    first_seen: capturedAt ?? new Date().toISOString(),
    last_seen: capturedAt ?? new Date().toISOString(),
    status: 'watching',
  }

  if (name !== undefined) {
    deerData['name'] = name
  }

  const { data: newDeer, error: deerError } = await supabase
    .from('deer')
    .insert(deerData as never)
    .select()
    .single()

  if (deerError !== null) {
    return { data: null, error: deerError }
  }

  // Link detection to the new deer
  await supabase
    .from('detections')
    .update({ deer_id: (newDeer as Deer).id } as never)
    .eq('id', detectionId)

  // Update deer_embeddings if an orphaned embedding exists for this detection
  await supabase
    .from('deer_embeddings')
    .update({ deer_id: (newDeer as Deer).id } as never)
    .eq('detection_id', detectionId)
    .is('deer_id', null)

  // Reject all match candidates for this detection
  await supabase
    .from('match_candidates')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
    } as never)
    .eq('detection_id', detectionId)

  return { data: newDeer as Deer, error: null }
}
