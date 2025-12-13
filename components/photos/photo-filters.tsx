"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Slider } from "@/components/ui/slider"
import { ChevronDown, X, Link2, SlidersHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"

export interface PhotoFilters {
  status?: 'all' | 'processing' | 'completed' | 'failed' | undefined
  hasDeer?: boolean | null | undefined
  batchId?: string | undefined
  qualityStatus?: 'all' | 'high_quality' | 'low_quality' | 'manual_review' | 'pending' | undefined
  minConfidence?: number | undefined
  sex?: 'buck' | 'doe' | 'fawn' | 'unknown' | 'all' | undefined
  minPoints?: number | undefined
  maxPoints?: number | undefined
}

interface PhotoFiltersProps {
  filters: PhotoFilters
  onFiltersChange: (filters: PhotoFilters) => void
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
] as const

const DEER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'true', label: 'Has Deer' },
  { value: 'false', label: 'Empty' },
] as const

const QUALITY_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'high_quality', label: 'High Quality' },
  { value: 'low_quality', label: 'Low Quality' },
  { value: 'manual_review', label: 'Manual Review' },
  { value: 'pending', label: 'Pending' },
] as const

const SEX_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'buck', label: 'Bucks' },
  { value: 'doe', label: 'Does' },
  { value: 'fawn', label: 'Fawns' },
] as const

const POINTS_OPTIONS = [
  { value: 'all', label: 'All', min: undefined, max: undefined },
  { value: '10+', label: '10+', min: 10, max: undefined },
  { value: '8-9', label: '8-9', min: 8, max: 9 },
  { value: '6-7', label: '6-7', min: 6, max: 7 },
  { value: '<6', label: '<6', min: undefined, max: 5 },
] as const

export function PhotoFilters({ filters, onFiltersChange }: PhotoFiltersProps) {
  const [confidenceOpen, setConfidenceOpen] = useState(false)
  const [lastConfidence, setLastConfidence] = useState(50)

  // Check if any filters are active
  const hasActiveFilters =
    (filters.status && filters.status !== 'all') ||
    filters.hasDeer !== null ||
    filters.batchId ||
    (filters.qualityStatus && filters.qualityStatus !== 'all') ||
    filters.minConfidence !== undefined ||
    (filters.sex && filters.sex !== 'all') ||
    filters.minPoints !== undefined ||
    filters.maxPoints !== undefined

  // Get display labels for active filters
  const getStatusLabel = () => {
    const option = STATUS_OPTIONS.find(o => o.value === (filters.status || 'all'))
    return option?.label || 'Status'
  }

  const getDeerLabel = () => {
    if (filters.hasDeer === null) return 'Detection'
    return filters.hasDeer ? 'Has Deer' : 'Empty'
  }

  const getQualityLabel = () => {
    const option = QUALITY_OPTIONS.find(o => o.value === (filters.qualityStatus || 'all'))
    return option?.label || 'Quality'
  }

  // Handlers
  const handleStatusChange = (value: string) => {
    onFiltersChange({ ...filters, status: value as PhotoFilters['status'] })
  }

  const handleDeerChange = (value: string) => {
    const hasDeer = value === 'all' ? null : value === 'true'
    onFiltersChange({ ...filters, hasDeer })
  }

  const handleQualityChange = (value: string) => {
    onFiltersChange({ ...filters, qualityStatus: value as PhotoFilters['qualityStatus'] })
  }

  const handleConfidenceChange = (value: number[]) => {
    const confidence = value[0]
    if (confidence !== undefined) {
      setLastConfidence(confidence)
      onFiltersChange({ ...filters, minConfidence: confidence })
    }
  }

  const handleConfidenceToggle = () => {
    if (filters.minConfidence !== undefined) {
      setLastConfidence(filters.minConfidence)
      onFiltersChange({ ...filters, minConfidence: undefined })
    } else {
      onFiltersChange({ ...filters, minConfidence: lastConfidence })
    }
  }

  const handleSexChange = (value: string) => {
    onFiltersChange({
      ...filters,
      sex: value as PhotoFilters['sex'],
      // Clear points filter when changing sex away from buck
      minPoints: value === 'buck' ? filters.minPoints : undefined,
      maxPoints: value === 'buck' ? filters.maxPoints : undefined,
    })
  }

  const handlePointsChange = (option: typeof POINTS_OPTIONS[number]) => {
    onFiltersChange({
      ...filters,
      minPoints: option.min,
      maxPoints: option.max,
    })
  }

  const getActivePointsFilter = () => {
    const { minPoints, maxPoints } = filters
    if (minPoints === undefined && maxPoints === undefined) return 'all'
    if (minPoints === 10) return '10+'
    if (minPoints === 8 && maxPoints === 9) return '8-9'
    if (minPoints === 6 && maxPoints === 7) return '6-7'
    if (maxPoints === 5) return '<6'
    return 'all'
  }

  const clearFilters = () => {
    onFiltersChange({
      status: 'all',
      hasDeer: null,
      batchId: undefined,
      qualityStatus: 'all',
      minConfidence: undefined,
      sex: 'all',
      minPoints: undefined,
      maxPoints: undefined,
    })
  }

  const copyFilterUrl = async () => {
    const params = new URLSearchParams()
    if (filters.status && filters.status !== 'all') params.set('status', filters.status)
    if (filters.hasDeer !== null) params.set('hasDeer', String(filters.hasDeer))
    if (filters.qualityStatus && filters.qualityStatus !== 'all') params.set('qualityStatus', filters.qualityStatus)
    if (filters.minConfidence !== undefined) params.set('minConfidence', String(filters.minConfidence))
    if (filters.sex && filters.sex !== 'all') params.set('sex', filters.sex)
    if (filters.minPoints !== undefined) params.set('minPoints', String(filters.minPoints))
    if (filters.maxPoints !== undefined) params.set('maxPoints', String(filters.maxPoints))

    const url = `${window.location.origin}/photos${params.toString() ? `?${params.toString()}` : ''}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      console.error('Failed to copy to clipboard')
    }
  }

  const confidenceActive = filters.minConfidence !== undefined
  const deerValue = filters.hasDeer === null ? 'all' : String(filters.hasDeer)

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Status Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-1.5 text-xs",
              filters.status && filters.status !== 'all' && "border-copper text-copper"
            )}
          >
            {getStatusLabel()}
            <ChevronDown className="size-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-36">
          <DropdownMenuRadioGroup value={filters.status || 'all'} onValueChange={handleStatusChange}>
            {STATUS_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Deer Detection Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-1.5 text-xs",
              filters.hasDeer !== null && "border-copper text-copper"
            )}
          >
            {getDeerLabel()}
            <ChevronDown className="size-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-36">
          <DropdownMenuRadioGroup value={deerValue} onValueChange={handleDeerChange}>
            {DEER_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sex Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-1.5 text-xs",
              filters.sex && filters.sex !== 'all' && "border-copper text-copper"
            )}
          >
            {SEX_OPTIONS.find(o => o.value === (filters.sex || 'all'))?.label || 'Sex'}
            <ChevronDown className="size-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-36">
          <DropdownMenuRadioGroup value={filters.sex || 'all'} onValueChange={handleSexChange}>
            {SEX_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Quality Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-1.5 text-xs",
              filters.qualityStatus && filters.qualityStatus !== 'all' && "border-copper text-copper"
            )}
          >
            {getQualityLabel()}
            <ChevronDown className="size-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          <DropdownMenuRadioGroup value={filters.qualityStatus || 'all'} onValueChange={handleQualityChange}>
            {QUALITY_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Confidence Popover */}
      <DropdownMenu open={confidenceOpen} onOpenChange={setConfidenceOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-1.5 text-xs",
              confidenceActive && "border-copper text-copper"
            )}
          >
            <SlidersHorizontal className="size-3" />
            {confidenceActive ? `≥${filters.minConfidence}%` : 'Confidence'}
            <ChevronDown className="size-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 p-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Min Confidence</span>
              <button
                onClick={handleConfidenceToggle}
                className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded transition-colors",
                  confidenceActive
                    ? "bg-copper/20 text-copper"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {confidenceActive ? 'On' : 'Off'}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <Slider
                value={[filters.minConfidence ?? lastConfidence]}
                min={0}
                max={100}
                step={5}
                onValueChange={handleConfidenceChange}
                disabled={!confidenceActive}
                className={cn("flex-1", !confidenceActive && "opacity-40")}
              />
              <span className={cn(
                "text-xs w-10 text-right tabular-nums",
                confidenceActive ? "text-copper font-medium" : "text-muted-foreground"
              )}>
                {confidenceActive ? `${filters.minConfidence}%` : `${lastConfidence}%`}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Show photos with detections above this threshold
            </p>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Points Quick Filters (only for bucks) */}
      {filters.sex === 'buck' && (
        <div className="flex items-center gap-1">
          {POINTS_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant="outline"
              size="sm"
              className={cn(
                "h-8 text-xs px-2",
                getActivePointsFilter() === option.value && "border-copper text-copper bg-copper/10"
              )}
              onClick={() => handlePointsChange(option)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Action buttons */}
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
  )
}
