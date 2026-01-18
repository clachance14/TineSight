// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPendingClusters } from '@/lib/services/clusters'

/**
 * GET /api/deer/clusters
 * List all pending trophy clusters for the authenticated user
 *
 * Returns clusters with their members and representative detection.
 */
export async function GET(_request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: clusters, error } = await getPendingClusters(user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ clusters: clusters ?? [] })
}
