import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBatchesWithCounts } from '@/lib/services/batches'

interface BatchForDropdown {
  id: string
  created_at: string
  total_images: number
}

interface GetBatchesResponse {
  batches: BatchForDropdown[]
}

/**
 * GET /api/batches
 * Lists user's batches for filter dropdown
 */
export async function GET(_request: NextRequest): Promise<NextResponse<GetBatchesResponse | { error: string }>> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError !== null || user === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: batches, error } = await getBatchesWithCounts(user.id)

    if (error !== null) {
      console.error('Failed to get batches:', error)
      return NextResponse.json({ error: 'Failed to retrieve batches' }, { status: 500 })
    }

    return NextResponse.json({ batches: batches ?? [] }, { status: 200 })
  } catch (error) {
    console.error('Unexpected error in GET /api/batches:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
