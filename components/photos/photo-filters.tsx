"use client"

import { Button } from "@/components/ui/button"
import { X, Link2, SlidersHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { PhotoFilterChips } from "./photo-filter-chips"
import { useUploadSessions } from "@/lib/hooks/use-upload-sessions"
import { useCameras } from "@/lib/hooks/use-cameras"
import type { PhotoSortField } from "@/lib/services/photos"

// Import new dropdown components
import {
  StatusDropdown,
  DeerDropdown,
  OtherAnimalsDropdown,
  NamedDeerDropdown,
  SortDropdown,
  AreasDropdown,
  SourceDropdown,
} from "./filters"

// Sort direction type
export type PhotoSortDirection = 'asc' | 'desc'

// Other animal types for multi-select filter
export type OtherAnimalType = 'hogs' | 'cows' | 'goats' | 'people' | 'vehicles'

export interface PhotoFilters {
  status?: 'all' | 'pending' | 'processing' | 'completed' | 'failed'
  hasDeer?: boolean | null
  hasDetections?: boolean | null  // true = with detections, false = without, null = all
  batchId?: string  // Keep for backward compatibility
  uploadSessionId?: string
  qualityStatus?: 'all' | 'high_quality' | 'low_quality' | 'manual_review' | 'pending'
  minConfidence?: number
  sex?: 'buck' | 'doe' | 'fawn' | 'unknown' | 'all'
  minPoints?: number
  maxPoints?: number
  dateFrom?: string
  dateTo?: string
  datePreset?: 'today' | 'last7days' | 'last30days' | 'custom'
  cameraId?: string
  sizeClass?: 'trophy' | 'standard' | 'basket' | 'spike' | 'unknown' | 'all'
  deerId?: string
  areaName?: string  // Filter by area, '__no_area__' for unassigned (legacy single select)
  areaNames?: string[]  // Multi-select areas (OR logic)
  otherAnimals?: OtherAnimalType[]  // Multi-select other animals (OR logic)
  // Enhanced sorting (faceted sidebar)
  sortBy?: PhotoSortField
  sortDirection?: PhotoSortDirection
  secondarySortBy?: PhotoSortField
  secondarySortDirection?: PhotoSortDirection
  // New filter fields (faceted sidebar)
  ageClass?: 'young' | 'mature' | 'prime' | 'declined' | 'unknown' | 'all'
  deerCountMin?: number
  deerCountMax?: number
  hasCows?: boolean
  hasGoats?: boolean
  hasHogs?: boolean
  hasPeople?: boolean
  hasVehicles?: boolean
}

interface DeerOption {
  id: string
  name: string
}

interface PhotoFiltersProps {
  filters: PhotoFilters
  onFiltersChange: (filters: PhotoFilters) => void
  onOpenDrawer: () => void
  deerList?: DeerOption[]
  areaList?: string[]
  totalFailedCount?: number
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

export function PhotoFilters({ filters, onFiltersChange, onOpenDrawer, deerList = [], areaList = [], totalFailedCount }: PhotoFiltersProps) {
  // Fetch upload sessions and cameras for dropdown
  const { data: sessionsData } = useUploadSessions()
  const sessions = sessionsData?.sessions ?? []
  const { data: camerasData } = useCameras()
  const cameras = camerasData?.cameras ?? []

  // Check if any filters are active
  const hasActiveFilters =
    (filters.status && filters.status !== 'all') ||
    filters.hasDeer !== null ||
    filters.hasDetections !== null ||
    filters.batchId ||
    filters.uploadSessionId ||
    (filters.qualityStatus && filters.qualityStatus !== 'all') ||
    filters.minConfidence !== undefined ||
    (filters.sex && filters.sex !== 'all') ||
    filters.minPoints !== undefined ||
    filters.maxPoints !== undefined ||
    (filters.sizeClass && filters.sizeClass !== 'all') ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.datePreset ||
    filters.cameraId ||
    filters.deerId ||
    filters.areaName !== undefined ||
    (filters.areaNames && filters.areaNames.length > 0) ||
    (filters.otherAnimals && filters.otherAnimals.length > 0) ||
    filters.sortBy === 'captured_at' ||
    filters.sortDirection === 'asc'

  // Count drawer-only filters (those not available as quick filters)
  const drawerFilterCount = [
    filters.minConfidence !== undefined,
    filters.minPoints !== undefined,
    filters.maxPoints !== undefined,
    filters.dateFrom !== undefined,
    filters.dateTo !== undefined,
    filters.datePreset !== undefined,
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

  const clearFilters = () => {
    // Create clean filter object without undefined values to satisfy exactOptionalPropertyTypes
    const cleanFilters: PhotoFilters = {
      status: 'all',
      hasDeer: null,
      hasDetections: null,
      qualityStatus: 'all',
      sex: 'all',
      sizeClass: 'all',
      sortBy: 'imported_at',
      sortDirection: 'desc',
    }
    onFiltersChange(cleanFilters)
  }

  const copyFilterUrl = async () => {
    const params = new URLSearchParams()
    if (filters.status && filters.status !== 'all') params.set('status', filters.status)
    if (filters.hasDeer !== null) params.set('hasDeer', String(filters.hasDeer))
    if (filters.hasDetections !== null && filters.hasDetections !== undefined) params.set('hasDetections', String(filters.hasDetections))
    if (filters.qualityStatus && filters.qualityStatus !== 'all') params.set('qualityStatus', filters.qualityStatus)
    if (filters.minConfidence !== undefined) params.set('minConfidence', String(filters.minConfidence))
    if (filters.sex && filters.sex !== 'all') params.set('sex', filters.sex)
    if (filters.minPoints !== undefined) params.set('minPoints', String(filters.minPoints))
    if (filters.maxPoints !== undefined) params.set('maxPoints', String(filters.maxPoints))
    if (filters.sizeClass && filters.sizeClass !== 'all') params.set('sizeClass', filters.sizeClass)
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
    if (filters.dateTo) params.set('dateTo', filters.dateTo)
    if (filters.datePreset) params.set('datePreset', filters.datePreset)
    if (filters.cameraId) params.set('cameraId', filters.cameraId)
    if (filters.batchId) params.set('batchId', filters.batchId)
    if (filters.uploadSessionId) params.set('uploadSessionId', filters.uploadSessionId)
    if (filters.deerId) params.set('deerId', filters.deerId)
    if (filters.areaName) params.set('areaName', filters.areaName)
    if (filters.areaNames?.length) params.set('areaNames', filters.areaNames.join(','))
    if (filters.otherAnimals?.length) params.set('otherAnimals', filters.otherAnimals.join(','))
    if (filters.sortBy && filters.sortBy !== 'imported_at') params.set('sortBy', filters.sortBy)
    if (filters.sortDirection && filters.sortDirection !== 'desc') params.set('sortDirection', filters.sortDirection)

    const url = `${window.location.origin}/photos${params.toString() ? `?${params.toString()}` : ''}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      console.error('Failed to copy to clipboard')
    }
  }

  // Check which quick filters are active
  const isBucksActive = filters.sex === 'buck' && filters.sizeClass !== 'trophy'
  const isDoesActive = filters.sex === 'doe'
  const isTrophyActive = filters.sex === 'buck' && filters.sizeClass === 'trophy'

  return (
    <div className="space-y-3">
      {/* Quick Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Keep: Bucks, Does, Trophy quick buttons */}
        <Button
          variant="outline"
          size="sm"
          onClick={toggleBucks}
          className={cn(
            "h-8 text-xs",
            isBucksActive && "bg-copper text-white border-copper hover:bg-copper/90 hover:text-white"
          )}
        >
          Bucks
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={toggleDoes}
          className={cn(
            "h-8 text-xs",
            isDoesActive && "bg-copper text-white border-copper hover:bg-copper/90 hover:text-white"
          )}
        >
          Does
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={toggleTrophy}
          className={cn(
            "h-8 text-xs",
            isTrophyActive && "bg-copper text-white border-copper hover:bg-copper/90 hover:text-white"
          )}
        >
          Trophy
        </Button>

        {/* New Dropdown: Status */}
        <StatusDropdown
          value={filters.status ?? 'all'}
          onChange={(value) => onFiltersChange({ ...filters, status: value })}
          failedCount={totalFailedCount}
        />

        {/* New Dropdown: Deer (With/No) */}
        <DeerDropdown
          value={filters.hasDetections ?? null}
          onChange={(value) => onFiltersChange({ ...filters, hasDetections: value })}
        />

        {/* New Dropdown: Other Animals */}
        <OtherAnimalsDropdown
          selected={filters.otherAnimals ?? []}
          onChange={(selected) => {
            if (selected.length > 0) {
              onFiltersChange({ ...filters, otherAnimals: selected })
            } else {
              onFiltersChange(omitProperties(filters, 'otherAnimals'))
            }
          }}
        />

        {/* Named Deer Dropdown */}
        {deerList.length > 0 && (
          <NamedDeerDropdown
            deerList={deerList}
            value={filters.deerId ?? null}
            onChange={(deerId) => {
              if (deerId === null) {
                onFiltersChange(omitProperties(filters, 'deerId'))
              } else {
                onFiltersChange({ ...filters, deerId })
              }
            }}
          />
        )}

        {/* New Dropdown: Sort */}
        <SortDropdown
          sortBy={(filters.sortBy as 'captured_at' | 'imported_at') ?? 'imported_at'}
          sortDirection={filters.sortDirection ?? 'desc'}
          onChange={(sortBy, sortDirection) => onFiltersChange({ ...filters, sortBy, sortDirection })}
        />

        {/* New Dropdown: Areas */}
        {areaList.length > 0 && (
          <AreasDropdown
            areas={areaList}
            selected={filters.areaNames ?? []}
            onChange={(selected) => {
              if (selected.length > 0) {
                onFiltersChange({ ...filters, areaNames: selected })
              } else {
                onFiltersChange(omitProperties(filters, 'areaNames'))
              }
            }}
          />
        )}

        {/* New Dropdown: Source (Camera + Upload Session) */}
        <SourceDropdown
          cameras={cameras.map(c => ({ id: c.id, name: c.name ?? `Camera ${c.id.slice(0, 6)}` }))}
          sessions={sessions.map(s => ({ id: s.id, created_at: s.created_at, total_images: s.total_images }))}
          cameraId={filters.cameraId ?? null}
          uploadSessionId={filters.uploadSessionId ?? null}
          onChange={(cameraId, uploadSessionId) => {
            const newFilters = { ...filters }
            if (cameraId !== null) {
              newFilters.cameraId = cameraId
            } else {
              delete newFilters.cameraId
            }
            if (uploadSessionId !== null) {
              newFilters.uploadSessionId = uploadSessionId
            } else {
              delete newFilters.uploadSessionId
            }
            onFiltersChange(newFilters)
          }}
        />

        {/* More Filters Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenDrawer}
          className="h-8 gap-1.5 text-xs relative"
        >
          <SlidersHorizontal className="size-3" />
          More
          {drawerFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 size-4 rounded-full bg-copper text-white text-[10px] font-medium flex items-center justify-center">
              {drawerFilterCount}
            </span>
          )}
        </Button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Action Buttons */}
        {hasActiveFilters && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={copyFilterUrl}
              className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Link2 className="size-3" />
              <span className="hidden sm:inline">Copy link</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          </div>
        )}
      </div>

      {/* Active Filter Chips */}
      <PhotoFilterChips filters={filters} onFiltersChange={onFiltersChange} />
    </div>
  )
}
