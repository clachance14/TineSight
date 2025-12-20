import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createDeerFromDetection } from '@/lib/services/matching'

interface RouteContext {
  params: Promise<{ id: string }>
}

interface CreateDeerRequestBody {
  name?: string
}

interface CreateDeerResponseData {
  deer: {
    id: string
    user_id: string
    name: string | null
    notes: string | null
    first_seen: string | null
    last_seen: string | null
    status: string
    created_at: string
    updated_at: string
  }
}

/**
 * POST /api/detections/[id]/create-deer
 * Creates a new deer profile from a detection
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<CreateDeerResponseData | { error: string }>> {
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
    let body: CreateDeerRequestBody
    try {
      body = (await request.json()) as CreateDeerRequestBody
    } catch {
      // Empty body is acceptable, name is optional
      body = {}
    }

    // Validate name if provided
    if (body.name !== undefined && typeof body.name !== 'string') {
      return NextResponse.json(
        { error: 'name must be a string' },
        { status: 400 }
      )
    }

    // Create new deer from detection
    const { data: deer, error: deerError } = await createDeerFromDetection(
      id,
      user.id,
      body.name
    )

    if (deerError !== null) {
      console.error('Failed to create deer from detection:', deerError)
      return NextResponse.json(
        { error: 'Failed to create deer' },
        { status: 500 }
      )
    }

    if (deer === null) {
      return NextResponse.json(
        { error: 'Detection not found' },
        { status: 404 }
      )
    }

    // Build response
    const response: CreateDeerResponseData = {
      deer: {
        id: deer.id,
        user_id: deer.user_id,
        name: deer.name,
        notes: deer.notes,
        first_seen: deer.first_seen,
        last_seen: deer.last_seen,
        status: deer.status,
        created_at: deer.created_at,
        updated_at: deer.updated_at,
      },
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error('Unexpected error in POST /api/detections/[id]/create-deer:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
