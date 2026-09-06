import { createClient } from '@/lib/supabase/client'
import type { AuthError, Session, User } from '@supabase/supabase-js'

type AuthResult = {
  data: { user: User | null; session: Session | null } | null
  error: Error | null
}

async function ensureProfile(): Promise<Error | null> {
  try {
    const response = await fetch('/api/auth/create-profile', { method: 'POST' })
    if (!response.ok) return new Error('Could not finish account setup. Please try signing in again.')
    return null
  } catch {
    return new Error('Connection lost while setting up your account. Please sign in to try again.')
  }
}

export async function signUp(email: string, password: string, fullName?: string): Promise<AuthResult> {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
      data: { full_name: fullName ?? '' },
    },
  })
  if (error !== null) return { data: null, error }
  if (data.session !== null) return { data, error: await ensureProfile() }
  return { data, error: null }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const supabase = createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error !== null) return { data: null, error }
  return { data, error: await ensureProfile() }
}

export async function signOut(): Promise<{ error: AuthError | null }> {
  const supabase = createClient()
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function resetPassword(email: string): Promise<{ error: AuthError | null }> {
  const supabase = createClient()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })

  return { error }
}

export async function updatePassword(newPassword: string): Promise<{ error: AuthError | null }> {
  const supabase = createClient()

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  })

  return { error }
}

export async function getUser(): Promise<{ user: User | null; error: AuthError | null }> {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { user, error }
}
