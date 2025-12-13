import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createNewFromMatch } from '@/lib/services/matching'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/deer/matches/{id}/create-new
 * Create a new deer profile from a detection during match review
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: matchId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  if (!body.name) {
    return NextResponse.json(
      { error: 'name is required' },
      { status: 400 }
    )
  }

  // Create new deer from the match
  const { data, error } = await createNewFromMatch(
    matchId,
    body.name,
    body.notes ?? null,
    user.id
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    deer: data?.deer,
    detection_id: data?.detection_id,
  }, { status: 201 })
}
