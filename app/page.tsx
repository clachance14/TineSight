import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LandingPage } from '@/components/landing/landing-page'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string; code?: string }>
}): Promise<React.JSX.Element> {
  const { preview, code } = await searchParams
  if (code !== undefined) redirect(`/auth/callback?code=${encodeURIComponent(code)}`)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // ?preview=1 lets a signed-in operator view the public landing page
  if (user && preview === undefined) {
    redirect('/dashboard')
  }

  return <LandingPage />
}
