"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SlidersHorizontal, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PhotoFilters } from "./photo-filters"

// Import dropdown components
import {
  StatusDropdown,
  DeerDropdown,
  SortDropdown,
} from "./filters"

interface MobileFilterBarProps {
  filters: PhotoFilters
  onFiltersChange: (filters: PhotoFilters) => void
  onOpenDrawer: () => void
  deerList?: { id: string; name: string }[] | undefined
  areaList?: string[] | undefined
  totalFailedCount?: number | undefined
}

// Helper to remove properties from filters object
function omitProperties<T, K extends keyof T>(
  obj: T,
  ...keys: K[]
): Omit<T, K> {
  const result = { ...obj } as T
  for (const key of keys) {
    delete (result as Record<string, unknown>)[key as string]
  }
  return result as Omit<T, K>
}

export function MobileFilterBar({
  filters,
  onFiltersChange,
  onOpenDrawer,
  totalFailedCount,
}: MobileFilterBarProps) {
  // Count drawer-only filters (those not available as quick filters)
  const drawerFilterCount = [
    filters.minConfidence !== undefined,
    filters.minPoints !== undefined,
    filters.maxPoints !== undefined,
    filters.dateFrom !== undefined,
    filters.dateTo !== undefined,
    filters.datePreset !== undefined,
    filters.cameraId !== undefined,
    filters.uploadSessionId !== undefined,
    filters.batchId !== undefined,
    filters.areaNames && filters.areaNames.length > 0,
    filters.otherAnimals && filters.otherAnimals.length > 0,
    filters.deerId !== undefined,
    filters.qualityStatus && filters.qualityStatus !== 'all',
  ].filter(Boolean).length

  // Quick filter toggle handlers for Bucks/Does/Trophy
  const toggleBucks = () => {
    const isActive = filters.sex === 'buck' && filters.sizeClass !== 'trophy'
    if (isActive) {
      onFiltersChange({
        ...omitProperties(filters, 'sizeClass'),
        sex: 'all',
      } as PhotoFilters)
    } else {
      onFiltersChange({
        ...filters,
        sex: 'buck',
      })
    }
  }

  const toggleDoes = () => {
    const isActive = filters.sex === 'doe'
    onFiltersChange({
      ...filters,
      sex: isActive ? 'all' : 'doe',
    })
  }

  const toggleTrophy = () => {
    const isActive = filters.sex === 'buck' && filters.sizeClass === 'trophy'
    onFiltersChange({
      ...filters,
      sex: isActive ? 'all' : 'buck',
      sizeClass: isActive ? 'all' : 'trophy',
    })
  }

  // Check which quick filters are active
  const isBucksActive = filters.sex === 'buck' && filters.sizeClass !== 'trophy'
  const isDoesActive = filters.sex === 'doe'
  const isTrophyActive = filters.sex === 'buck' && filters.sizeClass === 'trophy'

  // Build active filter chips (excluding quick filters shown as buttons)
  const activeChips = buildActiveChips(filters)
  const visibleChips = activeChips.slice(0, 2)
  const hiddenChipCount = activeChips.length - 2

  return (
    <div className="space-y-2">
      {/* Scrollable filter row */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
        {/* Bucks toggle button */}
        <Button
          variant="outline"
          size="sm"
          onClick={toggleBucks}
          className={cn(
            "snap-start shrink-0 h-8 text-xs",
            isBucksActive && "bg-copper text-white border-copper hover:bg-copper/90 hover:text-white"
          )}
        >
          Bucks
        </Button>

        {/* Does toggle button */}
        <Button
          variant="outline"
          size="sm"
          onClick={toggleDoes}
          className={cn(
            "snap-start shrink-0 h-8 text-xs",
            isDoesActive && "bg-copper text-white border-copper hover:bg-copper/90 hover:text-white"
          )}
        >
          Does
        </Button>

        {/* Trophy toggle button */}
        <Button
          variant="outline"
          size="sm"
          onClick={toggleTrophy}
          className={cn(
            "snap-start shrink-0 h-8 text-xs",
            isTrophyActive && "bg-copper text-white border-copper hover:bg-copper/90 hover:text-white"
          )}
        >
          Trophy
        </Button>

        {/* Status dropdown */}
        <div className="snap-start shrink-0">
          <StatusDropdown
            value={filters.status ?? 'all'}
            onChange={(value) => onFiltersChange({ ...filters, status: value })}
            failedCount={totalFailedCount}
          />
        </div>

        {/* Deer dropdown (With/No Deer) */}
        <div className="snap-start shrink-0">
          <DeerDropdown
            value={filters.hasDetections ?? null}
            onChange={(value) => onFiltersChange({ ...filters, hasDetections: value })}
          />
        </div>

        {/* Sort dropdown */}
        <div className="snap-start shrink-0">
          <SortDropdown
            sortBy={(filters.sortBy as 'captured_at' | 'imported_at') ?? 'imported_at'}
            sortDirection={filters.sortDirection ?? 'desc'}
            onChange={(sortBy, sortDirection) => onFiltersChange({ ...filters, sortBy, sortDirection })}
          />
        </div>

        {/* More Filters button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenDrawer}
          className="snap-start shrink-0 h-8 gap-1.5 text-xs relative"
        >
          <SlidersHorizontal className="size-3" />
          More
          {drawerFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 size-4 rounded-full bg-copper text-white text-[10px] font-medium flex items-center justify-center">
              {drawerFilterCount}
            </span>
          )}
        </Button>
      </div>

      {/* Compact active filter chips (max 2 visible + "+N more") */}
      {activeChips.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-hidden">
          {visibleChips.map((chip, index) => (
            <Badge
              key={index}
              variant="secondary"
              className="gap-1 pr-0.5 pl-2 text-[10px] shrink-0"
            >
              <span className="truncate max-w-[80px]">{chip.label}</span>
              <button
                onClick={chip.onRemove}
                className="rounded-full p-0.5 hover:bg-slate-600 transition-colors"
                aria-label={`Remove ${chip.label} filter`}
              >
                <X className="size-2.5" />
              </button>
            </Badge>
          ))}
          {hiddenChipCount > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] shrink-0 cursor-pointer"
              onClick={onOpenDrawer}
            >
              +{hiddenChipCount} more
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}

// Build array of active filter chips (excluding quick filter buttons)
function buildActiveChips(filters: PhotoFilters): { label: string; onRemove: () => void }[] {
  const chips: { label: string; onRemove: () => void }[] = []

  // Note: We don't include sex/sizeClass chips here since they're handled by toggle buttons
  // Only include filters that are set via the drawer or other dropdowns

  // Status filter (only if not 'all')
  if (filters.status && filters.status !== 'all') {
    const labels: Record<string, string> = {
      processing: 'Processing',
      completed: 'Completed',
      failed: 'Failed',
      pending: 'Pending',
    }
    chips.push({
      label: labels[filters.status] || filters.status,
      onRemove: () => {
        // This is a placeholder - actual removal will be handled by the parent
      },
    })
  }

  // Deer detection filter
  if (filters.hasDetections !== null && filters.hasDetections !== undefined) {
    chips.push({
      label: filters.hasDetections ? 'With Deer' : 'No Deer',
      onRemove: () => {},
    })
  }

  // Quality filter
  if (filters.qualityStatus && filters.qualityStatus !== 'all') {
    const labels: Record<string, string> = {
      high_quality: 'High Quality',
      low_quality: 'Low Quality',
      manual_review: 'Review',
      pending: 'Pending',
    }
    chips.push({
      label: labels[filters.qualityStatus] || filters.qualityStatus,
      onRemove: () => {},
    })
  }

  // Confidence filter
  if (filters.minConfidence !== undefined) {
    chips.push({
      label: `${filters.minConfidence}%+`,
      onRemove: () => {},
    })
  }

  // Date filter
  if (filters.datePreset && filters.datePreset !== 'custom') {
    const labels: Record<string, string> = {
      today: 'Today',
      last7days: '7 Days',
      last30days: '30 Days',
    }
    chips.push({
      label: labels[filters.datePreset] || filters.datePreset,
      onRemove: () => {},
    })
  } else if (filters.dateFrom || filters.dateTo) {
    chips.push({
      label: 'Custom Date',
      onRemove: () => {},
    })
  }

  // Points filter
  if (filters.minPoints !== undefined || filters.maxPoints !== undefined) {
    let label = 'Pts: '
    if (filters.minPoints !== undefined && filters.maxPoints === undefined) {
      label += `${filters.minPoints}+`
    } else if (filters.minPoints === undefined && filters.maxPoints !== undefined) {
      label += `≤${filters.maxPoints}`
    } else {
      label += `${filters.minPoints}-${filters.maxPoints}`
    }
    chips.push({
      label,
      onRemove: () => {},
    })
  }

  // Camera filter
  if (filters.cameraId) {
    chips.push({
      label: 'Camera',
      onRemove: () => {},
    })
  }

  // Upload session filter
  if (filters.uploadSessionId) {
    chips.push({
      label: 'Upload',
      onRemove: () => {},
    })
  }

  // Areas filter
  if (filters.areaNames && filters.areaNames.length > 0) {
    chips.push({
      label: `${filters.areaNames.length} Area${filters.areaNames.length > 1 ? 's' : ''}`,
      onRemove: () => {},
    })
  }

  // Other animals filter
  if (filters.otherAnimals && filters.otherAnimals.length > 0) {
    chips.push({
      label: `${filters.otherAnimals.length} Other`,
      onRemove: () => {},
    })
  }

  // Named deer filter
  if (filters.deerId) {
    chips.push({
      label: 'Named Deer',
      onRemove: () => {},
    })
  }

  // Sort filter (only if non-default)
  if (filters.sortBy === 'captured_at' || filters.sortDirection === 'asc') {
    const fieldLabel = filters.sortBy === 'captured_at' ? 'Captured' : 'Uploaded'
    const dirLabel = filters.sortDirection === 'asc' ? '↑' : '↓'
    chips.push({
      label: `${fieldLabel} ${dirLabel}`,
      onRemove: () => {},
    })
  }

  return chips
}
