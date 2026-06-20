import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createShowcase, listShowcases } from '@/lib/services/showcase'

/** GET /api/showcase — list the current user's showcases. */
export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError !== null || user === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data, error } = await listShowcases(user.id)
  if (error !== null) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ showcases: data ?? [] })
}

/** POST /api/showcase — create a showcase ({ title?, deerIds? }). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError !== null || user === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: unknown
    deerIds?: unknown
  }
  const input: { title?: string; deerIds?: string[] } = {}
  if (typeof body.title === 'string') input.title = body.title
  if (Array.isArray(body.deerIds)) {
    input.deerIds = body.deerIds.filter((d): d is string => typeof d === 'string')
  }

  const { data, error } = await createShowcase(user.id, input)
  if (error !== null || data === null) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create showcase' }, { status: 400 })
  }
  return NextResponse.json({ showcase: data }, { status: 201 })
}
