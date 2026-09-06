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
    <div className="flex h-screen overflow-hidden">
      <ZustandHydration />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-auto overflow-x-hidden">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
