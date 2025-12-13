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

  const { data: matches, error } = await getPendingMatches(user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Filter by detection_id if provided
  let filteredMatches = matches ?? []
  if (detectionId) {
    filteredMatches = filteredMatches.filter(m => m.detection_id === detectionId)
  }

  return NextResponse.json({
    matches: filteredMatches,
    total_pending: filteredMatches.length,
  })
}
