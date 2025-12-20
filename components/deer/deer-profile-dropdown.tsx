'use client'

import { ChevronDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useDeerCatalog } from '@/lib/hooks/use-deer'

interface DeerProfileDropdownProps {
  onSelect: (deerId: string) => void
  disabled?: boolean
}

export function DeerProfileDropdown({
  onSelect,
  disabled = false,
}: DeerProfileDropdownProps) {
  const { data, isLoading, error } = useDeerCatalog()
  const deer = data?.deer ?? []

  const isDisabled = disabled || isLoading || error !== null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="gap-2"
          disabled={isDisabled}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              Add to Existing
              <ChevronDown className="h-4 w-4 opacity-50" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {deer.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
            {error ? 'Failed to load profiles' : 'No profiles yet'}
          </div>
        ) : (
          deer.map((profile) => (
            <DropdownMenuItem
              key={profile.id}
              className="flex items-center gap-3 cursor-pointer"
              onSelect={() => onSelect(profile.id)}
            >
              {/* Thumbnail */}
              <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded bg-slate">
                {profile.reference_image_url ? (
                  <img
                    src={profile.reference_image_url}
                    alt={profile.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-lg">
                    🦌
                  </div>
                )}
              </div>

              {/* Deer info */}
              <div className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="truncate font-medium text-cream">
                  {profile.name}
                </span>
                <span className="flex-shrink-0 text-xs text-cream-dark">
                  ({profile.sighting_count})
                </span>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
