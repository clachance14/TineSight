import { ensureUserProfile } from '@/lib/auth/ensure-profile'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/** Ensure the signed-in user's profile exists, including retrying interrupted signup. */
export async function POST(): Promise<NextResponse> {
  try {
    const client = await createClient()
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError !== null || user === null) {
      return NextResponse.json({ error: 'Please sign in to finish setting up your account.' }, { status: 401 })
    }
    if (user.email === undefined) {
      return NextResponse.json({ error: 'Your account needs an email address.' }, { status: 400 })
    }
    if (!await ensureUserProfile(user)) {
      return NextResponse.json({ error: 'Could not finish account setup. Please try signing in again.' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Profile request failed:', error instanceof Error ? error.message : 'Unknown error')
    return NextResponse.json({ error: 'Could not finish account setup. Please try signing in again.' }, { status: 500 })
  }
}
