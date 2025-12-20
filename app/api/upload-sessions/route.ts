import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUploadSessionsWithCounts, createUploadSession } from '@/lib/services/upload-sessions'

interface UploadSessionForDropdown {
  id: string
  created_at: string
  total_images: number
}

interface GetUploadSessionsResponse {
  sessions: UploadSessionForDropdown[]
}

interface CreateUploadSessionResponse {
  sessionId: string
}

/**
 * GET /api/upload-sessions
 * Lists user's upload sessions for filter dropdown
 */
export async function GET(_request: NextRequest): Promise<NextResponse<GetUploadSessionsResponse | { error: string }>> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError !== null || user === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: sessions, error } = await getUploadSessionsWithCounts(user.id)

    if (error !== null) {
      console.error('Failed to get upload sessions:', error)
      return NextResponse.json({ error: 'Failed to retrieve upload sessions' }, { status: 500 })
    }

    return NextResponse.json({ sessions: sessions ?? [] }, { status: 200 })
  } catch (error) {
    console.error('Unexpected error in GET /api/upload-sessions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/upload-sessions
 * Creates a new upload session
 */
export async function POST(_request: NextRequest): Promise<NextResponse<CreateUploadSessionResponse | { error: string }>> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError !== null || user === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: session, error } = await createUploadSession(user.id)

    if (error !== null || session === null) {
      console.error('Failed to create upload session:', error)
      return NextResponse.json({ error: 'Failed to create upload session' }, { status: 500 })
    }

    return NextResponse.json({ sessionId: session.id }, { status: 201 })
  } catch (error) {
    console.error('Unexpected error in POST /api/upload-sessions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
