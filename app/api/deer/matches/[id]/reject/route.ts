import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rejectMatch } from '@/lib/services/matching'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/deer/matches/{id}/reject
 * Reject all match candidates for a detection
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id: matchId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Reject all match candidates for this detection
  const { error } = await rejectMatch(matchId, user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    message: 'Match rejected',
  })
}
