import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { BottomNav } from '@/components/dashboard/bottom-nav'
import { ZustandHydration } from '@/components/zustand-hydration'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
