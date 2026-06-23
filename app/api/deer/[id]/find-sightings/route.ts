import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { findSightingCandidates, addSighting, rejectSightingCandidate } from '@/lib/services/matching'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/deer/[id]/find-sightings
 * Rank the user's unassigned fingerprinted Detections by antler-print similarity
 * to this Buck, for manual review (ADR 0005). Transient — writes nothing.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id: deerId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await findSightingCandidates(user.id, deerId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ candidates: data ?? [] })
}

/**
 * POST /api/deer/[id]/find-sightings
 * Review one candidate. decision='confirm' adds the Sighting (sets deer_id);
 * decision='reject' writes a sticky rejection so it won't re-surface.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: deerId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as
    | { detectionId?: string; decision?: string; similarity?: number }
    | null
  const detectionId = body?.detectionId
  const decision = body?.decision
  const similarity = typeof body?.similarity === 'number' ? body.similarity : 0

  if (!detectionId || (decision !== 'confirm' && decision !== 'reject')) {
    return NextResponse.json(
      { error: 'detectionId and decision (confirm|reject) are required' },
      { status: 400 }
    )
  }

  if (decision === 'confirm') {
    const { data, error } = await addSighting(user.id, deerId, detectionId, similarity)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ message: 'Sighting added', ...data })
  }

  const { error } = await rejectSightingCandidate(user.id, deerId, detectionId, similarity)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return NextResponse.json({ message: 'Candidate rejected' })
}
