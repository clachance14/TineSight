"use client"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { X, Link2, SlidersHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { PhotoFilterChips } from "./photo-filter-chips"

export interface PhotoFilters {
  status?: 'all' | 'processing' | 'completed' | 'failed'
  hasDeer?: boolean | null
  hasDetections?: boolean | null  // true = with detections, false = without, null = all
  batchId?: string
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

export function PhotoFilters({ filters, onFiltersChange, onOpenDrawer, deerList = [] }: PhotoFiltersProps) {
  // Check if any filters are active
  const hasActiveFilters =
    (filters.status && filters.status !== 'all') ||
    filters.hasDeer !== null ||
    filters.hasDetections !== null ||
    filters.batchId ||
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
    filters.deerId

  // Count drawer-only filters (those not available as quick filters)
  const drawerFilterCount = [
    filters.minConfidence !== undefined,
    filters.minPoints !== undefined,
    filters.maxPoints !== undefined,
    filters.dateFrom !== undefined,
    filters.dateTo !== undefined,
    filters.datePreset !== undefined,
    filters.cameraId !== undefined,
    filters.batchId !== undefined,
  ].filter(Boolean).length

  // Quick filter toggle handlers
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

  const toggleHighQuality = () => {
    const isActive = filters.qualityStatus === 'high_quality'
    onFiltersChange({
      ...filters,
      qualityStatus: isActive ? 'all' : 'high_quality',
    })
  }

  const toggleProcessing = () => {
    const isActive = filters.status === 'processing'
    onFiltersChange({
      ...filters,
      status: isActive ? 'all' : 'processing',
    })
  }

  const toggleFailed = () => {
    const isActive = filters.status === 'failed'
    onFiltersChange({
      ...filters,
      status: isActive ? 'all' : 'failed',
    })
  }

  const toggleWithDetections = () => {
    const isActive = filters.hasDetections === true
    onFiltersChange({
      ...filters,
      hasDetections: isActive ? null : true,
    })
  }

  const toggleNoDetections = () => {
    const isActive = filters.hasDetections === false
    onFiltersChange({
      ...filters,
      hasDetections: isActive ? null : false,
    })
  }

  const clearFilters = () => {
    onFiltersChange({
      status: 'all',
      hasDeer: null,
      hasDetections: null,
      qualityStatus: 'all',
      sex: 'all',
      sizeClass: 'all',
    })
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
    if (filters.deerId) params.set('deerId', filters.deerId)

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
  const isHighQualityActive = filters.qualityStatus === 'high_quality'
  const isProcessingActive = filters.status === 'processing'
  const isFailedActive = filters.status === 'failed'
  const isWithDetectionsActive = filters.hasDetections === true
  const isNoDetectionsActive = filters.hasDetections === false

  return (
    <div className="space-y-3">
      {/* Quick Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Quick Filter Toggles */}
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

        <Button
          variant="outline"
          size="sm"
          onClick={toggleHighQuality}
          className={cn(
            "h-8 text-xs",
            isHighQualityActive && "bg-copper text-white border-copper hover:bg-copper/90 hover:text-white"
          )}
        >
          High Quality
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={toggleProcessing}
          className={cn(
            "h-8 text-xs",
            isProcessingActive && "bg-copper text-white border-copper hover:bg-copper/90 hover:text-white"
          )}
        >
          Processing
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={toggleFailed}
          className={cn(
            "h-8 text-xs",
            isFailedActive && "bg-copper text-white border-copper hover:bg-copper/90 hover:text-white"
          )}
        >
          Failed
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={toggleWithDetections}
          className={cn(
            "h-8 text-xs",
            isWithDetectionsActive && "bg-copper text-white border-copper hover:bg-copper/90 hover:text-white"
          )}
        >
          With Deer
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={toggleNoDetections}
          className={cn(
            "h-8 text-xs",
            isNoDetectionsActive && "bg-copper text-white border-copper hover:bg-copper/90 hover:text-white"
          )}
        >
          No Deer
        </Button>

        {/* Named Deer Dropdown */}
        {deerList.length > 0 && (
          <Select
            value={filters.deerId ?? "all"}
            onValueChange={(value) => {
              if (value === "all") {
                onFiltersChange(omitProperties(filters, 'deerId'))
              } else {
                onFiltersChange({ ...filters, deerId: value })
              }
            }}
          >
            <SelectTrigger size="sm" className={cn(
              "h-8 text-xs min-w-[120px]",
              filters.deerId && "bg-copper text-white border-copper"
            )}>
              <SelectValue placeholder="Named Deer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Deer</SelectItem>
              {deerList.map((deer) => (
                <SelectItem key={deer.id} value={deer.id}>
                  {deer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* More Filters Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenDrawer}
          className="h-8 gap-1.5 text-xs relative"
        >
          <SlidersHorizontal className="size-3" />
          More Filters
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
