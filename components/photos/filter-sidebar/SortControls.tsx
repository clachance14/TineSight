'use client'

import { ArrowDown, ArrowUp } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import type { PhotoSortField } from '@/lib/services/photos'

interface SortControlsProps {
  sortBy: PhotoSortField
  sortDirection: 'asc' | 'desc'
  onSortChange: (sortBy: PhotoSortField, direction: 'asc' | 'desc') => void
}

// Sort field display labels
const SORT_FIELD_LABELS: Record<PhotoSortField, string> = {
  captured_at: 'Captured Date',
  imported_at: 'Uploaded Date',
  confidence: 'Confidence',
  points: 'Points',
  size_class: 'Size Class',
  deer_name: 'Deer Name',
  deer_count: 'Deer Count',
}

export function SortControls({
  sortBy,
  sortDirection,
  onSortChange,
}: SortControlsProps) {
  const handleFieldChange = (newField: string) => {
    onSortChange(newField as PhotoSortField, sortDirection)
  }

  const handleDirectionToggle = () => {
    onSortChange(sortBy, sortDirection === 'asc' ? 'desc' : 'asc')
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={sortBy} onValueChange={handleFieldChange}>
        <SelectTrigger
          size="sm"
          className="w-[180px] bg-slate-deep text-cream-dark border-slate"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-slate-deep border-slate">
          {Object.entries(SORT_FIELD_LABELS).map(([value, label]) => (
            <SelectItem
              key={value}
              value={value}
              className="text-cream-dark hover:bg-slate focus:bg-slate focus:text-cream-dark"
            >
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="icon-sm"
        onClick={handleDirectionToggle}
        className={`border-slate ${
          sortDirection === 'desc'
            ? 'bg-copper text-slate-deep hover:bg-copper-light'
            : 'bg-slate-deep text-cream-dark hover:bg-slate'
        }`}
        title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
      >
        {sortDirection === 'asc' ? (
          <ArrowUp className="h-4 w-4" />
        ) : (
          <ArrowDown className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}
