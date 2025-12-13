import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { compareDeer } from '@/trigger/jobs/compare-deer'

interface MatchRequest {
  detection_ids?: string[]
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get catalog deer with reference detections
  const { data: catalogDeer, error: catalogError } = await supabase
    .from('deer')
    .select('id, name, reference_detection_id')
    .eq('account_id', user.id)
    .not('reference_detection_id', 'is', null)

  if (catalogError) {
    return NextResponse.json({ error: 'Failed to fetch catalog' }, { status: 500 })
  }

  if (!catalogDeer || catalogDeer.length === 0) {
    return NextResponse.json(
      { error: 'Add deer to your catalog first' },
      { status: 400 }
    )
  }

  const body = await request.json().catch(() => ({})) as MatchRequest

  // Get unassigned buck detections to match
  let detectionsQuery = supabase
    .from('detections')
    .select('id, image_id')
    .eq('sex', 'buck')
    .is('deer_id', null)

  if (body.detection_ids && body.detection_ids.length > 0) {
    detectionsQuery = detectionsQuery.in('id', body.detection_ids)
  }

  // Join with images to filter by user
  const { data: detections, error: detectionsError } = await supabase
    .from('detections')
    .select('id, images!inner(user_id)')
    .eq('sex', 'buck')
    .is('deer_id', null)
    .eq('images.user_id', user.id)

  if (detectionsError) {
    return NextResponse.json({ error: 'Failed to fetch detections' }, { status: 500 })
  }

  if (!detections || detections.length === 0) {
    return NextResponse.json(
      { error: 'No unassigned buck detections to match' },
      { status: 400 }
    )
  }

  // Filter by provided IDs if any
  let detectionsToMatch = detections
  if (body.detection_ids && body.detection_ids.length > 0) {
    detectionsToMatch = detections.filter(d => body.detection_ids!.includes(d.id))
  }

  // Trigger compare-deer job for each detection
  const jobs = detectionsToMatch.map(detection =>
    compareDeer.trigger({
      detectionId: detection.id,
      catalogDeer: catalogDeer.map(d => ({
        id: d.id,
        name: d.name ?? 'Unnamed',
        reference_detection_id: d.reference_detection_id!,
      })),
    })
  )

  try {
    await Promise.all(jobs)
  } catch (triggerError) {
    console.error('Failed to trigger some comparison jobs:', triggerError)
    // Continue - some may have succeeded
  }

  return NextResponse.json({
    message: 'Matching job queued',
    job_id: 'batch',
    detection_count: detectionsToMatch.length,
  }, { status: 202 })
}
