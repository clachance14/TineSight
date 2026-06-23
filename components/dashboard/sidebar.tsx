'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Upload, Image, Crosshair, Camera, MapPin, Settings, Share2, Sparkles } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { useUIStore } from '@/lib/stores/ui'
import { usePendingMatchCount } from '@/lib/hooks/use-matches'
import { cn } from '@/lib/utils'

const navigationItems = [
  {
    name: 'Upload',
    href: '/upload',
    icon: Upload,
  },
  {
    name: 'Photos',
    href: '/photos',
    icon: Image,
  },
  {
    name: 'Deer',
    href: '/deer',
    icon: Crosshair,
  },
  {
    name: 'Re-ID',
    href: '/trophy',
    icon: Sparkles,
  },
  {
    name: 'Showcase',
    href: '/showcase',
    icon: Share2,
  },
  {
    name: 'Cameras',
    href: '/cameras',
    icon: Camera,
  },
  {
    name: 'Locations',
    href: '/locations',
    icon: MapPin,
  },
]

const settingsItem = {
  name: 'Settings',
  href: '/settings',
  icon: Settings,
}

function SidebarContent() {
  const pathname = usePathname()
  const { data: matchData } = usePendingMatchCount()
  const pendingCount = matchData?.total_pending ?? 0

  return (
    <div className="flex flex-col h-full">
      {/* Logo/Branding */}
      <div className="p-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Crosshair className="h-8 w-8 text-primary" />
          <span className="text-xl font-bold text-sidebar-foreground">
            TineSight
          </span>
        </Link>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navigationItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-primary'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="flex-1">{item.name}</span>
              {item.href === '/trophy' && pendingCount > 0 && (
                <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-semibold tabular-nums text-primary-foreground">
                  {pendingCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* Settings */}
      <div className="p-4">
        <Link
          href={settingsItem.href}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
            pathname === settingsItem.href || pathname.startsWith(`${settingsItem.href}/`)
              ? 'bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-primary'
              : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          )}
        >
          <settingsItem.icon className="h-5 w-5" />
          {settingsItem.name}
        </Link>
      </div>
    </div>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const sidebarOpen = useUIStore((state) => state.sidebarOpen)
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen)
  const closeSidebar = useUIStore((state) => state.closeSidebar)

  // Close sidebar on navigation (mobile only)
  useEffect(() => {
    closeSidebar()
  }, [pathname, closeSidebar])

  return (
    <>
      {/* Desktop sidebar - always visible */}
      <div className="hidden md:flex w-64 bg-sidebar border-r border-sidebar-border flex-col">
        <SidebarContent />
      </div>

      {/* Mobile sidebar - Sheet drawer */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent
          side="left"
          className="w-64 p-0 bg-sidebar border-sidebar-border md:hidden"
        >
          {/* Visually-hidden labels satisfy Radix Dialog a11y (screen readers). */}
          <SheetTitle className="sr-only">Navigation menu</SheetTitle>
          <SheetDescription className="sr-only">
            Main navigation links for TineSight
          </SheetDescription>
          <SidebarContent />
        </SheetContent>
      </Sheet>
    </>
  )
}
