import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { confirmMatch } from '@/lib/services/matching'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/deer/matches/{id}/confirm
 * Confirm AI match suggestion, linking detection to suggested deer
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id: matchId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Confirm the match
  const { data, error } = await confirmMatch(matchId, user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    message: 'Match confirmed',
    detection_id: data?.detection_id,
    deer_id: data?.deer_id,
  })
}
