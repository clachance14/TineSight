import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTrophyDashboard } from '@/lib/services/trophy'

/**
 * GET /api/trophy/dashboard
 * Get trophy dashboard data with stats, pending matches, clusters, and unclustered
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: dashboard, error } = await getTrophyDashboard(user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(dashboard)
}
