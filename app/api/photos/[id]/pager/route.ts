import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadPhotoView } from '@/lib/services/photo-view'
import { parseDetailFilters } from '@/lib/photos/detail-filters'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/photos/[id]/pager
 * Returns PhotoViewDTO JSON for a single photo (with optional filter context).
 * Used by the mobile photo pager to prefetch prev/next photos without a full
 * route reload. Signed URLs are short-lived and user-specific — never cache shared.
 */
export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError !== null || user === null) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const filters = parseDetailFilters(request.nextUrl.searchParams)
  const dto = await loadPhotoView(user.id, id, filters)

  if (!dto) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Signed URLs are short-lived and user-specific — never cache shared.
  return NextResponse.json(dto, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
