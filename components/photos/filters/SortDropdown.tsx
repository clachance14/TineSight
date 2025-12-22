"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronDown } from "lucide-react"

interface SortDropdownProps {
  sortBy: 'captured_at' | 'imported_at'
  sortDirection: 'asc' | 'desc'
  onChange: (sortBy: 'captured_at' | 'imported_at', direction: 'asc' | 'desc') => void
}

export function SortDropdown({ sortBy, sortDirection, onChange }: SortDropdownProps) {
  // Combine field and direction into single value for radio group
  // Use colon separator since field names contain underscores (captured_at, imported_at)
  const value = `${sortBy}:${sortDirection}`

  const handleValueChange = (newValue: string) => {
    const [field, direction] = newValue.split(':') as ['captured_at' | 'imported_at', 'asc' | 'desc']
    onChange(field, direction)
  }

  // Get display label for trigger button
  const getLabel = () => {
    const fieldLabel = sortBy === 'captured_at' ? 'Captured' : 'Uploaded'
    const arrow = sortDirection === 'desc' ? '↓' : '↑'
    return `${fieldLabel} ${arrow}`
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
        >
          {getLabel()}
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={value} onValueChange={handleValueChange}>
          <DropdownMenuRadioItem value="captured_at:desc">
            Date Captured - Newest
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="captured_at:asc">
            Date Captured - Oldest
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="imported_at:desc">
            Date Uploaded - Newest
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="imported_at:asc">
            Date Uploaded - Oldest
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
