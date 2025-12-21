import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/photos'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // Ensure profile exists (idempotent upsert)
      try {
        const adminClient = createAdminClient()
        await adminClient.from('profiles').upsert({
          id: data.user.id,
          email: data.user.email!,
          full_name: data.user.user_metadata?.['full_name'] ?? '',
        }, { onConflict: 'id' })
      } catch (err) {
        console.error('Profile upsert error:', err)
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=Could not authenticate`)
}
