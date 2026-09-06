'use client'

import type { ReactElement } from 'react'
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
  onCreate?: () => void
  inModal?: boolean
  disabled?: boolean
}

export function DeerProfileDropdown({
  onSelect,
  onCreate,
  inModal = false,
  disabled = false,
}: DeerProfileDropdownProps): ReactElement {
  const { data, isLoading, error } = useDeerCatalog()
  const deer = data?.deer ?? []

  const isDisabled = disabled || (onCreate === undefined && (isLoading || error !== null))

  // A native picker stays inside the parent dialog's focus boundary.
  if (inModal) return (
    <select aria-label={onCreate !== undefined ? 'Identify deer' : 'Add to existing deer'} value="" disabled={isDisabled}
      className="min-h-11 max-w-full rounded-md border border-brass/50 bg-brass px-3 text-sm font-medium text-deep-forest"
      onChange={event => {
        if (event.target.value === '__create__') onCreate?.()
        else if (event.target.value !== '') onSelect(event.target.value)
      }}>
      <option value="" disabled>{onCreate !== undefined ? 'Identify deer' : 'Add to existing deer'}</option>
      {onCreate !== undefined && <option value="__create__">Create new deer profile</option>}
      {isLoading && <option disabled>Loading existing deer…</option>}
      {error !== null && <option disabled>Existing deer unavailable</option>}
      {deer.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
    </select>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="gap-2"
          disabled={isDisabled}
        >
          {onCreate !== undefined ? <>Identify deer<ChevronDown className="h-4 w-4 opacity-50" /></> : isLoading ? (
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
        {onCreate !== undefined && <DropdownMenuItem className="min-h-11" onSelect={onCreate}>Create new deer profile</DropdownMenuItem>}
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
                {profile.reference_image_url !== null && profile.reference_image_url !== '' ? (
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
