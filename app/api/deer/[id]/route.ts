import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDeerById, updateDeer, deleteDeer } from '@/lib/services/deer'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/deer/[id]
 * Get deer profile with sighting history (paginated)
 * Query params:
 * - page: Page number (1-indexed, default: 1)
 * - pageSize: Items per page (default: 12)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: deerId } = await params

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: deer, error } = await getDeerById(user.id, deerId)

  if (error || !deer) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Parse pagination params
  const searchParams = request.nextUrl.searchParams
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
  const pageSize = Math.max(1, Math.min(100, parseInt(searchParams.get('pageSize') || '12', 10)))
  const offset = (page - 1) * pageSize

  // Get total count for pagination metadata
  const { count } = await supabase
    .from('detections')
    .select('*', { count: 'exact', head: true })
    .eq('deer_id', deerId)

  const total = count ?? 0
  const totalPages = Math.ceil(total / pageSize)

  // Get sightings (all detections linked to this deer) - paginated
  const { data: sightings } = await supabase
    .from('detections')
    .select(`
      id,
      image_id,
      antler_points,
      images!inner(file_path, captured_at)
    `)
    .eq('deer_id', deerId)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  // Get signed URLs for sightings
  const sightingsWithUrls = await Promise.all(
    (sightings || []).map(async (sighting: any) => {
      const { data: urlData } = await supabase
        .storage
        .from('images')
        .createSignedUrl(sighting.images.file_path, 3600)

      return {
        id: sighting.id,
        image_id: sighting.image_id,
        thumbnail_url: urlData?.signedUrl || null,
        captured_at: sighting.images.captured_at,
        antler_points: sighting.antler_points,
      }
    })
  )

  return NextResponse.json({
    ...deer,
    sightings: sightingsWithUrls,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  })
}

/**
 * PATCH /api/deer/[id]
 * Update deer profile (name and/or notes)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: deerId } = await params

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { data: deer, error } = await updateDeer(user.id, deerId, body)

  if (error) {
    if (error.message.includes('already exists')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error.message.includes('Not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(deer)
}

/**
 * DELETE /api/deer/[id]
 * Delete deer profile (detections remain but become unassigned)
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id: deerId } = await params

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await deleteDeer(user.id, deerId)

  if (error) {
    if (error.message.includes('Not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
