'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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

export function Header() {
  const router = useRouter()
  const toggleSidebar = useUIStore((state) => state.toggleSidebar)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    async function loadUserData() {
      const { user: userData } = await getUser()
      if (userData) {
        setUser(userData)
        const { data: profileData } = await getProfile(userData.id)
        setProfile(profileData)
      }
    }
    loadUserData()
  }, [])

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  const getInitials = () => {
    if (profile?.full_name) {
      const names = profile.full_name.split(' ')
      if (names.length >= 2 && names[0] && names[1]) {
        const firstInitial = names[0][0]
        const lastInitial = names[1][0]
        if (firstInitial && lastInitial) {
          return `${firstInitial}${lastInitial}`.toUpperCase()
        }
      }
      const firstChar = names[0]?.[0]
      if (firstChar) {
        return firstChar.toUpperCase()
      }
    }
    const emailChar = user?.email?.[0]
    if (emailChar) {
      return emailChar.toUpperCase()
    }
    return 'U'
  }

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
        className="md:hidden"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex-1" />

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-10 w-10 rounded-full">
            <Avatar>
              <AvatarFallback className="bg-primary text-primary-foreground">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium">
                {profile?.full_name || 'User'}
              </p>
              <p className="text-xs text-muted-foreground">
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
          <DropdownMenuItem onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
