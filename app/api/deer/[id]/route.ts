import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDeerById, updateDeer, deleteDeer } from '@/lib/services/deer'
import { getCachedSignedUrl, getCachedSignedUrls } from '@/lib/cache/signed-url-cache'
import { jsonWithCache } from '@/lib/utils/cache-headers'

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

  // Get reference image URL and bbox if available
  let referenceImageUrl: string | null = null
  let referenceBbox: { x: number | null; y: number | null; width: number | null; height: number | null } | null = null

  if (deer.reference_detection_id) {
    const { data: refDetection } = await supabase
      .from('detections')
      .select('bbox_x, bbox_y, bbox_width, bbox_height, images!inner(file_path)')
      .eq('id', deer.reference_detection_id)
      .single()

    if (refDetection) {
      const imageData = refDetection as unknown as {
        images: { file_path: string }
        bbox_x: number | null
        bbox_y: number | null
        bbox_width: number | null
        bbox_height: number | null
      }
      referenceImageUrl = await getCachedSignedUrl(imageData.images.file_path)
      referenceBbox = {
        x: imageData.bbox_x,
        y: imageData.bbox_y,
        width: imageData.bbox_width,
        height: imageData.bbox_height,
      }
    }
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
      size_class,
      estimated_point_range,
      images!inner(file_path, captured_at)
    `)
    .eq('deer_id', deerId)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  // Get signed URLs for sightings - CACHED batch operation
  const sightingFilePaths = (sightings || []).map((s: any) => s.images.file_path)
  const cachedUrls = await getCachedSignedUrls(sightingFilePaths)

  const sightingsWithUrls = (sightings || []).map((sighting: any, index: number) => ({
    id: sighting.id,
    image_id: sighting.image_id,
    thumbnail_url: cachedUrls[index],
    captured_at: sighting.images.captured_at,
    size_class: sighting.size_class,
    estimated_point_range: sighting.estimated_point_range,
  }))

  return jsonWithCache({
    ...deer,
    reference_image_url: referenceImageUrl,
    reference_bbox: referenceBbox,
    sightings: sightingsWithUrls,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
  }, 'private-medium')
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
