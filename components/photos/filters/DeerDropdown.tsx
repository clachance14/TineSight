'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'

interface DeerDropdownProps {
  value: boolean | null // null = all, true = with deer, false = no deer
  onChange: (value: boolean | null) => void
}

export function DeerDropdown({ value, onChange }: DeerDropdownProps) {
  // Map boolean | null to string radio values
  const radioValue = value === null ? 'all' : value ? 'with_deer' : 'no_deer'

  // Map string radio values back to boolean | null
  const handleValueChange = (newValue: string) => {
    if (newValue === 'all') {
      onChange(null)
    } else if (newValue === 'with_deer') {
      onChange(true)
    } else if (newValue === 'no_deer') {
      onChange(false)
    }
  }

  // Display label based on current value
  const displayLabel =
    value === null ? 'Deer' : value ? 'With Deer' : 'No Deer'

  // Active state styling (copper accent when not "all")
  const isActive = value !== null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-8 text-xs gap-1 border-slate-700',
            isActive
              ? 'bg-copper/10 border-copper/50 text-copper hover:bg-copper/20'
              : 'bg-slate text-cream-dark hover:bg-slate/80'
          )}
        >
          {displayLabel}
          <ChevronDown className="h-3 w-3 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="bg-slate border-slate-700">
        <DropdownMenuRadioGroup value={radioValue} onValueChange={handleValueChange}>
          <DropdownMenuRadioItem value="all" className="text-cream-dark cursor-pointer">
            All
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="with_deer" className="text-cream-dark cursor-pointer">
            With Deer
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="no_deer" className="text-cream-dark cursor-pointer">
            No Deer
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
