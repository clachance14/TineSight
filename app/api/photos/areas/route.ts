import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDistinctAreaNames } from '@/lib/services/batches'

interface GetAreasResponse {
  areas: string[]
}

/**
 * GET /api/photos/areas
 * Lists distinct area names for filter dropdown
 */
export async function GET(_request: NextRequest): Promise<NextResponse<GetAreasResponse | { error: string }>> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError !== null || user === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: areas, error } = await getDistinctAreaNames(user.id)

    if (error !== null) {
      console.error('Failed to get areas:', error)
      return NextResponse.json({ error: 'Failed to retrieve areas' }, { status: 500 })
    }

    return NextResponse.json({ areas: areas ?? [] }, { status: 200 })
  } catch (error) {
    console.error('Unexpected error in GET /api/photos/areas:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
