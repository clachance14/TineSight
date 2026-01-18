import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { batchRejectMatches } from '@/lib/services/matching'

interface BatchRejectRequest {
  match_ids: string[]
}

interface BatchRejectResponse {
  rejected_count: number
}

/**
 * POST /api/trophy/batch-reject
 * Batch reject multiple match candidates
 */
export async function POST(
  request: Request
): Promise<NextResponse<BatchRejectResponse | { error: string }>> {
  try {
    // Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError !== null || user === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = (await request.json()) as BatchRejectRequest

    // Validate required fields
    if (!Array.isArray(body.match_ids)) {
      return NextResponse.json({ error: 'match_ids must be an array' }, { status: 400 })
    }

    if (body.match_ids.length === 0) {
      return NextResponse.json({ error: 'match_ids cannot be empty' }, { status: 400 })
    }

    // Validate UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const invalidIds = body.match_ids.filter(id => !uuidRegex.test(id))
    if (invalidIds.length > 0) {
      return NextResponse.json({ error: 'Invalid match_ids format' }, { status: 400 })
    }

    // Reject matches
    const { data, error } = await batchRejectMatches(body.match_ids, user.id)

    if (error !== null) {
      console.error('Failed to reject matches:', error)

      if (error.message === 'Unauthorized') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
      }

      return NextResponse.json({ error: 'Failed to reject matches' }, { status: 500 })
    }

    if (data === null) {
      return NextResponse.json({ error: 'Failed to reject matches' }, { status: 500 })
    }

    return NextResponse.json({
      rejected_count: data.rejected_count,
    })
  } catch (error) {
    console.error('Error in POST /api/trophy/batch-reject:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
