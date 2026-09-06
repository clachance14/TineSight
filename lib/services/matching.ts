import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { compareFingerprints } from '@/lib/fingerprint/compare'
import type { AntlerFingerprint } from '@/types/fingerprint'

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
    crop_url: string | null
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
      detection:detections!detection_id!inner(
        id, image_id, species, sex, antler_points, age_class, crop_file_path,
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

  const rows = (data ?? []) as unknown as Array<
    MatchReview & { detection: { crop_file_path: string | null } }
  >

  // Sign each candidate's crop so the operator can visually verify the sighting.
  // Signed in parallel; a deduped path map avoids re-signing shared crops.
  for (const row of rows) {
    if (row.detection?.crop_file_path != null && !/^crops\/[0-9a-f-]{36}\.jpg$/i.test(row.detection.crop_file_path)) row.detection.crop_file_path = null
  }
  const admin = createAdminClient()
  const paths = Array.from(
    new Set(rows.map((r) => r.detection?.crop_file_path).filter((p): p is string => p != null && p !== ''))
  )
  const signed = await Promise.all(
    paths.map((path) => admin.storage.from('photos').createSignedUrl(path, 3600))
  )
  const urlByPath = new Map<string, string>()
  paths.forEach((path, i) => {
    const url = signed[i]?.data?.signedUrl
    if (url != null) urlByPath.set(path, url)
  })

  const matches: MatchReview[] = rows.map((r) => ({
    ...r,
    detection: {
      ...r.detection,
      crop_url: r.detection?.crop_file_path != null ? urlByPath.get(r.detection.crop_file_path) ?? null : null,
    },
  }))

  return { data: matches, error: null }
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
    .eq('user_id', userId)
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
  userId: string
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

  const { data: ownedBuck } = await supabase.from('deer').select('id')
    .eq('id', match.candidate_deer_id).eq('user_id', userId).maybeSingle()
  if (!ownedBuck) return { data: null, error: new Error('Buck not found') }

  // Update detection to link to deer
  const { error: linkError } = await supabase
    .from('detections')
    .update({ deer_id: match.candidate_deer_id } as never)
    .eq('id', match.detection_id)
    .is('deleted_at', null)
    .select('id').single()
  if (linkError) return { data: null, error: linkError }

  // Update match status
  const { error: matchError } = await supabase
    .from('match_candidates')
    .update({ status: 'confirmed', reviewed_at: new Date().toISOString() } as never)
    .eq('id', matchId)
  if (matchError) return { data: null, error: matchError }

  // Reject other candidates for this detection
  const { error: rejectError } = await supabase
    .from('match_candidates')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() } as never)
    .eq('detection_id', match.detection_id)
    .neq('id', matchId)
  if (rejectError) return { data: null, error: rejectError }

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
  userId: string
): Promise<{ data: { detection_id: string; deer_id: string } | null; error: Error | null }> {
  const supabase = await createClient()

  const { data: ownedBuck } = await supabase.from('deer').select('id')
    .eq('id', correctDeerId).eq('user_id', userId).maybeSingle()
  if (!ownedBuck) return { data: null, error: new Error('Buck not found') }

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
  const { error: linkError } = await supabase
    .from('detections')
    .update({ deer_id: correctDeerId } as never)
    .eq('id', match.detection_id)
    .is('deleted_at', null)
    .select('id').single()
  if (linkError) return { data: null, error: linkError }

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

/**
 * Batch confirm multiple match candidates
 */
export async function batchConfirmMatches(
  matchIds: string[],
  userId: string
): Promise<{ data: { confirmed_count: number } | null; error: Error | null }> {
  const supabase = await createClient()

  if (matchIds.length === 0) {
    return { data: { confirmed_count: 0 }, error: null }
  }

  // Get all match candidates
  const { data: matches, error: fetchError } = await supabase
    .from('match_candidates')
    .select('id, detection_id, candidate_deer_id, detection:detections!detection_id(images!inner(user_id))')
    .in('id', matchIds)
    .eq('status', 'pending')

  if (fetchError || !matches) {
    return { data: null, error: new Error('Failed to fetch matches') }
  }

  // Verify all matches belong to the user
  const matchesData = matches as Array<{
    id: string
    detection_id: string
    candidate_deer_id: string
    detection: { images: { user_id: string } }
  }>

  const unauthorized = matchesData.some(m => m.detection.images.user_id !== userId)
  if (unauthorized) {
    return { data: null, error: new Error('Unauthorized') }
  }

  const detectionIds = new Set(matchesData.map((match) => match.detection_id))
  if (detectionIds.size !== matchesData.length) {
    return { data: null, error: new Error('Choose only one buck per detection') }
  }
  let confirmedCount = 0
  for (const match of matchesData) {
    const { error } = await confirmMatch(match.id, userId)
    if (error) return { data: null, error }
    confirmedCount++
  }

  return { data: { confirmed_count: confirmedCount }, error: null }
}

/**
 * Batch reject multiple match candidates
 */
export async function batchRejectMatches(
  matchIds: string[],
  userId: string
): Promise<{ data: { rejected_count: number } | null; error: Error | null }> {
  const supabase = await createClient()

  if (matchIds.length === 0) {
    return { data: { rejected_count: 0 }, error: null }
  }

  // Get all match candidates to verify ownership
  const { data: matches, error: fetchError } = await supabase
    .from('match_candidates')
    .select('id, detection:detections!detection_id(images!inner(user_id))')
    .in('id', matchIds)
    .eq('status', 'pending')

  if (fetchError || !matches) {
    return { data: null, error: new Error('Failed to fetch matches') }
  }

  // Verify all matches belong to the user
  const matchesData = matches as Array<{
    id: string
    detection: { images: { user_id: string } }
  }>

  const unauthorized = matchesData.some(m => m.detection.images.user_id !== userId)
  if (unauthorized) {
    return { data: null, error: new Error('Unauthorized') }
  }

  // Update all matches to rejected
  const { error: updateError } = await supabase
    .from('match_candidates')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString() } as never)
    .in('id', matchIds)

  if (updateError) {
    return { data: null, error: updateError }
  }

  return { data: { rejected_count: matchesData.length }, error: null }
}

// ============================================================================
// "Find sightings" — operator-driven, on-demand ranked re-ID (ADR 0005)
//
// The automatic reverse-reid-scan only proposes match_candidates at/above the
// strong threshold. This is the manual complement: for one Buck, rank ALL of the
// user's unassigned fingerprinted Detections by antler-print similarity and let
// the operator confirm/reject crop-by-crop. Ranked-manual is resilient to the
// fingerprint's weak identity discrimination (it scores "is this a big typical
// rack", not "is this *this* buck"), so we surface a shortlist, never auto-assign.
//
// State model: transient + sticky rejects. The search writes nothing on its own;
// a confirm sets detections.deer_id (adds the Sighting) and a reject writes a
// status='rejected' match_candidate so the crop is suppressed on future searches.
// ============================================================================

export interface SightingCandidate {
  detection_id: string
  crop_url: string | null
  similarity: number // 0–100, antler-print similarity to the Buck's reference
  score_gross: number | null
  point_range: string | null // e.g. "8-10 points" (detections.estimated_point_range)
  age_class: string | null
  captured_at: string | null // when the source Photo was taken (re-ID context)
}

const SIGHTING_CANDIDATE_LIMIT = 15
// Pure-compute compare is cheap, but cap the rows we pull (each carries a
// fingerprint JSON blob) so a huge unassigned pool can't blow up the request.
const MAX_FINGERPRINTED_SCAN = 2000

/**
 * Rank the user's unassigned, fingerprinted Detections by antler-print similarity
 * to a Buck's reference, for manual review. Returns top-N with signed crops.
 * Returns [] (not an error) when the Buck has no reference fingerprint — only
 * trophy-band Bucks get one (ADR 0004), so non-trophy Bucks have nothing to rank.
 */
export async function findSightingCandidates(
  userId: string,
  deerId: string,
  limit = SIGHTING_CANDIDATE_LIMIT
): Promise<{ data: SightingCandidate[] | null; error: Error | null }> {
  const supabase = await createClient()

  // 1. The Buck + its reference fingerprint (what we rank against).
  const { data: deer, error: deerErr } = await supabase
    .from('deer')
    .select('id, reference_detection_id')
    .eq('id', deerId)
    .single()
  if (deerErr || !deer) {
    return { data: null, error: new Error('Buck not found') }
  }
  if (!deer.reference_detection_id) {
    return { data: [], error: null }
  }

  const { data: refDetection } = await supabase
    .from('detections')
    .select('antler_fingerprint')
    .eq('id', deer.reference_detection_id)
    .single()
  const refFp = (refDetection?.antler_fingerprint as AntlerFingerprint | null) ?? null
  if (!refFp) {
    return { data: [], error: null }
  }

  // 2. Detections already decided for THIS Buck are off the table. Confirmed ones
  //    also carry deer_id (excluded by the pool filter), but rejected ones don't —
  //    the sticky-reject rows are what keep them from re-surfacing here.
  const excluded = new Set<string>()
  for (let offset = 0; ; offset += 500) {
    const { data: decided, error } = await supabase
      .from('match_candidates').select('detection_id')
      .eq('candidate_deer_id', deerId).in('status', ['rejected', 'confirmed'])
      .order('detection_id').range(offset, offset + 499)
    if (error) return { data: null, error }
    for (const row of decided ?? []) excluded.add(row.detection_id)
    if ((decided?.length ?? 0) < 500) break
  }

  // The intentionally bounded search scans up to 2000 live fingerprints. Page
  // below PostgREST's server cap; limit(2000) alone silently returned only 1000.
  const pool: unknown[] = []
  for (let offset = 0; offset < MAX_FINGERPRINTED_SCAN; offset += 500) {
    const { data: page, error } = await supabase
      .from('detections')
      .select('id, crop_file_path, score_gross, estimated_point_range, age_class, antler_fingerprint, images!inner(user_id, captured_at)')
      .is('deer_id', null).is('deleted_at', null)
      .not('antler_fingerprint', 'is', null).eq('images.user_id', userId)
      .order('id').range(offset, Math.min(offset + 499, MAX_FINGERPRINTED_SCAN - 1))
    if (error) return { data: null, error }
    pool.push(...(page ?? []))
    if ((page?.length ?? 0) < 500) break
  }

  const rows = (pool ?? []) as unknown as Array<{
    id: string
    crop_file_path: string | null
    score_gross: number | null
    estimated_point_range: string | null
    age_class: string | null
    antler_fingerprint: AntlerFingerprint | null
    images: { captured_at: string | null } | null
  }>

  // 4. Rank by fingerprint similarity (free, pure compute).
  for (const row of rows) {
    if (row.crop_file_path != null && !/^crops\/[0-9a-f-]{36}\.jpg$/i.test(row.crop_file_path)) row.crop_file_path = null
  }
  const ranked = rows
    .filter((d) => !excluded.has(d.id) && d.antler_fingerprint != null)
    .map((d) => {
      let similarity = -1
      try {
        similarity = compareFingerprints(refFp, d.antler_fingerprint as AntlerFingerprint).overall_similarity
      } catch {
        similarity = -1
      }
      return { d, similarity }
    })
    .filter((r) => r.similarity >= 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)

  // Migration 054 makes crop pointers worker-managed (including legacy crop UUIDs).
  // 5. Sign crops (dedup shared paths). Crops live at a FLAT `crops/{id}.jpg`
  //    prefix, which the photos-bucket RLS doesn't grant to the user session
  //    (see migration 047/049 — the same gap that "?"-blanked these thumbnails).
  //    Ownership is already enforced above (the pool is filtered to this user's
  //    images), so we sign with the service role — the same authorize-then-
  //    service-role-sign pattern the public Showcase uses (ADR 0001).
  const admin = createAdminClient()
  const paths = Array.from(
    new Set(ranked.map((r) => r.d.crop_file_path).filter((p): p is string => p != null && p !== ''))
  )
  const signed = await Promise.all(
    paths.map((p) => admin.storage.from('photos').createSignedUrl(p, 3600))
  )
  const urlByPath = new Map<string, string>()
  paths.forEach((p, i) => {
    const url = signed[i]?.data?.signedUrl
    if (url != null) urlByPath.set(p, url)
  })

  const candidates: SightingCandidate[] = ranked.map((r) => ({
    detection_id: r.d.id,
    crop_url: r.d.crop_file_path != null ? urlByPath.get(r.d.crop_file_path) ?? null : null,
    similarity: Math.round(r.similarity * 10) / 10,
    score_gross: r.d.score_gross,
    point_range: r.d.estimated_point_range,
    age_class: r.d.age_class,
    captured_at: r.d.images?.captured_at ?? null,
  }))

  return { data: candidates, error: null }
}

/**
 * Confirm a "Find sightings" candidate: assign the Detection to the Buck. THIS is
 * the act of adding a Sighting (no-auto-merge — it took a human confirm to land
 * here). Verifies ownership of both sides; RLS guards the writes regardless.
 */
export async function addSighting(
  userId: string,
  deerId: string,
  detectionId: string,
  similarity = 0
): Promise<{ data: { detection_id: string; deer_id: string } | null; error: Error | null }> {
  const supabase = await createClient()

  // The Buck must belong to the user.
  const { data: deer } = await supabase.from('deer').select('id, user_id').eq('id', deerId).single()
  if (!deer || (deer as { user_id: string }).user_id !== userId) {
    return { data: null, error: new Error('Buck not found') }
  }

  // The Detection must belong to the user (via images) and be unassigned.
  const { data: detection } = await supabase
    .from('detections')
    .select('id, deer_id, images!inner(user_id)')
    .eq('id', detectionId)
    .is('deleted_at', null)
    .single()
  const det = detection as unknown as { id: string; deer_id: string | null; images: { user_id: string } } | null
  if (!det || det.images.user_id !== userId) {
    return { data: null, error: new Error('Detection not found') }
  }
  if (det.deer_id != null) {
    return { data: null, error: new Error('Detection already assigned') }
  }

  // Assign — adding the Sighting.
  const { error: updErr } = await supabase
    .from('detections')
    .update({ deer_id: deerId } as never)
    .eq('id', detectionId)
    .is('deer_id', null)
    .is('deleted_at', null)
    .select('id').single()
  if (updErr) {
    return { data: null, error: updErr }
  }

  // Record a confirmed candidate for audit + to keep it out of future searches.
  const sim01 = similarityToUnit(similarity)
  await supabase.from('match_candidates').upsert(
    {
      detection_id: detectionId,
      candidate_deer_id: deerId,
      similarity_score: sim01,
      antler_print_similarity: sim01,
      status: 'confirmed',
      reviewed_at: new Date().toISOString(),
    } as never,
    { onConflict: 'detection_id,candidate_deer_id' }
  )

  return { data: { detection_id: detectionId, deer_id: deerId }, error: null }
}

/**
 * Sticky reject for a "Find sightings" candidate: write a status='rejected'
 * match_candidate so this Detection is suppressed in future searches for this
 * Buck. Leaves the Detection unassigned (it may still be some OTHER Buck).
 */
export async function rejectSightingCandidate(
  userId: string,
  deerId: string,
  detectionId: string,
  similarity = 0
): Promise<{ error: Error | null }> {
  const supabase = await createClient()

  const { data: ownedBuck } = await supabase.from('deer').select('id').eq('id', deerId).eq('user_id', userId).maybeSingle()
  if (!ownedBuck) return { error: new Error('Buck not found') }

  // Verify ownership explicitly for a clean 404 instead of a silent RLS drop.
  const { data: detection } = await supabase
    .from('detections')
    .select('id, images!inner(user_id)')
    .eq('id', detectionId)
    .single()
  const det = detection as unknown as { id: string; images: { user_id: string } } | null
  if (!det || det.images.user_id !== userId) {
    return { error: new Error('Detection not found') }
  }

  const sim01 = similarityToUnit(similarity)
  const { error } = await supabase.from('match_candidates').upsert(
    {
      detection_id: detectionId,
      candidate_deer_id: deerId,
      similarity_score: sim01,
      antler_print_similarity: sim01,
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
    } as never,
    { onConflict: 'detection_id,candidate_deer_id' }
  )

  return { error }
}

/** Clamp a 0–100 similarity into the DECIMAL(5,4) 0–1 unit scale the table stores. */
function similarityToUnit(similarity: number): number {
  const unit = Math.round((similarity / 100) * 10000) / 10000
  return Math.min(1, Math.max(0, unit))
}
