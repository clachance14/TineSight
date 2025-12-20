import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { correctMatch } from '@/lib/services/matching'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/deer/matches/{id}/correct
 * Override AI suggestion with user-selected deer
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: matchId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  if (!body.deer_id) {
    return NextResponse.json(
      { error: 'deer_id is required' },
      { status: 400 }
    )
  }

  // Correct the match with the user-provided deer_id
  const { data, error } = await correctMatch(matchId, body.deer_id, user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    message: 'Match corrected',
    detection_id: data?.detection_id,
    deer_id: data?.deer_id,
  })
}
