'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Menu, Settings as SettingsIcon, LogOut } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/lib/stores/ui'
import { getUser } from '@/lib/services/auth'
import { getProfile } from '@/lib/services/profile'
import { signOut } from '@/lib/services/auth'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/types/database'

export function Header(): React.JSX.Element {
  const router = useRouter()
  const pathname = usePathname()
  const toggleSidebar = useUIStore((state) => state.toggleSidebar)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    let active = true
    async function loadUserData(): Promise<void> {
      const { user: userData } = await getUser()
      if (active && userData) {
        setUser(userData)
        const { data: profileData } = await getProfile(userData.id)
        if (active) setProfile(profileData)
      }
    }
    void loadUserData()
    return () => { active = false }
  }, [])

  const handleSignOut = async (): Promise<void> => {
    const { error } = await signOut()
    if (error) return
    // A document navigation also drops component-local private state and upload
    // closures. Providers clears query/selection state on the auth notification.
    window.location.assign('/login')
  }

  const getInitials = (): string => {
    const name = profile?.full_name?.trim() ?? ''
    return name.length > 0 ? name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase() : (user?.email?.[0] ?? 'U').toUpperCase()
  }

  const displayName = profile?.full_name?.trim() ?? ''

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-forest-light/60 bg-deep-forest px-4 sm:px-6 lg:px-8">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
        aria-label="Open navigation menu"
        className="size-11 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <Link href="/dashboard" className="mr-auto inline-flex min-h-11 items-center text-xs font-semibold tracking-[0.2em] lg:hidden">TINE<span className="text-brass">SIGHT</span></Link>
      <p className="mr-auto hidden text-[10px] uppercase tracking-[0.2em] text-weathered lg:block">Your field record <span className="mx-3 text-brass/60">/</span>{pathname.split('/')[1] === 'trophy' ? 'Review' : pathname.split('/')[1]}</p>

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative size-11 rounded-full" aria-label="Account menu">
            <Avatar>
              <AvatarFallback className="bg-forest text-brass-light">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium">
                {displayName.length > 0 ? displayName : 'Your account'}
              </p>
              <p className="break-all text-xs text-muted-foreground">
                {user?.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push('/settings')}>
            <SettingsIcon className="mr-2 h-4 w-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => { void handleSignOut() }}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
