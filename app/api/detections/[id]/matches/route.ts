import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMatchCandidates } from '@/lib/services/matching'
import { getCachedSignedUrls } from '@/lib/cache/signed-url-cache'
import type { Deer } from '@/types/database'

interface DeerSummary {
  id: string
  name: string | null
  first_seen: string | null
  last_seen: string | null
  representative_image_url: string | null
}

interface MatchCandidateResponse {
  id: string
  detection_id: string
  candidate_deer_id: string
  similarity_score: number
  status: 'pending' | 'confirmed' | 'rejected'
  created_at: string
  deer: DeerSummary
}

interface MatchCandidatesListResponse {
  candidates: MatchCandidateResponse[]
}

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/detections/[id]/matches
 * Returns match candidates for a detection with deer summary information
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse<MatchCandidatesListResponse | { error: string }>> {
  try {
    const { id } = await context.params

    // Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError !== null || user === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: 'Invalid detection ID format' }, { status: 400 })
    }

    // Verify detection exists and user owns it
    const { data: detection, error: detectionError } = await supabase
      .from('detections')
      .select('id, image_id, images!inner(user_id)')
      .eq('id', id)
      .single()

    if (detectionError !== null) {
      console.error('Failed to get detection:', detectionError)
      return NextResponse.json({ error: 'Detection not found' }, { status: 404 })
    }

    if (detection === null) {
      return NextResponse.json({ error: 'Detection not found' }, { status: 404 })
    }

    // Check ownership
    const detectionData = detection as { id: string; image_id: string; images: { user_id: string } }
    if (detectionData.images.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get match candidates
    const { data: candidates, error: candidatesError } = await getMatchCandidates(id)

    if (candidatesError !== null) {
      console.error('Failed to get match candidates:', candidatesError)
      return NextResponse.json({ error: 'Failed to fetch match candidates' }, { status: 500 })
    }

    if (candidates === null || candidates.length === 0) {
      return NextResponse.json({ candidates: [] }, { status: 200 })
    }

    // Get deer details for all candidates
    const deerIds = candidates.map(c => c.candidate_deer_id)
    const { data: deerList, error: deerError } = await supabase
      .from('deer')
      .select('id, name, first_seen, last_seen, representative_image_id, images!deer_representative_image_id_fkey(file_path)')
      .in('id', deerIds)

    if (deerError !== null) {
      console.error('Failed to get deer details:', deerError)
      return NextResponse.json({ error: 'Failed to fetch deer details' }, { status: 500 })
    }

    // Build deer lookup map with representative image URLs - CACHED batch operation
    const deerMap = new Map<string, DeerSummary>()

    if (deerList !== null && deerList.length > 0) {
      // Collect all file paths first
      const deerWithPaths = deerList.map((deer) => {
        const deerData = deer as Deer & { images?: { file_path: string } | null }
        return {
          deerData,
          filePath: deerData.images?.file_path ?? null,
        }
      })

      // Get all URLs from cache (only non-null paths)
      const filePaths = deerWithPaths
        .map(({ filePath }) => filePath)
        .filter((p): p is string => p !== null)

      const cachedUrls = await getCachedSignedUrls(filePaths)

      // Build lookup for file path -> URL
      const urlLookup = new Map<string, string | null>()
      let urlIndex = 0
      for (const { filePath } of deerWithPaths) {
        if (filePath !== null) {
          urlLookup.set(filePath, cachedUrls[urlIndex++] ?? null)
        }
      }

      // Build map with results
      deerWithPaths.forEach(({ deerData, filePath }) => {
        deerMap.set(deerData.id, {
          id: deerData.id,
          name: deerData.name,
          first_seen: deerData.first_seen,
          last_seen: deerData.last_seen,
          representative_image_url: filePath ? (urlLookup.get(filePath) ?? null) : null,
        })
      })
    }

    // Build response with deer details
    const candidatesWithDeer: MatchCandidateResponse[] = candidates.map(candidate => {
      const deerSummary = deerMap.get(candidate.candidate_deer_id) ?? {
        id: candidate.candidate_deer_id,
        name: null,
        first_seen: null,
        last_seen: null,
        representative_image_url: null,
      }

      return {
        id: candidate.id,
        detection_id: candidate.detection_id,
        candidate_deer_id: candidate.candidate_deer_id,
        similarity_score: candidate.similarity_score,
        status: candidate.status as 'pending' | 'confirmed' | 'rejected',
        created_at: candidate.created_at,
        deer: deerSummary,
      }
    })

    return NextResponse.json({ candidates: candidatesWithDeer }, { status: 200 })
  } catch (error) {
    console.error('Unexpected error in GET /api/detections/[id]/matches:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
