import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getClusterById, nameCluster } from '@/lib/services/clusters'

/**
 * POST /api/deer/clusters/[id]/name
 * Name a cluster and create a deer profile
 *
 * Creates a deer profile from the cluster and links all member detections.
 *
 * Request body:
 * - name: string (required) - Name for the deer profile
 * - notes: string (optional) - Notes for the deer profile
 */
export async function POST(
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

  if (!body.name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  // Validate name length
  if (body.name.length < 1 || body.name.length > 100) {
    return NextResponse.json(
      { error: 'name must be between 1 and 100 characters' },
      { status: 400 }
    )
  }

  // Verify cluster belongs to user
  const { data: cluster, error: getError } = await getClusterById(id)
  if (getError || !cluster) {
    return NextResponse.json({ error: 'Cluster not found' }, { status: 404 })
  }

  if (cluster.user_id !== user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Create deer from cluster
  const { data, error } = await nameCluster(id, body.name, body.notes)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Failed to create deer' }, { status: 500 })
  }

  // Fetch the created deer to return full details
  const { data: deer, error: deerError } = await supabase
    .from('deer')
    .select('*')
    .eq('id', data.deer_id)
    .single()

  if (deerError) {
    // Deer was created but fetch failed - still return success
    return NextResponse.json({
      deer: {
        id: data.deer_id,
        name: body.name,
        notes: body.notes ?? null,
      },
      linked_count: data.linked_count,
    })
  }

  return NextResponse.json({
    deer,
    linked_count: data.linked_count,
  })
}
