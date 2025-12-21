import { createClient } from '@/lib/supabase/client'

export async function signUp(email: string, password: string, fullName?: string): Promise<{
  data: { user: { id: string; email?: string } | null } | null
  error: Error | null
}> {
  const supabase = createClient()

  // Sign up the user - profile is automatically created by handle_new_user() trigger
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName ?? '',
      },
    },
  })

  if (error !== null) {
    return { data: null, error }
  }

  // Create profile via server-side API (bypasses RLS)
  if (data.user !== null) {
    try {
      const response = await fetch('/api/auth/create-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: data.user.id,
          email: data.user.email ?? email,
          fullName: fullName ?? '',
        }),
      })
      if (!response.ok) {
        const body = await response.json()
        console.error('Profile creation failed:', response.status, body)
      }
    } catch (err) {
      console.error('Failed to create profile:', err)
    }
  }

  return { data, error: null }
}

export async function signIn(email: string, password: string) {
  const supabase = createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  return { data, error }
}

export async function signOut() {
  const supabase = createClient()
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function resetPassword(email: string) {
  const supabase = createClient()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })

  return { error }
}

export async function updatePassword(newPassword: string) {
  const supabase = createClient()

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  })

  return { error }
}

export async function getUser() {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { user, error }
}
