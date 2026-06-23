import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPendingMatches } from '@/lib/services/matching'

/**
 * GET /api/deer/matches
 * List pending match candidates for review
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const detectionId = searchParams.get('detection_id')
  const deerId = searchParams.get('deer_id')

  // Lightweight count path (e.g. the sidebar badge) — avoids fetching full match
  // rows and signing crop URLs app-wide on every navigation. RLS scopes to the user.
  if (searchParams.get('count') === '1') {
    const { count, error: countError } = await supabase
      .from('match_candidates')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 })
    }
    return NextResponse.json({ matches: [], total_pending: count ?? 0 })
  }

  const { data: matches, error } = await getPendingMatches(user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Filter by detection and/or candidate buck if provided
  let filteredMatches = matches ?? []
  if (detectionId) {
    filteredMatches = filteredMatches.filter(m => m.detection_id === detectionId)
  }
  if (deerId) {
    filteredMatches = filteredMatches.filter(m => m.candidate_deer_id === deerId)
  }

  return NextResponse.json({
    matches: filteredMatches,
    total_pending: filteredMatches.length,
  })
}
