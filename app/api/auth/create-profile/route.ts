import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * POST /api/auth/create-profile
 * Creates a user profile after signup.
 *
 * Security: This endpoint is unauthenticated (called before session exists)
 * but validates that userId exists in auth.users and was created recently.
 */
export async function POST(request: Request) {
  try {
    const { userId, email, fullName } = await request.json()

    if (!userId || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Verify userId exists in auth.users and was created recently (60s window)
    // This prevents abuse of the unauthenticated endpoint
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId)

    if (authError || !authUser?.user) {
      console.error('Invalid userId for profile creation:', userId)
      return NextResponse.json({ error: 'Invalid user' }, { status: 400 })
    }

    // Verify email matches the auth user's email (case-insensitive)
    const authEmail = authUser.user.email?.toLowerCase()
    const providedEmail = email?.toLowerCase()

    if (!authEmail) {
      console.error('Auth user has no email:', userId)
      return NextResponse.json({ error: 'Invalid user email' }, { status: 400 })
    }

    if (authEmail !== providedEmail) {
      console.error('Email mismatch for profile creation:', {
        userId,
        providedEmail,
        authEmail
      })
      return NextResponse.json({ error: 'Email mismatch' }, { status: 400 })
    }

    const createdAt = new Date(authUser.user.created_at)
    const ageSeconds = (Date.now() - createdAt.getTime()) / 1000
    if (ageSeconds > 60) {
      console.error('Profile creation attempted outside registration window:', { userId, ageSeconds })
      return NextResponse.json({ error: 'Registration window expired' }, { status: 400 })
    }

    // Proceed with profile insert
    const { error } = await supabase.from('profiles').insert({
      id: userId,
      email,
      full_name: fullName ?? '',
    })

    if (error) {
      // Profile might already exist (trigger worked), that's OK
      if (error.code === '23505') {
        return NextResponse.json({ success: true, existed: true })
      }
      console.error('Profile creation error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Create profile error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
