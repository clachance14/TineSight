import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { setShowcaseBucks, setShowcaseActive } from '@/lib/services/showcase'

/**
 * PATCH /api/showcase/[id] — update a showcase.
 * Body: { bucks?: string[] } to replace curated deer (ordered), and/or
 *       { isActive?: boolean } to revoke (false) / re-activate (true).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError !== null || user === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as {
    bucks?: unknown
    isActive?: unknown
  }

  if (Array.isArray(body.bucks)) {
    const deerIds = body.bucks.filter((d): d is string => typeof d === 'string')
    const { error } = await setShowcaseBucks(user.id, id, deerIds)
    if (error !== null) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }

  if (typeof body.isActive === 'boolean') {
    const { error } = await setShowcaseActive(user.id, id, body.isActive)
    if (error !== null) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
  }

  return NextResponse.json({ ok: true })
}
