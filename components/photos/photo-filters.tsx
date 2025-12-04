"use client"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { X } from "lucide-react"

export interface PhotoFilters {
  status?: 'all' | 'processing' | 'completed' | 'failed' | undefined
  hasDeer?: boolean | null | undefined
  batchId?: string | undefined
  qualityStatus?: 'all' | 'high_quality' | 'low_quality' | 'manual_review' | 'pending' | undefined
}

interface PhotoFiltersProps {
  filters: PhotoFilters
  onFiltersChange: (filters: PhotoFilters) => void
}

export function PhotoFilters({ filters, onFiltersChange }: PhotoFiltersProps) {
  const hasActiveFilters =
    (filters.status && filters.status !== 'all') ||
    filters.hasDeer !== null ||
    filters.batchId ||
    (filters.qualityStatus && filters.qualityStatus !== 'all')

  const handleStatusChange = (status: PhotoFilters['status']) => {
    onFiltersChange({ ...filters, status })
  }

  const handleDeerFilterChange = (hasDeer: boolean | null) => {
    onFiltersChange({ ...filters, hasDeer })
  }

  const handleQualityStatusChange = (value: string) => {
    const qualityStatus = value as PhotoFilters['qualityStatus']
    onFiltersChange({ ...filters, qualityStatus })
  }

  const clearFilters = () => {
    onFiltersChange({
      status: 'all',
      hasDeer: null,
      batchId: undefined,
      qualityStatus: 'all',
    })
  }

  const getActiveFilterCount = () => {
    let count = 0
    if (filters.status && filters.status !== 'all') count++
    if (filters.hasDeer !== null) count++
    if (filters.batchId) count++
    if (filters.qualityStatus && filters.qualityStatus !== 'all') count++
    return count
  }

  return (
    <div className="space-y-4">
      {/* Filter Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-foreground">Filters</h3>
          {hasActiveFilters && (
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
              {getActiveFilterCount()} active
            </span>
          )}
        </div>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-7 gap-1 text-xs"
          >
            <X className="size-3" />
            Clear all
          </Button>
        )}
      </div>

      {/* Status Filter */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          Status
        </label>
        <div className="flex flex-wrap gap-2">
          {(['all', 'processing', 'completed', 'failed'] as const).map((status) => (
            <Button
              key={status}
              variant={filters.status === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleStatusChange(status)}
              className="h-8 text-xs capitalize"
            >
              {status === 'all' ? 'All Photos' : status}
            </Button>
          ))}
        </div>
      </div>

      {/* Deer Detection Filter */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          Deer Detection
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filters.hasDeer === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleDeerFilterChange(null)}
            className="h-8 text-xs"
          >
            All
          </Button>
          <Button
            variant={filters.hasDeer === true ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleDeerFilterChange(true)}
            className="h-8 text-xs"
          >
            Has Deer
          </Button>
          <Button
            variant={filters.hasDeer === false ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleDeerFilterChange(false)}
            className="h-8 text-xs"
          >
            Empty
          </Button>
        </div>
      </div>

      {/* Quality Status Filter */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          Quality Status
        </label>
        <Select
          value={filters.qualityStatus || 'all'}
          onValueChange={handleQualityStatusChange}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="All Quality" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Quality</SelectItem>
            <SelectItem value="high_quality">High Quality</SelectItem>
            <SelectItem value="low_quality">Low Quality</SelectItem>
            <SelectItem value="manual_review">Manual Review</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Active Filters Summary */}
      {hasActiveFilters && (
        <div className="space-y-2 border-t border-border pt-4">
          <label className="text-xs font-medium text-muted-foreground">
            Active Filters
          </label>
          <div className="flex flex-wrap gap-2">
            {filters.status && filters.status !== 'all' && (
              <div className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs">
                <span className="text-foreground">
                  Status: <span className="font-medium capitalize">{filters.status}</span>
                </span>
                <button
                  onClick={() => handleStatusChange('all')}
                  className="ml-1 hover:text-foreground"
                  aria-label="Remove status filter"
                >
                  <X className="size-3" />
                </button>
              </div>
            )}
            {filters.hasDeer !== null && (
              <div className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs">
                <span className="text-foreground">
                  {filters.hasDeer ? 'Has Deer' : 'Empty'}
                </span>
                <button
                  onClick={() => handleDeerFilterChange(null)}
                  className="ml-1 hover:text-foreground"
                  aria-label="Remove deer detection filter"
                >
                  <X className="size-3" />
                </button>
              </div>
            )}
            {filters.batchId && (
              <div className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs">
                <span className="text-foreground">
                  Batch: <span className="font-medium">{filters.batchId}</span>
                </span>
                <button
                  onClick={() => onFiltersChange({ ...filters, batchId: undefined })}
                  className="ml-1 hover:text-foreground"
                  aria-label="Remove batch filter"
                >
                  <X className="size-3" />
                </button>
              </div>
            )}
            {filters.qualityStatus && filters.qualityStatus !== 'all' && (
              <div className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs">
                <span className="text-foreground">
                  Quality:{' '}
                  <span className="font-medium capitalize">
                    {filters.qualityStatus.replace('_', ' ')}
                  </span>
                </span>
                <button
                  onClick={() => handleQualityStatusChange('all')}
                  className="ml-1 hover:text-foreground"
                  aria-label="Remove quality status filter"
                >
                  <X className="size-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
