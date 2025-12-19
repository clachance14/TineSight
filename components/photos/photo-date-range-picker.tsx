"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type DatePreset = 'today' | 'last7days' | 'last30days' | 'custom'

interface PhotoDateRangePickerProps {
  dateFrom?: string
  dateTo?: string
  datePreset?: DatePreset
  onDateChange: (dates: {
    dateFrom?: string
    dateTo?: string
    datePreset?: DatePreset
  }) => void
}

export function PhotoDateRangePicker({
  dateFrom,
  dateTo,
  datePreset = 'last30days',
  onDateChange,
}: PhotoDateRangePickerProps) {
  const [localDateFrom, setLocalDateFrom] = React.useState(dateFrom || '')
  const [localDateTo, setLocalDateTo] = React.useState(dateTo || '')

  // Update local state when props change
  React.useEffect(() => {
    setLocalDateFrom(dateFrom || '')
    setLocalDateTo(dateTo || '')
  }, [dateFrom, dateTo])

  const handlePresetClick = React.useCallback((preset: DatePreset) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    let newDateFrom: string | undefined
    let newDateTo: string | undefined

    switch (preset) {
      case 'today': {
        const todayStr = today.toISOString().split('T')[0]
        newDateFrom = todayStr
        newDateTo = todayStr
        break
      }
      case 'last7days': {
        const sevenDaysAgo = new Date(today)
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
        newDateFrom = sevenDaysAgo.toISOString().split('T')[0]
        newDateTo = today.toISOString().split('T')[0]
        break
      }
      case 'last30days': {
        const thirtyDaysAgo = new Date(today)
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        newDateFrom = thirtyDaysAgo.toISOString().split('T')[0]
        newDateTo = today.toISOString().split('T')[0]
        break
      }
      case 'custom': {
        // For custom, keep the current dates or clear them
        newDateFrom = localDateFrom || undefined
        newDateTo = localDateTo || undefined
        break
      }
    }

    setLocalDateFrom(newDateFrom || '')
    setLocalDateTo(newDateTo || '')

    onDateChange({
      ...(newDateFrom ? { dateFrom: newDateFrom } : {}),
      ...(newDateTo ? { dateTo: newDateTo } : {}),
      datePreset: preset,
    })
  }, [localDateFrom, localDateTo, onDateChange])

  const handleCustomDateChange = React.useCallback((
    field: 'from' | 'to',
    value: string
  ) => {
    if (field === 'from') {
      setLocalDateFrom(value)
      onDateChange({
        ...(value ? { dateFrom: value } : {}),
        ...(localDateTo ? { dateTo: localDateTo } : {}),
        datePreset: 'custom',
      })
    } else {
      setLocalDateTo(value)
      onDateChange({
        ...(localDateFrom ? { dateFrom: localDateFrom } : {}),
        ...(value ? { dateTo: value } : {}),
        datePreset: 'custom',
      })
    }
  }, [localDateFrom, localDateTo, onDateChange])

  const presets = [
    { value: 'today', label: 'Today' },
    { value: 'last7days', label: 'Last 7 days' },
    { value: 'last30days', label: 'Last 30 days' },
    { value: 'custom', label: 'Custom' },
  ] as const

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CalendarIcon className="size-4" />
        <span className="font-medium">Date Range</span>
      </div>

      {/* Preset Buttons */}
      <div className="grid grid-cols-2 gap-2">
        {presets.map((preset) => (
          <Button
            key={preset.value}
            type="button"
            variant={datePreset === preset.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePresetClick(preset.value)}
            className={cn(
              "transition-all duration-200",
              datePreset === preset.value && [
                "bg-primary text-primary-foreground",
                "shadow-sm glow-brass",
              ]
            )}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      {/* Custom Date Inputs */}
      {datePreset === 'custom' && (
        <div className="space-y-3 pt-2 border-t border-border">
          <div className="space-y-2">
            <label
              htmlFor="date-from"
              className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
            >
              From
            </label>
            <Input
              id="date-from"
              type="date"
              value={localDateFrom}
              onChange={(e) => handleCustomDateChange('from', e.target.value)}
              max={localDateTo || undefined}
              className="w-full dark:bg-card/50"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="date-to"
              className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
            >
              To
            </label>
            <Input
              id="date-to"
              type="date"
              value={localDateTo}
              onChange={(e) => handleCustomDateChange('to', e.target.value)}
              min={localDateFrom || undefined}
              className="w-full dark:bg-card/50"
            />
          </div>
        </div>
      )}

      {/* Date Range Summary */}
      {datePreset !== 'custom' && (dateFrom || dateTo) && (
        <div className="text-xs text-muted-foreground pt-2 border-t border-border">
          {dateFrom === dateTo ? (
            <span>{formatDate(dateFrom)}</span>
          ) : (
            <span>
              {formatDate(dateFrom)} - {formatDate(dateTo)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return 'N/A'

  try {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}
