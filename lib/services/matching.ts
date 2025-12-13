import { createClient } from '@/lib/supabase/server'

export interface MatchCandidate {
  id: string
  detection_id: string
  candidate_deer_id: string
  gemini_confidence: number | null
  gemini_reasoning: string | null
  status: 'pending' | 'confirmed' | 'rejected'
  reviewed_at: string | null
  created_at: string
}

export interface MatchReview extends MatchCandidate {
  detection: {
    id: string
    image_id: string
    species: string
    sex: string
    antler_points: number | null
    age_class: string | null
  }
  suggested_deer: {
    id: string
    name: string
  } | null
}

/**
 * Get pending match candidates for review
 */
export async function getPendingMatches(
  userId: string,
  detectionId?: string
): Promise<{ data: MatchReview[] | null; error: Error | null }> {
  const supabase = await createClient()

  let query = supabase
    .from('match_candidates')
    .select(`
      *,
      detection:detections!detection_id(
        id, image_id, species, sex, antler_points, age_class,
        images!inner(user_id)
      ),
      suggested_deer:deer!candidate_deer_id(id, name)
    `)
    .eq('status', 'pending')
    .eq('detection.images.user_id', userId)
    .order('gemini_confidence', { ascending: false })

  if (detectionId) {
    query = query.eq('detection_id', detectionId)
  }

  const { data, error } = await query

  if (error) {
    return { data: null, error }
  }

  return { data: data as unknown as MatchReview[], error: null }
}

/**
 * Get unassigned buck detections for matching
 */
export async function getUnassignedBucks(
  userId: string
): Promise<{ data: Array<{ id: string; image_id: string }> | null; error: Error | null }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('detections')
    .select('id, image_id, images!inner(user_id)')
    .eq('sex', 'buck')
    .is('deer_id', null)
    .eq('images.user_id', userId)

  return { data: data as Array<{ id: string; image_id: string }> | null, error }
}

/**
 * Get catalog deer with reference detections for matching
 */
export async function getCatalogWithReferences(
  userId: string
): Promise<{
  data: Array<{ id: string; name: string; reference_detection_id: string }> | null
  error: Error | null
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('deer')
    .select('id, name, reference_detection_id')
    .eq('account_id', userId)
    .not('reference_detection_id', 'is', null)

  return { data: data as Array<{ id: string; name: string; reference_detection_id: string }> | null, error }
}

/**
 * Create a match candidate
 */
export async function createMatchCandidate(
  detectionId: string,
  candidateDeerIdId: string,
  geminiConfidence: number,
  geminiReasoning: string | null
): Promise<{ data: MatchCandidate | null; error: Error | null }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('match_candidates')
    .insert({
      detection_id: detectionId,
      candidate_deer_id: candidateDeerIdId,
      gemini_confidence: geminiConfidence,
      gemini_reasoning: geminiReasoning,
      status: 'pending',
    } as never)
    .select()
    .single()

  return { data: data as MatchCandidate | null, error }
}

/**
 * Confirm a match - link detection to deer
 */
export async function confirmMatch(
  matchId: string,
  _userId: string
): Promise<{ data: { detection_id: string; deer_id: string } | null; error: Error | null }> {
  const supabase = await createClient()

  // Get match candidate
  const { data: match, error: fetchError } = await supabase
    .from('match_candidates')
    .select('detection_id, candidate_deer_id')
    .eq('id', matchId)
    .single()

  if (fetchError || !match) {
    return { data: null, error: new Error('Match not found') }
  }

  // Update detection to link to deer
  await supabase
    .from('detections')
    .update({ deer_id: match.candidate_deer_id } as never)
    .eq('id', match.detection_id)

  // Update match status
  await supabase
    .from('match_candidates')
    .update({ status: 'confirmed', reviewed_at: new Date().toISOString() } as never)
    .eq('id', matchId)

  // Reject other candidates for this detection
  await supabase
    .from('match_candidates')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() } as never)
    .eq('detection_id', match.detection_id)
    .neq('id', matchId)

  return {
    data: { detection_id: match.detection_id, deer_id: match.candidate_deer_id },
    error: null,
  }
}

/**
 * Correct a match - assign detection to different deer
 */
export async function correctMatch(
  matchId: string,
  correctDeerId: string,
  _userId: string
): Promise<{ data: { detection_id: string; deer_id: string } | null; error: Error | null }> {
  const supabase = await createClient()

  // Get match candidate
  const { data: match, error: fetchError } = await supabase
    .from('match_candidates')
    .select('detection_id')
    .eq('id', matchId)
    .single()

  if (fetchError || !match) {
    return { data: null, error: new Error('Match not found') }
  }

  // Update detection to link to correct deer
  await supabase
    .from('detections')
    .update({ deer_id: correctDeerId } as never)
    .eq('id', match.detection_id)

  // Update all match candidates for this detection as rejected
  await supabase
    .from('match_candidates')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() } as never)
    .eq('detection_id', match.detection_id)

  return {
    data: { detection_id: match.detection_id, deer_id: correctDeerId },
    error: null,
  }
}

/**
 * Reject all matches for a detection
 */
export async function rejectMatch(
  matchId: string,
  _userId: string
): Promise<{ error: Error | null }> {
  const supabase = await createClient()

  const { data: match } = await supabase
    .from('match_candidates')
    .select('detection_id')
    .eq('id', matchId)
    .single()

  if (!match) {
    return { error: new Error('Match not found') }
  }

  // Reject all candidates for this detection
  await supabase
    .from('match_candidates')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() } as never)
    .eq('detection_id', match.detection_id)

  return { error: null }
}

/**
 * Skip match for later review (no-op, just returns)
 */
export async function skipMatch(
  _matchId: string,
  _userId: string
): Promise<{ error: Error | null }> {
  // No database update needed - match stays pending
  return { error: null }
}

/**
 * Get match candidates for a detection
 */
export async function getMatchCandidates(
  detectionId: string
): Promise<{
  data: Array<{
    id: string
    detection_id: string
    candidate_deer_id: string
    similarity_score: number
    status: string
    created_at: string
  }> | null
  error: Error | null
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('match_candidates')
    .select('id, detection_id, candidate_deer_id, gemini_confidence, status, created_at')
    .eq('detection_id', detectionId)
    .order('gemini_confidence', { ascending: false })

  if (error) {
    return { data: null, error }
  }

  // Map gemini_confidence to similarity_score for API compatibility
  const mapped = (data || []).map(c => ({
    id: c.id,
    detection_id: c.detection_id,
    candidate_deer_id: c.candidate_deer_id,
    similarity_score: c.gemini_confidence ?? 0,
    status: c.status,
    created_at: c.created_at,
  }))

  return { data: mapped, error: null }
}

/**
 * Reject match candidates for specific deer IDs
 */
export async function rejectCandidates(
  detectionId: string,
  deerIds: string[]
): Promise<{ error: Error | null }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('match_candidates')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() } as never)
    .eq('detection_id', detectionId)
    .in('candidate_deer_id', deerIds)

  return { error }
}

/**
 * Create a new deer from a detection (without going through match flow)
 */
export async function createDeerFromDetection(
  detectionId: string,
  userId: string,
  name?: string
): Promise<{
  data: {
    id: string
    user_id: string
    name: string | null
    notes: string | null
    first_seen: string | null
    last_seen: string | null
    status: string
    created_at: string
    updated_at: string
  } | null
  error: Error | null
}> {
  const supabase = await createClient()

  // Verify detection exists and belongs to user
  const { data: detection, error: detectionError } = await supabase
    .from('detections')
    .select('id, image_id, images!inner(user_id, captured_at)')
    .eq('id', detectionId)
    .single()

  if (detectionError || !detection) {
    return { data: null, error: new Error('Detection not found') }
  }

  const detectionData = detection as { id: string; image_id: string; images: { user_id: string; captured_at: string | null } }
  if (detectionData.images.user_id !== userId) {
    return { data: null, error: new Error('Forbidden') }
  }

  // Create new deer with this detection as reference
  const { data: deer, error: createError } = await supabase
    .from('deer')
    .insert({
      user_id: userId,
      name: name ?? null,
      reference_detection_id: detectionId,
      first_seen: detectionData.images.captured_at,
      last_seen: detectionData.images.captured_at,
    } as never)
    .select()
    .single()

  if (createError || !deer) {
    return { data: null, error: createError }
  }

  // Link detection to the new deer
  await supabase
    .from('detections')
    .update({ deer_id: deer.id } as never)
    .eq('id', detectionId)

  // Reject any pending match candidates for this detection
  await supabase
    .from('match_candidates')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() } as never)
    .eq('detection_id', detectionId)

  return {
    data: {
      id: deer.id,
      user_id: deer.user_id,
      name: deer.name,
      notes: deer.notes,
      first_seen: deer.first_seen,
      last_seen: deer.last_seen,
      status: deer.status ?? 'active',
      created_at: deer.created_at,
      updated_at: deer.updated_at,
    },
    error: null,
  }
}

/**
 * Create new deer from match and assign detection
 */
export async function createNewFromMatch(
  matchId: string,
  name: string,
  notes: string | null,
  userId: string
): Promise<{ data: { deer: { id: string; name: string }; detection_id: string } | null; error: Error | null }> {
  const supabase = await createClient()

  // Get match candidate
  const { data: match, error: fetchError } = await supabase
    .from('match_candidates')
    .select('detection_id')
    .eq('id', matchId)
    .single()

  if (fetchError || !match) {
    return { data: null, error: new Error('Match not found') }
  }

  // Create new deer with detection as reference
  const { data: deer, error: createError } = await supabase
    .from('deer')
    .insert({
      user_id: userId,
      name,
      notes,
      reference_detection_id: match.detection_id,
    } as never)
    .select()
    .single()

  if (createError || !deer) {
    return { data: null, error: createError }
  }

  // Update detection
  await supabase
    .from('detections')
    .update({ deer_id: deer.id, is_reference: true } as never)
    .eq('id', match.detection_id)

  // Reject all match candidates
  await supabase
    .from('match_candidates')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() } as never)
    .eq('detection_id', match.detection_id)

  return {
    data: {
      deer: { id: deer.id, name: name },
      detection_id: match.detection_id,
    },
    error: null,
  }
}
