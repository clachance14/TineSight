import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createDeer, getDeerCatalog } from '@/lib/services/deer'

/**
 * GET /api/deer
 * List deer catalog with optional search filter
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') ?? undefined

  const { data: deer, error } = await getDeerCatalog(user.id, search)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ deer })
}

/**
 * POST /api/deer
 * Create a new deer profile from a detection
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  if (!body.name || !body.detection_id) {
    return NextResponse.json(
      { error: 'name and detection_id are required' },
      { status: 400 }
    )
  }

  const { data: deer, error } = await createDeer(user.id, {
    name: body.name,
    notes: body.notes,
    detection_id: body.detection_id,
  })

  if (error) {
    // Check if it's a duplicate name error
    if (error.message.includes('already exists')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    // Check if detection not found
    if (error.message.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(deer, { status: 201 })
}
