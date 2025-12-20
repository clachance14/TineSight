import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rejectCandidates, getMatchCandidates } from '@/lib/services/matching'

interface RouteContext {
  params: Promise<{ id: string }>
}

interface RejectRequestBody {
  deerIds: string[]
}

interface RejectResponseData {
  remainingCandidates: number
}

/**
 * POST /api/detections/[id]/reject
 * Rejects match candidates for a detection
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<RejectResponseData | { error: string }>> {
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

    // Validate detection ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return NextResponse.json(
        { error: 'Invalid detection ID format' },
        { status: 400 }
      )
    }

    // Parse request body
    let body: RejectRequestBody
    try {
      body = (await request.json()) as RejectRequestBody
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    // Validate deer IDs
    if (!Array.isArray(body.deerIds) || body.deerIds.length === 0) {
      return NextResponse.json(
        { error: 'deerIds must be a non-empty array' },
        { status: 400 }
      )
    }

    // Validate each deer ID format (UUID)
    for (const deerId of body.deerIds) {
      if (!uuidRegex.test(deerId)) {
        return NextResponse.json(
          { error: `Invalid deer ID format: ${deerId}` },
          { status: 400 }
        )
      }
    }

    // Reject the candidates
    const { error: rejectError } = await rejectCandidates(id, body.deerIds)

    if (rejectError !== null) {
      console.error('Failed to reject candidates:', rejectError)
      return NextResponse.json(
        { error: 'Failed to reject candidates' },
        { status: 500 }
      )
    }

    // Get remaining pending candidates
    const { data: candidates, error: candidatesError } = await getMatchCandidates(id)

    if (candidatesError !== null) {
      console.error('Failed to get remaining candidates:', candidatesError)
      return NextResponse.json(
        { error: 'Failed to get remaining candidates' },
        { status: 500 }
      )
    }

    const remainingCandidates = candidates?.filter(c => c.status === 'pending').length ?? 0

    const response: RejectResponseData = {
      remainingCandidates,
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error('Unexpected error in POST /api/detections/[id]/reject:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
