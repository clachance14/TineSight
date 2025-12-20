import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createDeer, getDeerCatalog } from '@/lib/services/deer'
import { jsonWithCache } from '@/lib/utils/cache-headers'

/**
 * GET /api/deer
 * List deer catalog with pagination and optional search filter
 *
 * Query params:
 * - search: string (optional) - Filter by deer name
 * - limit: number (optional, default 24, max 100) - Page size
 * - cursor: string (optional) - Pagination cursor from previous response
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') ?? undefined
  const cursor = searchParams.get('cursor') ?? undefined
  const limitParam = searchParams.get('limit')

  // Validate and parse limit (default 24, max 100)
  let limit = 24
  if (limitParam !== null) {
    const parsedLimit = parseInt(limitParam, 10)
    if (!isNaN(parsedLimit) && parsedLimit > 0) {
      limit = Math.min(parsedLimit, 100)
    }
  }

  // Build filters object, only including defined values
  const filters: { search?: string; limit?: number; cursor?: string } = { limit }
  if (search) filters.search = search
  if (cursor) filters.cursor = cursor

  const { data, error } = await getDeerCatalog(user.id, filters)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return jsonWithCache(
    {
      deer: data?.deer ?? [],
      nextCursor: data?.nextCursor ?? null,
      total: data?.total ?? 0,
    },
    'private-short'
  )
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
