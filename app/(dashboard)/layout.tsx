import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ensureUserProfile } from '@/lib/auth/ensure-profile'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { BottomNav } from '@/components/dashboard/bottom-nav'
import { ZustandHydration } from '@/components/zustand-hydration'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}): Promise<React.JSX.Element> {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (user === null) redirect('/login')
  const { data: profile, error } = await client.from('profiles').select('id').eq('id', user.id).maybeSingle()
  if (error !== null || (profile === null && !await ensureUserProfile(user))) redirect('/login?error=account-setup')

  return (
    <div className="workspace flex h-dvh overflow-hidden bg-deep-forest text-parchment">
      <ZustandHydration />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-parchment focus:p-3 focus:text-deep-forest">Skip to content</a>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <Header />
        <main id="main-content" className="has-[[data-map-workspace]]:overflow-hidden has-[[data-map-workspace]]:p-0 has-[[data-map-workspace]]:pb-[calc(4rem+env(safe-area-inset-bottom))] lg:has-[[data-map-workspace]]:pb-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden [--workspace-gutter:1rem] sm:[--workspace-gutter:1.5rem] lg:[--workspace-gutter:2rem] p-[var(--workspace-gutter)] pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-[var(--workspace-gutter)]">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
