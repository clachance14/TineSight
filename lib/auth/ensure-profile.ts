import 'server-only'
import type { User } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

/** Only pass a user verified by Supabase Auth, never request-supplied identity. */
export async function ensureUserProfile(user: User): Promise<boolean> {
  if (user.email === undefined) return false
  const fullName: unknown = user.user_metadata['full_name']
  try {
    const { error } = await createAdminClient().from('profiles').upsert({
      id: user.id,
      email: user.email,
      full_name: typeof fullName === 'string' ? fullName : '',
    }, { onConflict: 'id', ignoreDuplicates: true })
    if (error !== null) console.error('Profile setup failed:', error.code)
    return error === null
  } catch (error) {
    console.error('Profile setup unavailable:', error instanceof Error ? error.message : 'Unknown error')
    return false
  }
}
