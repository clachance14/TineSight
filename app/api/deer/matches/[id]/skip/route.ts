import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { skipMatch } from '@/lib/services/matching'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/deer/matches/{id}/skip
 * Skip match review, leaving it pending for later
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id: matchId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Skip is a no-op - match stays in pending state
  const { error } = await skipMatch(matchId, user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    message: 'Match skipped',
  })
}
