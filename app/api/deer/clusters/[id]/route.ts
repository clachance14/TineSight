import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getClusterById,
  mergeCluster,
  splitCluster,
  dismissCluster,
} from '@/lib/services/clusters'

/**
 * PATCH /api/deer/clusters/[id]
 * Update a cluster (merge, split, or dismiss)
 *
 * Request body:
 * - For merge: { action: "merge", target_cluster_id: string }
 * - For split: { action: "split", detection_ids: string[] }
 * - For dismiss: { action: "dismiss", reason?: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()

  if (!body.action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 })
  }

  // Verify cluster belongs to user
  const { data: cluster, error: getError } = await getClusterById(id)
  if (getError || !cluster) {
    return NextResponse.json({ error: 'Cluster not found' }, { status: 404 })
  }

  if (cluster.user_id !== user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Handle different actions
  switch (body.action) {
    case 'merge': {
      if (!body.target_cluster_id) {
        return NextResponse.json(
          { error: 'target_cluster_id is required for merge action' },
          { status: 400 }
        )
      }

      const { data: success, error } = await mergeCluster(id, body.target_cluster_id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success })
    }

    case 'split': {
      if (!body.detection_ids || !Array.isArray(body.detection_ids)) {
        return NextResponse.json(
          { error: 'detection_ids array is required for split action' },
          { status: 400 }
        )
      }

      if (body.detection_ids.length === 0) {
        return NextResponse.json(
          { error: 'detection_ids must not be empty' },
          { status: 400 }
        )
      }

      const { data: newCluster, error } = await splitCluster(id, body.detection_ids)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, new_cluster_id: newCluster?.id })
    }

    case 'dismiss': {
      const { data: success, error } = await dismissCluster(id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success })
    }

    default:
      return NextResponse.json(
        { error: 'Invalid action. Must be one of: merge, split, dismiss' },
        { status: 400 }
      )
  }
}

/**
 * DELETE /api/deer/clusters/[id]
 * Dismiss a cluster (same as PATCH with action: dismiss)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Verify cluster belongs to user
  const { data: cluster, error: getError } = await getClusterById(id)
  if (getError || !cluster) {
    return NextResponse.json({ error: 'Cluster not found' }, { status: 404 })
  }

  if (cluster.user_id !== user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { data: success, error } = await dismissCluster(id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success })
}
