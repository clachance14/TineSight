import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<NextResponse<{ error: string; }> | NextResponse<{ success: boolean; }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await context.params
  const { error } = await supabase.rpc('finish_upload_session', { p_session_id: id })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
