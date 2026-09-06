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
import { Sheet, SheetTrigger, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { AreasDropdown } from '@/components/photos/filters/AreasDropdown'
import { NamedDeerDropdown } from '@/components/photos/filters/NamedDeerDropdown'
import { OtherAnimalsDropdown } from '@/components/photos/filters/OtherAnimalsDropdown'
import { PhotoDateRangePicker } from '@/components/photos/photo-date-range-picker'
import { useCameras } from '@/lib/hooks/use-cameras'
import { useUploadSessions } from '@/lib/hooks/use-upload-sessions'
import { withArchiveState, withReviewStatus, withSourceField, type SourceFilterKey } from '@/lib/photos/filters'
import type { PhotoFilters } from '@/lib/services/photos'

type QuickFilters = Omit<PhotoFilters, 'offset'>

interface PhotoMoreFiltersSheetProps {
  filters: QuickFilters
  onChange: (filters: QuickFilters) => void
  deerList: Array<{ id: string; name: string }>
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
    (Boolean(filters.areaNames?.length) ? 1 : 0) +
    (filters.deerId !== undefined ? 1 : 0) +
    (filters.dateFrom !== undefined || filters.dateTo !== undefined ? 1 : 0) +
    (Boolean(filters.otherAnimals?.length) ? 1 : 0) +
    (Boolean(filters.cameraId) ? 1 : 0) + (Boolean(filters.uploadSessionId) ? 1 : 0) +
    (filters.reviewStatus !== undefined ? 1 : 0) +
    (Boolean(filters.status) ? 1 : 0) + (Boolean(filters.qualityStatus) ? 1 : 0) +
    (filters.minConfidence !== undefined ? 1 : 0) +
    (filters.minPoints !== undefined || filters.maxPoints !== undefined ? 1 : 0) +
    (filters.emptyOnly === true || filters.hasDeer !== undefined || filters.sex !== undefined ? 1 : 0) +
    (Boolean(filters.isArchived) || Boolean(filters.includeArchived) ? 1 : 0)

  function patch(next: Partial<QuickFilters>): void {
    onChange({ ...filters, ...next })
  }

  function clearAllFilters(): void {
    onChange({ triageView: 'all' })
    setConfidence(50)
    setOpen(false)
  }

  const [open, setOpen] = React.useState(false)
  const [mobile, setMobile] = React.useState(false)
  React.useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)')
    const update = (): void => setMobile(media.matches)
    update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const { data: cameraData } = useCameras()
  const { data: sessionData } = useUploadSessions()
  const [confidence, setConfidence] = React.useState(filters.minConfidence ?? 50)
  const selectClass = 'min-h-11 w-full rounded-md border border-forest-light bg-forest px-3 text-sm text-parchment'
  function setField(key: SourceFilterKey, value: string): void {
    onChange(withSourceField(filters, key, value))
  }

  const trigger = (
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
  )
  const contents = (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-fraunces text-[17px] text-parchment">Filters</h2>
        <Button variant="ghost" size="sm" onClick={clearAllFilters} className="min-h-11 text-weathered">Clear all filters</Button>
      </div>

        <div className="flex flex-col gap-5 py-4">
          <label className="flex flex-col gap-1.5 text-xs text-weathered">
            Camera
            <select aria-label="Camera" className={selectClass} value={filters.cameraId ?? ''} onChange={(event) => setField('cameraId', event.target.value)}>
              <option value="">All cameras</option>
              {(cameraData?.cameras ?? []).map(camera => <option key={camera.id} value={camera.id}>{camera.name !== '' ? camera.name : `Camera ${camera.id.slice(0, 6)}`}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-weathered">
            Upload
            <select aria-label="Upload" className={selectClass} value={filters.uploadSessionId ?? ''} onChange={(event) => setField('uploadSessionId', event.target.value)}>
              <option value="">All uploads</option>
              {(sessionData?.sessions ?? []).map(session => <option key={session.id} value={session.id}>{new Date(session.created_at).toLocaleString()} · {session.total_images} photos</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-weathered">
            Deer
            <select aria-label="Deer" className={selectClass} value={filters.emptyOnly === true ? 'empty' : filters.sex ?? (filters.hasDeer === true ? 'deer' : filters.hasDeer === false ? 'no-deer' : '')} onChange={(event) => {
              const next = { ...filters }
              delete next.sex; delete next.hasDeer; delete next.hasDetections; delete next.emptyOnly
              next.triageView = 'all'
              const value = event.target.value
              if (value === 'empty') { next.emptyOnly = true; delete next.otherAnimals; delete next.status; delete next.qualityStatus; delete next.minConfidence; delete next.minPoints; delete next.maxPoints; delete next.minScore; delete next.deerId }
              else if (value === 'deer') next.hasDeer = true
              else if (value === 'no-deer') next.hasDeer = false
              else if (Boolean(value)) next.sex = value
              onChange(next)
            }}>
              <option value="">Any content</option><option value="deer">All deer</option>
              <option value="buck">Bucks</option><option value="doe">Does</option>
              <option value="fawn">Fawns</option><option value="unknown">Unknown sex</option>
              <option value="no-deer">No deer / other content</option><option value="empty">Empty photos</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-weathered">
            Review status
            <select aria-label="Review status" className={selectClass} value={filters.reviewStatus ?? ''} onChange={(event) => {
              onChange(withReviewStatus(filters, event.target.value))
            }}>
              <option value="">Any review status</option><option value="unreviewed">Unreviewed</option>
              <option value="keep">Kept</option><option value="review_later">Review later</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-weathered">
            Analysis
            <select aria-label="Analysis" className={selectClass} value={filters.status ?? ''} onChange={(event) => setField('status', event.target.value)}>
              <option value="">Any status</option><option value="pending">Pending</option>
              <option value="processing">Processing</option><option value="completed">Completed</option><option value="failed">Failed</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-weathered">
            Photo quality
            <select aria-label="Photo quality" className={selectClass} value={filters.qualityStatus ?? ''} onChange={(event) => setField('qualityStatus', event.target.value)}>
              <option value="">Any quality</option><option value="high_quality">High quality</option>
              <option value="manual_review">Needs review</option><option value="low_quality">Low quality</option>
            </select>
          </label>
          <div className="flex flex-col gap-2">
            <label className="flex min-h-11 items-center gap-2 text-sm text-parchment">
              <input type="checkbox" checked={filters.minConfidence !== undefined} onChange={(event) => {
                const next = { ...filters }
                if (event.target.checked) next.minConfidence = confidence
                else delete next.minConfidence
                onChange(next)
              }} />
              Detection confidence
            </label>
            <label className="flex items-center gap-3 text-xs text-weathered">
              <input aria-label="Minimum detection confidence" type="range" min="0" max="100" step="5" className="min-h-11 flex-1 accent-brass" disabled={filters.minConfidence === undefined}
                value={filters.minConfidence ?? confidence} onChange={(event) => {
                  const value = Number(event.target.value)
                  setConfidence(value)
                  patch({ minConfidence: value })
                }} />
              <span className="font-mono">{filters.minConfidence ?? confidence}%+</span>
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-xs text-weathered">
            Antler points
            <select aria-label="Antler points" className={selectClass} value={filters.minPoints === 10 && filters.maxPoints === undefined ? '10+' : filters.minPoints === 8 && filters.maxPoints === 9 ? '8-9' : filters.minPoints === 6 && filters.maxPoints === 7 ? '6-7' : filters.maxPoints === 5 ? '<6' : ''} onChange={(event) => {
              const next = { ...filters }; delete next.minPoints; delete next.maxPoints
              const value = event.target.value
              if (value === '10+') next.minPoints = 10
              if (value === '8-9') { next.minPoints = 8; next.maxPoints = 9 }
              if (value === '6-7') { next.minPoints = 6; next.maxPoints = 7 }
              if (value === '<6') next.maxPoints = 5
              onChange(next)
            }}>
              <option value="">Any points</option><option value="10+">10+</option><option value="8-9">8–9</option><option value="6-7">6–7</option><option value="&lt;6">Under 6</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs text-weathered">
            Archive
            <select aria-label="Archive" className={selectClass} value={filters.isArchived === true ? 'archived' : Boolean(filters.includeArchived) ? 'all' : 'active'} onChange={(event) => {
              onChange(withArchiveState(filters, event.target.value))
            }}>
              <option value="active">Active photos</option><option value="archived">Archived photos</option><option value="all">Active and archived</option>
            </select>
          </label>
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
              {...(filters.datePreset !== undefined ? { datePreset: filters.datePreset } : {})}
              {...(filters.dateFrom !== undefined ? { dateFrom: filters.dateFrom } : {})}
              {...(filters.dateTo !== undefined ? { dateTo: filters.dateTo } : {})}
              onDateChange={({ dateFrom, dateTo, datePreset }) => {
                const next = { ...filters }
                if (datePreset !== undefined) next.datePreset = datePreset
                else delete next.datePreset
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
              selected={(filters.otherAnimals ?? [])}
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

        <div className="flex flex-row justify-end gap-2 border-t border-forest-light/40 pt-3">
          <Button size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
    </>
  )
  if (mobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="max-h-[90dvh] gap-0 overflow-y-auto rounded-t-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] [&>button]:min-h-11 [&>button]:min-w-11">
          <SheetTitle className="sr-only">Photo filters</SheetTitle>
          <SheetDescription className="sr-only">Choose a source, content, review status, or date range.</SheetDescription>
          {contents}
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[380px] max-w-[calc(100vw-1.5rem)] max-h-[min(75dvh,var(--radix-popover-content-available-height))] overflow-y-auto p-4">
        {contents}
      </PopoverContent>
    </Popover>
  )
}
