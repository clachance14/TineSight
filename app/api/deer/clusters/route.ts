import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPendingClusters } from '@/lib/services/clusters'
import { clusterTrophyDetections } from '@/trigger/jobs/cluster-trophy-detections'

/**
 * GET /api/deer/clusters
 * List all pending trophy clusters for the authenticated user
 *
 * Returns clusters with their members and representative detection.
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
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

/**
 * POST /api/deer/clusters
 * Run trophy-detection clustering for the authenticated user (ADR 0005, Phase 1
 * cold-start: group the initial flood of unassigned trophy detections into
 * candidate bucks so the operator can name each group once).
 */
export async function POST(_request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await clusterTrophyDetections.trigger({ userId: user.id })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to start clustering' },
      { status: 500 }
    )
  }

  return NextResponse.json({ message: 'Clustering queued' }, { status: 202 })
}
