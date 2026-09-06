import { createClient } from '@/lib/supabase/server'
import { ensureUserProfile } from '@/lib/auth/ensure-profile'
import { authNextPath } from '@/lib/auth/navigation'
import { redirect } from 'next/navigation'

export async function GET(request: Request): Promise<never> {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = authNextPath(searchParams.get('next') ?? (type === 'recovery' ? '/reset-password' : null))
  const supabase = await createClient()
  // Supports both existing PKCE links and token-hash email templates. Token-hash
  // links do not require the browser that originally requested the email.
  const result = tokenHash !== null && (type === 'email' || type === 'signup' || type === 'recovery' || type === 'invite' || type === 'email_change')
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    : code !== null ? await supabase.auth.exchangeCodeForSession(code) : null
  if (result !== null && result.error === null && result.data.user !== null) {
    if (!await ensureUserProfile(result.data.user)) return redirect('/login?error=account-setup')
    return redirect(next)
  }
  return redirect('/login?error=callback-failed')
}
