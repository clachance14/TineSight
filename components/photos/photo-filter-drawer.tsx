"use client"

import { useState, useEffect } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCameras } from "@/lib/hooks/use-cameras"
import { cn } from "@/lib/utils"
import type { PhotoFilters } from "./photo-filters"

interface FilterDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: PhotoFilters
  onFiltersChange: (filters: PhotoFilters) => void
}

const POINTS_OPTIONS = [
  { value: 'all', label: 'All', min: undefined, max: undefined },
  { value: '10+', label: '10+', min: 10, max: undefined },
  { value: '8-9', label: '8-9', min: 8, max: 9 },
  { value: '6-7', label: '6-7', min: 6, max: 7 },
  { value: '<6', label: '<6', min: undefined, max: 5 },
] as const

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

export function PhotoFilterDrawer({
  open,
  onOpenChange,
  filters,
  onFiltersChange,
}: FilterDrawerProps) {
  const { data: camerasData } = useCameras()
  const [localFilters, setLocalFilters] = useState(filters)
  const [confidenceEnabled, setConfidenceEnabled] = useState(filters.minConfidence !== undefined)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Helper to get current points selection
  const getActivePointsFilter = () => {
    const { minPoints, maxPoints } = localFilters
    if (minPoints === undefined && maxPoints === undefined) return 'all'
    if (minPoints === 10) return '10+'
    if (minPoints === 8 && maxPoints === 9) return '8-9'
    if (minPoints === 6 && maxPoints === 7) return '6-7'
    if (maxPoints === 5) return '<6'
    return 'all'
  }

  // Handlers
  const handleSexChange = (value: string) => {
    if (value === 'buck') {
      setLocalFilters({
        ...localFilters,
        sex: value as PhotoFilters['sex'],
      } as PhotoFilters)
    } else {
      setLocalFilters({
        ...omitProperties(localFilters, 'sizeClass', 'minPoints', 'maxPoints'),
        sex: value as PhotoFilters['sex'],
      } as PhotoFilters)
    }
  }

  const handleSizeClassChange = (value: string) => {
    setLocalFilters({
      ...localFilters,
      sizeClass: value as PhotoFilters['sizeClass'],
    } as PhotoFilters)
  }

  const handlePointsChange = (optionValue: string) => {
    const option = POINTS_OPTIONS.find(o => o.value === optionValue)
    if (!option) return

    if (option.min === undefined && option.max === undefined) {
      // Clear both points filters
      setLocalFilters(omitProperties(localFilters, 'minPoints', 'maxPoints') as PhotoFilters)
    } else if (option.min !== undefined && option.max === undefined) {
      // Only set minPoints
      setLocalFilters({
        ...omitProperties(localFilters, 'maxPoints'),
        minPoints: option.min,
      } as PhotoFilters)
    } else if (option.min === undefined && option.max !== undefined) {
      // Only set maxPoints
      setLocalFilters({
        ...omitProperties(localFilters, 'minPoints'),
        maxPoints: option.max,
      } as PhotoFilters)
    } else {
      // Set both
      setLocalFilters({
        ...localFilters,
        minPoints: option.min,
        maxPoints: option.max,
      })
    }
  }

  const handleStatusChange = (value: string) => {
    setLocalFilters({
      ...localFilters,
      status: value as PhotoFilters['status'],
    } as PhotoFilters)
  }

  const handleQualityChange = (value: string) => {
    setLocalFilters({
      ...localFilters,
      qualityStatus: value as PhotoFilters['qualityStatus'],
    } as PhotoFilters)
  }

  const handleConfidenceToggle = () => {
    const newEnabled = !confidenceEnabled
    setConfidenceEnabled(newEnabled)
    if (!newEnabled) {
      setLocalFilters(omitProperties(localFilters, 'minConfidence') as PhotoFilters)
    } else {
      setLocalFilters({
        ...localFilters,
        minConfidence: 50,
      })
    }
  }

  const handleConfidenceChange = (value: number[]) => {
    const confidence = value[0]
    if (confidence !== undefined && confidenceEnabled) {
      setLocalFilters({
        ...localFilters,
        minConfidence: confidence,
      })
    }
  }

  const handleCameraChange = (value: string) => {
    if (value === 'all') {
      setLocalFilters(omitProperties(localFilters, 'cameraId') as PhotoFilters)
    } else {
      setLocalFilters({
        ...localFilters,
        cameraId: value,
      })
    }
  }

  const handleApply = () => {
    onFiltersChange(localFilters)
    onOpenChange(false)
  }

  const handleReset = () => {
    const resetFilters: PhotoFilters = {
      status: 'all',
      hasDeer: null,
      qualityStatus: 'all',
      sex: 'all',
      sizeClass: 'all',
    }
    setLocalFilters(resetFilters)
    setConfidenceEnabled(false)
  }

  const isBuckSelected = localFilters.sex === 'buck'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          "bg-slate-deep border-slate",
          isMobile
            ? "h-[85vh] rounded-t-xl"
            : "w-full sm:max-w-md"
        )}
      >
        {isMobile && (
          <div className="flex justify-center pt-2 pb-4">
            <div className="w-12 h-1 rounded-full bg-slate" />
          </div>
        )}

        <SheetHeader>
          <SheetTitle className="text-cream">Filter Photos</SheetTitle>
        </SheetHeader>

        <div className={cn(
          "flex-1 overflow-y-auto space-y-6 py-6",
          isMobile && "pb-safe"
        )}>
          {/* Animal Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-slate" />
              <h3 className="text-xs font-semibold text-cream-dark uppercase tracking-wider">
                Animal
              </h3>
              <div className="h-px flex-1 bg-slate" />
            </div>

            {/* Sex Filter */}
            <div className="space-y-2.5">
              <Label className="text-cream text-xs">Sex</Label>
              <RadioGroup value={localFilters.sex || 'all'} onValueChange={handleSexChange}>
                <div className="space-y-2">
                  {['all', 'buck', 'doe', 'fawn'].map((value) => (
                    <div key={value} className="flex items-center space-x-2">
                      <RadioGroupItem
                        value={value}
                        id={`sex-${value}`}
                        className={cn(
                          "border-cream-dark",
                          localFilters.sex === value && "border-copper text-copper"
                        )}
                      />
                      <Label
                        htmlFor={`sex-${value}`}
                        className={cn(
                          "text-cream-dark cursor-pointer font-normal",
                          localFilters.sex === value && "text-copper"
                        )}
                      >
                        {value === 'all' ? 'All' : value.charAt(0).toUpperCase() + value.slice(1) + 's'}
                      </Label>
                    </div>
                  ))}
                </div>
              </RadioGroup>
            </div>

            {/* Size Class Filter - Only for Bucks */}
            {isBuckSelected && (
              <div className="space-y-2.5">
                <Label className="text-cream text-xs">Size Class</Label>
                <RadioGroup
                  value={localFilters.sizeClass || 'all'}
                  onValueChange={handleSizeClassChange}
                >
                  <div className="space-y-2">
                    {['all', 'trophy', 'standard', 'basket', 'spike'].map((value) => (
                      <div key={value} className="flex items-center space-x-2">
                        <RadioGroupItem
                          value={value}
                          id={`size-${value}`}
                          className={cn(
                            "border-cream-dark",
                            localFilters.sizeClass === value && "border-copper text-copper"
                          )}
                        />
                        <Label
                          htmlFor={`size-${value}`}
                          className={cn(
                            "text-cream-dark cursor-pointer font-normal",
                            localFilters.sizeClass === value && "text-copper"
                          )}
                        >
                          {value === 'all' ? 'All' : value.charAt(0).toUpperCase() + value.slice(1)}
                        </Label>
                      </div>
                    ))}
                  </div>
                </RadioGroup>
              </div>
            )}

            {/* Points Filter - Only for Bucks */}
            {isBuckSelected && (
              <div className="space-y-2.5">
                <Label className="text-cream text-xs">Points</Label>
                <div className="grid grid-cols-5 gap-2">
                  {POINTS_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-9 text-xs border-slate text-cream-dark hover:border-copper hover:text-copper",
                        getActivePointsFilter() === option.value &&
                          "border-copper text-copper bg-copper/10"
                      )}
                      onClick={() => handlePointsChange(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Quality Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-slate" />
              <h3 className="text-xs font-semibold text-cream-dark uppercase tracking-wider">
                Quality
              </h3>
              <div className="h-px flex-1 bg-slate" />
            </div>

            {/* Processing Status */}
            <div className="space-y-2.5">
              <Label className="text-cream text-xs">Processing Status</Label>
              <RadioGroup
                value={localFilters.status || 'all'}
                onValueChange={handleStatusChange}
              >
                <div className="space-y-2">
                  {['all', 'processing', 'completed', 'failed'].map((value) => (
                    <div key={value} className="flex items-center space-x-2">
                      <RadioGroupItem
                        value={value}
                        id={`status-${value}`}
                        className={cn(
                          "border-cream-dark",
                          localFilters.status === value && "border-copper text-copper"
                        )}
                      />
                      <Label
                        htmlFor={`status-${value}`}
                        className={cn(
                          "text-cream-dark cursor-pointer font-normal",
                          localFilters.status === value && "text-copper"
                        )}
                      >
                        {value === 'all' ? 'All' : value.charAt(0).toUpperCase() + value.slice(1)}
                      </Label>
                    </div>
                  ))}
                </div>
              </RadioGroup>
            </div>

            {/* Detection Quality */}
            <div className="space-y-2.5">
              <Label className="text-cream text-xs">Detection Quality</Label>
              <RadioGroup
                value={localFilters.qualityStatus || 'all'}
                onValueChange={handleQualityChange}
              >
                <div className="space-y-2">
                  {[
                    { value: 'all', label: 'All' },
                    { value: 'high_quality', label: 'High Quality' },
                    { value: 'low_quality', label: 'Low Quality' },
                    { value: 'manual_review', label: 'Manual Review' },
                    { value: 'pending', label: 'Pending' },
                  ].map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <RadioGroupItem
                        value={option.value}
                        id={`quality-${option.value}`}
                        className={cn(
                          "border-cream-dark",
                          localFilters.qualityStatus === option.value && "border-copper text-copper"
                        )}
                      />
                      <Label
                        htmlFor={`quality-${option.value}`}
                        className={cn(
                          "text-cream-dark cursor-pointer font-normal",
                          localFilters.qualityStatus === option.value && "text-copper"
                        )}
                      >
                        {option.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </RadioGroup>
            </div>

            {/* Confidence Slider */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-cream text-xs">Confidence Threshold</Label>
                <button
                  onClick={handleConfidenceToggle}
                  className={cn(
                    "text-xs font-medium px-2.5 py-1 rounded-md transition-colors",
                    confidenceEnabled
                      ? "bg-copper/20 text-copper border border-copper/30"
                      : "text-cream-dark border border-slate hover:border-cream-dark"
                  )}
                >
                  {confidenceEnabled ? 'On' : 'Off'}
                </button>
              </div>
              <div className="flex items-center gap-3">
                <Slider
                  value={[localFilters.minConfidence ?? 50]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={handleConfidenceChange}
                  disabled={!confidenceEnabled}
                  className={cn("flex-1", !confidenceEnabled && "opacity-40")}
                />
                <span
                  className={cn(
                    "text-xs w-12 text-right tabular-nums font-medium",
                    confidenceEnabled ? "text-copper" : "text-cream-dark"
                  )}
                >
                  {localFilters.minConfidence ?? 50}%
                </span>
              </div>
              <p className="text-xs text-cream-dark/70">
                Show photos with detections above this threshold
              </p>
            </div>
          </section>

          {/* Date & Camera Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-slate" />
              <h3 className="text-xs font-semibold text-cream-dark uppercase tracking-wider">
                Date & Camera
              </h3>
              <div className="h-px flex-1 bg-slate" />
            </div>

            {/* Camera Filter */}
            <div className="space-y-2.5">
              <Label className="text-cream text-xs">Camera</Label>
              <Select
                value={localFilters.cameraId || 'all'}
                onValueChange={handleCameraChange}
              >
                <SelectTrigger className="w-full bg-slate border-slate text-cream-dark hover:border-copper">
                  <SelectValue placeholder="Select camera" />
                </SelectTrigger>
                <SelectContent className="bg-slate border-slate">
                  <SelectItem value="all" className="text-cream-dark">
                    All Cameras
                  </SelectItem>
                  {camerasData?.cameras.map((camera) => (
                    <SelectItem
                      key={camera.id}
                      value={camera.id}
                      className="text-cream-dark"
                    >
                      {camera.name || camera.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Range - Placeholder for future integration */}
            <div className="space-y-2.5">
              <Label className="text-cream text-xs">Date Range</Label>
              <div className="flex items-center justify-center h-20 border border-dashed border-slate rounded-md">
                <p className="text-xs text-cream-dark/50">Date picker coming soon</p>
              </div>
            </div>
          </section>
        </div>

        <SheetFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleReset}
            className="flex-1 border-slate text-cream-dark hover:border-copper hover:text-copper"
          >
            Reset
          </Button>
          <Button
            onClick={handleApply}
            className="flex-1 bg-copper hover:bg-copper-light text-slate-deep"
          >
            Apply Filters
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
