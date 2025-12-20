"use client"

import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useCameras } from "@/lib/hooks/use-cameras"
import { useBatches } from "@/lib/hooks/use-batches"
import { useUploadSessions } from "@/lib/hooks/use-upload-sessions"
import type { PhotoFilters } from "./photo-filters"

interface PhotoFilterChipsProps {
  filters: PhotoFilters
  onFiltersChange: (filters: PhotoFilters) => void
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

export function PhotoFilterChips({ filters, onFiltersChange }: PhotoFilterChipsProps) {
  const { data: camerasData } = useCameras()
  const { data: batchesData } = useBatches()
  const { data: sessionsData } = useUploadSessions()
  const chips: { label: string; onRemove: () => void }[] = []

  // Status filter
  if (filters.status && filters.status !== 'all') {
    const labels: Record<string, string> = {
      processing: 'Processing',
      completed: 'Completed',
      failed: 'Failed'
    }
    chips.push({
      label: labels[filters.status] || filters.status,
      onRemove: () => onFiltersChange({ ...filters, status: 'all' })
    })
  }

  // Deer detection filter
  if (filters.hasDeer !== null && filters.hasDeer !== undefined) {
    chips.push({
      label: filters.hasDeer ? 'Has Deer' : 'Empty',
      onRemove: () => onFiltersChange({ ...filters, hasDeer: null })
    })
  }

  // Quality filter
  if (filters.qualityStatus && filters.qualityStatus !== 'all') {
    const labels: Record<string, string> = {
      high_quality: 'High Quality',
      low_quality: 'Low Quality',
      manual_review: 'Manual Review',
      pending: 'Pending'
    }
    chips.push({
      label: labels[filters.qualityStatus] || filters.qualityStatus,
      onRemove: () => onFiltersChange({ ...filters, qualityStatus: 'all' })
    })
  }

  // Sex filter
  if (filters.sex && filters.sex !== 'all') {
    const labels: Record<string, string> = {
      buck: 'Bucks',
      doe: 'Does',
      fawn: 'Fawns',
      unknown: 'Unknown'
    }
    chips.push({
      label: labels[filters.sex] || filters.sex,
      onRemove: () => {
        onFiltersChange({
          ...omitProperties(filters, 'minPoints', 'maxPoints'),
          sex: 'all',
          sizeClass: 'all'
        } as PhotoFilters)
      }
    })
  }

  // Size class filter
  if (filters.sizeClass && filters.sizeClass !== 'all') {
    const labels: Record<string, string> = {
      trophy: 'Trophy',
      standard: 'Standard',
      basket: 'Basket',
      spike: 'Spike',
      unknown: 'Unknown'
    }
    chips.push({
      label: labels[filters.sizeClass] || filters.sizeClass,
      onRemove: () => onFiltersChange({ ...filters, sizeClass: 'all' })
    })
  }

  // Points filter
  if (filters.minPoints !== undefined || filters.maxPoints !== undefined) {
    let label = 'Points: '
    if (filters.minPoints !== undefined && filters.maxPoints === undefined) {
      label += `${filters.minPoints}+`
    } else if (filters.minPoints === undefined && filters.maxPoints !== undefined) {
      label += `≤${filters.maxPoints}`
    } else {
      label += `${filters.minPoints}-${filters.maxPoints}`
    }
    chips.push({
      label,
      onRemove: () => {
        onFiltersChange(omitProperties(filters, 'minPoints', 'maxPoints') as PhotoFilters)
      }
    })
  }

  // Confidence filter
  if (filters.minConfidence !== undefined) {
    chips.push({
      label: `≥${filters.minConfidence}%`,
      onRemove: () => {
        onFiltersChange(omitProperties(filters, 'minConfidence') as PhotoFilters)
      }
    })
  }

  // Date filter
  if (filters.datePreset && filters.datePreset !== 'custom') {
    const labels: Record<string, string> = {
      today: 'Today',
      last7days: 'Last 7 Days',
      last30days: 'Last 30 Days'
    }
    chips.push({
      label: labels[filters.datePreset] || filters.datePreset,
      onRemove: () => {
        onFiltersChange(omitProperties(filters, 'datePreset', 'dateFrom', 'dateTo') as PhotoFilters)
      }
    })
  } else if (filters.dateFrom || filters.dateTo) {
    let label = ''
    if (filters.dateFrom && filters.dateTo) {
      const from = new Date(filters.dateFrom)
      const to = new Date(filters.dateTo)
      const fromStr = from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const toStr = to.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      label = `${fromStr} - ${toStr}`
    } else if (filters.dateFrom) {
      const from = new Date(filters.dateFrom)
      label = `From ${from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    } else if (filters.dateTo) {
      const to = new Date(filters.dateTo)
      label = `Until ${to.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    }
    chips.push({
      label,
      onRemove: () => {
        onFiltersChange(omitProperties(filters, 'dateFrom', 'dateTo', 'datePreset') as PhotoFilters)
      }
    })
  }

  // Camera filter
  if (filters.cameraId) {
    const camera = camerasData?.cameras.find(c => c.id === filters.cameraId)
    const cameraName = camera?.name || filters.cameraId.slice(0, 8)
    chips.push({
      label: `Camera: ${cameraName}`,
      onRemove: () => {
        onFiltersChange(omitProperties(filters, 'cameraId') as PhotoFilters)
      }
    })
  }

  // Batch filter
  if (filters.batchId) {
    const batch = batchesData?.batches.find(b => b.id === filters.batchId)
    let batchLabel = `Batch: ${filters.batchId.slice(0, 8)}...`
    if (batch) {
      const date = new Date(batch.created_at)
      batchLabel = `Batch: ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    }
    chips.push({
      label: batchLabel,
      onRemove: () => {
        onFiltersChange(omitProperties(filters, 'batchId') as PhotoFilters)
      }
    })
  }

  // Upload Session filter
  if (filters.uploadSessionId) {
    const session = sessionsData?.sessions.find(s => s.id === filters.uploadSessionId)
    let sessionLabel = `Upload: ${filters.uploadSessionId.slice(0, 8)}...`
    if (session) {
      const date = new Date(session.created_at)
      sessionLabel = `Upload: ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (${session.total_images})`
    }
    chips.push({
      label: sessionLabel,
      onRemove: () => {
        onFiltersChange(omitProperties(filters, 'uploadSessionId') as PhotoFilters)
      }
    })
  }

  // Sort filter (only show chip if non-default)
  if (filters.sortBy === 'captured_at') {
    chips.push({
      label: 'Sort: Captured',
      onRemove: () => {
        onFiltersChange(omitProperties(filters, 'sortBy') as PhotoFilters)
      }
    })
  }

  // Clear all filters helper
  const clearAll = () => {
    onFiltersChange({
      status: 'all',
      hasDeer: null,
      qualityStatus: 'all',
      sex: 'all',
      sizeClass: 'all',
      uploadSessionId: undefined,
    })
  }

  if (chips.length === 0) {
    return null
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {chips.map((chip, index) => (
        <Badge
          key={index}
          variant="secondary"
          className="gap-1.5 pr-1 pl-2.5 text-xs"
        >
          <span>{chip.label}</span>
          <button
            onClick={chip.onRemove}
            className="rounded-full p-0.5 hover:bg-slate-600 transition-colors"
            aria-label={`Remove ${chip.label} filter`}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}

      {chips.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAll}
          className="h-7 text-xs text-muted-foreground hover:text-foreground"
        >
          Clear all
        </Button>
      )}
    </div>
  )
}
