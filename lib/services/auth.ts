import { createClient } from '@/lib/supabase/client'
import { type ProfileInsert } from '@/types/database'

export async function signUp(email: string, password: string, fullName?: string): Promise<{
  data: { user: { id: string; email?: string } | null } | null
  error: Error | null
}> {
  const supabase = createClient()

  // Sign up the user
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

  // Create profile after successful signup
  if (data.user !== null) {
    const profileData: ProfileInsert = {
      id: data.user.id,
      email: data.user.email ?? email,
      full_name: fullName ?? null,
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .insert(profileData as never)

    if (profileError !== null) {
      // Log but don't fail - profile might already exist or will be created on confirm
      console.error('Profile creation error:', profileError)
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
