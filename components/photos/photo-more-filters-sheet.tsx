'use client'

import * as React from 'react'
import { type JSX } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AreasDropdown } from '@/components/photos/filters/AreasDropdown'
import { NamedDeerDropdown } from '@/components/photos/filters/NamedDeerDropdown'
import { OtherAnimalsDropdown } from '@/components/photos/filters/OtherAnimalsDropdown'
import { PhotoDateRangePicker } from '@/components/photos/photo-date-range-picker'
import type { OtherAnimalType, PhotoFilters } from '@/lib/services/photos'

type QuickFilters = Omit<PhotoFilters, 'offset'>

interface PhotoMoreFiltersSheetProps {
  filters: QuickFilters
  onChange: (filters: QuickFilters) => void
  deerList: { id: string; name: string }[]
  areaList: string[]
}

/**
 * The "Filters" bottom sheet: the lower-frequency cuts (Area, Named deer, Date
 * range, Other animals) live here, one tap off the always-visible bar. The hero
 * score-tier filter + Bucks stay inline (see PhotoQuickFilters). The trigger
 * shows an active-count badge so the operator knows filters are applied even
 * though they're tucked away.
 */
export function PhotoMoreFiltersSheet({
  filters,
  onChange,
  deerList,
  areaList,
}: PhotoMoreFiltersSheetProps): JSX.Element {
  // Count only the dims this sheet owns (score + bucks live on the bar).
  const activeCount =
    (filters.areaNames?.length ? 1 : 0) +
    (filters.deerId !== undefined ? 1 : 0) +
    (filters.dateFrom !== undefined || filters.dateTo !== undefined ? 1 : 0) +
    (filters.otherAnimals?.length ? 1 : 0)

  function patch(next: Partial<QuickFilters>): void {
    onChange({ ...filters, ...next })
  }

  function clearSheetDims(): void {
    const cleared: QuickFilters = { ...filters }
    delete cleared.areaNames
    delete cleared.deerId
    delete cleared.dateFrom
    delete cleared.dateTo
    delete cleared.otherAnimals
    onChange(cleared)
  }

  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-[13px] transition-colors',
            activeCount > 0
              ? 'border-brass/50 bg-brass/15 text-parchment glow-brass'
              : 'border-forest-light/70 bg-forest text-parchment-dark hover:border-forest-light'
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-weathered" />
          Filters
          {activeCount > 0 ? (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brass px-1 font-mono text-[11px] font-semibold text-deep-forest">
              {activeCount}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>

      {/* Anchored to the Filters button (drops right under it, end-aligned) so
          the controls are where the cursor already is — no trip to a bottom
          sheet. Caps to the viewport and scrolls if tall. */}
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[380px] max-w-[calc(100vw-1.5rem)] max-h-[75vh] overflow-y-auto p-4"
      >
        <h2 className="font-fraunces text-[17px] text-parchment">Filters</h2>

        <div className="flex flex-col gap-5 py-4">
          {areaList.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="label-premium text-weathered">Area</span>
              <AreasDropdown
                areas={areaList}
                selected={filters.areaNames ?? []}
                onChange={(selected) => {
                  if (selected.length > 0) {
                    patch({ areaNames: selected })
                  } else {
                    const next = { ...filters }
                    delete next.areaNames
                    onChange(next)
                  }
                }}
              />
            </div>
          ) : null}

          {deerList.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="label-premium text-weathered">Named buck</span>
              <NamedDeerDropdown
                deerList={deerList}
                value={filters.deerId ?? null}
                onChange={(deerId) => {
                  if (deerId !== null) {
                    patch({ deerId })
                  } else {
                    const next = { ...filters }
                    delete next.deerId
                    onChange(next)
                  }
                }}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <span className="label-premium text-weathered">Date range</span>
            <PhotoDateRangePicker
              {...(filters.dateFrom !== undefined ? { dateFrom: filters.dateFrom } : {})}
              {...(filters.dateTo !== undefined ? { dateTo: filters.dateTo } : {})}
              onDateChange={({ dateFrom, dateTo }) => {
                const next = { ...filters }
                if (dateFrom !== undefined) next.dateFrom = dateFrom
                else delete next.dateFrom
                if (dateTo !== undefined) next.dateTo = dateTo
                else delete next.dateTo
                onChange(next)
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="label-premium text-weathered">Other animals</span>
            <OtherAnimalsDropdown
              selected={(filters.otherAnimals ?? []) as OtherAnimalType[]}
              onChange={(selected) => {
                if (selected.length > 0) {
                  patch({ otherAnimals: selected })
                } else {
                  const next = { ...filters }
                  delete next.otherAnimals
                  onChange(next)
                }
              }}
            />
          </div>
        </div>

        <div className="flex flex-row justify-between gap-2 border-t border-forest-light/40 pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSheetDims}
            disabled={activeCount === 0}
            className="text-weathered"
          >
            Clear
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
