import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { regenerateShowcaseToken } from '@/lib/services/showcase'

/** POST /api/showcase/[id]/regenerate — rotate the token (invalidates old link). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError !== null || user === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const { data, error } = await regenerateShowcaseToken(user.id, id)
  if (error !== null || data === null) {
    return NextResponse.json({ error: error?.message ?? 'Failed to regenerate token' }, { status: 400 })
  }
  return NextResponse.json({ token: data.token })
}
