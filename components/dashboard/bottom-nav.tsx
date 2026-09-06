'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Image, Crosshair, MapPin, Upload, Menu } from 'lucide-react'
import { useUIStore } from '@/lib/stores/ui'
import { cn } from '@/lib/utils'

const items = [
  { name: 'Photos', href: '/photos', icon: Image },
  { name: 'Deer', href: '/deer', icon: Crosshair },
  { name: 'Upload', href: '/upload', icon: Upload },
  { name: 'Locations', href: '/locations', icon: MapPin },
]

export function BottomNav(): React.JSX.Element {
  const pathname = usePathname()
  const openMenu = useUIStore((state) => state.toggleSidebar)
  return (
    <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-forest-light bg-deep-forest pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="flex h-16">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} className={cn('relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] transition-colors', active ? 'text-brass-light' : 'text-weathered hover:text-parchment')}>
            {active && <span className="absolute inset-x-5 top-0 h-px bg-brass" aria-hidden="true" />}
            <item.icon className="size-5" aria-hidden="true" />{item.name}
          </Link>
        })}
        <button type="button" onClick={openMenu} aria-label="Open all pages" className="flex flex-1 flex-col items-center justify-center gap-1 text-[10px] text-weathered"><Menu className="size-5" aria-hidden="true" />More</button>
      </div>
    </nav>
  )
}
