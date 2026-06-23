'use client'

import { type JSX } from 'react'
import { ChevronDown, Gauge } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { PhotoMoreFiltersSheet } from '@/components/photos/photo-more-filters-sheet'
import type { PhotoFilters, PhotoSortField, PhotoSortDirection } from '@/lib/services/photos'

type QuickFilters = Omit<PhotoFilters, 'offset'>

interface PhotoQuickFiltersProps {
  filters: QuickFilters
  onChange: (filters: QuickFilters) => void
  counts?: { all?: number }
  /** Per-account trophy line (gross inches) — anchors the lowest score tier. */
  trophyThreshold: number
  deerList: { id: string; name: string }[]
  areaList: string[]
}

// Sort options. "Highest score" pairs with the score-tier filter — the
// prospecting motion is "everything 170+, biggest first" in two taps.
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'best_score:desc', label: 'Highest score' },
  { value: 'captured_at:desc', label: 'Newest' },
  { value: 'captured_at:asc', label: 'Oldest' },
  { value: 'imported_at:desc', label: 'Recently uploaded' },
]

function formatCount(n: number | undefined): string | null {
  if (n === undefined || n <= 0) return null
  return n.toLocaleString()
}

/**
 * Score tiers anchored on the account's trophy line: the lowest rung IS the real
 * trophy threshold (not a hardcoded 130), then ranch-class rungs above it. On a
 * bred-for-antlers high-fence ranch 200"+ is normal, so a 130 floor is too low.
 */
function scoreTiers(threshold: number): number[] {
  const rungs = [150, 170, 190, 210]
  const tiers = [threshold, ...rungs.filter((r) => r > threshold)]
  return [...new Set(tiers)].sort((a, b) => a - b)
}

export function PhotoQuickFilters({
  filters,
  onChange,
  counts,
  trophyThreshold,
  deerList,
  areaList,
}: PhotoQuickFiltersProps): JSX.Element {
  const tiers = scoreTiers(trophyThreshold)

  const bucksActive = filters.sex === 'buck'
  // "All" is the resting state: no inline filters and no sheet dims applied.
  const anyApplied =
    filters.sex !== undefined ||
    filters.minScore !== undefined ||
    (filters.areaNames?.length ?? 0) > 0 ||
    filters.deerId !== undefined ||
    filters.dateFrom !== undefined ||
    filters.dateTo !== undefined ||
    (filters.otherAnimals?.length ?? 0) > 0

  const base: QuickFilters = {
    limit: filters.limit ?? 50,
    sortBy: filters.sortBy ?? 'captured_at',
    sortDirection: filters.sortDirection ?? 'desc',
  }

  function clearAll(): void {
    onChange(base)
  }

  function toggleBucks(): void {
    if (bucksActive) {
      const next = { ...filters }
      delete next.sex
      onChange(next)
    } else {
      onChange({ ...filters, sex: 'buck' })
    }
  }

  function applyScore(value: string): void {
    const next = { ...filters }
    if (value === 'any') {
      delete next.minScore
    } else {
      next.minScore = parseInt(value, 10)
    }
    onChange(next)
  }

  const scoreValue = filters.minScore !== undefined ? String(filters.minScore) : 'any'
  const scoreLabel = filters.minScore !== undefined ? `${filters.minScore}+` : 'Score'

  const sortValue = `${filters.sortBy ?? 'captured_at'}:${filters.sortDirection ?? 'desc'}`
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortValue)?.label ?? 'Newest'

  function applySort(value: string): void {
    const [field, direction] = value.split(':') as [PhotoSortField, PhotoSortDirection]
    onChange({ ...filters, sortBy: field, sortDirection: direction })
  }

  const allCount = formatCount(counts?.all)

  return (
    <div className="flex items-center gap-3">
      {/* Inline bar: All · Bucks · Score tiers · Filters sheet — scrollable on mobile */}
      <div className="-mx-1 flex flex-1 items-center gap-2 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* All */}
        <button
          type="button"
          onClick={clearAll}
          aria-pressed={!anyApplied}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
            !anyApplied
              ? 'border-brass/50 bg-brass/15 text-parchment glow-brass'
              : 'border-forest-light/70 bg-forest text-parchment-dark hover:border-forest-light'
          )}
        >
          All
          {allCount !== null ? (
            <span className={cn('font-mono text-[11px]', !anyApplied ? 'text-brass-light' : 'text-weathered')}>
              {allCount}
            </span>
          ) : null}
        </button>

        {/* Bucks (toggle) */}
        <button
          type="button"
          onClick={toggleBucks}
          aria-pressed={bucksActive}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
            bucksActive
              ? 'border-brass/50 bg-brass/15 text-parchment glow-brass'
              : 'border-forest-light/70 bg-forest text-parchment-dark hover:border-forest-light'
          )}
        >
          Bucks
        </button>

        {/* Score tiers (the hero) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-pressed={filters.minScore !== undefined}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                filters.minScore !== undefined
                  ? 'border-brass/50 bg-brass/15 text-parchment glow-brass'
                  : 'border-forest-light/70 bg-forest text-parchment-dark hover:border-forest-light'
              )}
            >
              <Gauge className={cn('h-3.5 w-3.5', filters.minScore !== undefined ? 'text-brass' : 'text-weathered')} />
              <span className={filters.minScore !== undefined ? 'font-mono' : ''}>{scoreLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 text-weathered" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup value={scoreValue} onValueChange={applyScore}>
              <DropdownMenuRadioItem value="any">Any score</DropdownMenuRadioItem>
              {tiers.map((t) => (
                <DropdownMenuRadioItem key={t} value={String(t)} className="font-mono">
                  {t}+
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* More filters (area / named buck / date / other animals) */}
        <PhotoMoreFiltersSheet
          filters={filters}
          onChange={onChange}
          deerList={deerList}
          areaList={areaList}
        />
      </div>

      {/* Sort */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-forest-light/70 bg-forest px-3 py-2 text-[13px] text-parchment-dark transition-colors hover:border-forest-light"
          >
            {sortLabel}
            <ChevronDown className="h-3.5 w-3.5 text-weathered" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup value={sortValue} onValueChange={applySort}>
            {SORT_OPTIONS.map((o) => (
              <DropdownMenuRadioItem key={o.value} value={o.value}>
                {o.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
