'use client'

import { type JSX, useCallback, useMemo, useRef, useEffect, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { usePhotosInfinite } from '@/lib/hooks/use-photos'
import type { PhotoFilters, VariantStatus } from '@/lib/services/photos'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PageState } from '@/components/layout/page-state'
import { Skeleton } from '@/components/ui/skeleton'
import { usePhotoSelectionStore } from '@/lib/stores/photo-selection'

interface PhotoGridProps {
  waitingForUpload?: boolean
  pendingPhotoCount?: number
  filters?: Omit<PhotoFilters, 'offset'>
  onPhotoClick?: (photoId: string) => void
  externalData?: {
    photos: Photo[]
    total: number
    isLoading: boolean
    error?: Error | null
    retry?: () => void
    hasNextPage: boolean
    isFetchingNextPage: boolean
    fetchNextPage: () => void
  }
}

interface Photo {
  original_filename?: string | null
  captured_at?: string | null
  id: string
  thumbnailUrl: string | null
  // NOTE: full-res imageUrl is deliberately NOT part of the grid contract — the
  // grid is thumbnail-only by invariant (ADR 0003). Do not reintroduce it.
  blurDataUrl?: string | null
  detection_status: string
  // Variants lag analysis, so this is what decides whether there is a preview to
  // paint — a photo can be fully analyzed and still have no thumbnail.
  variant_status?: VariantStatus | null
  bestQualityStatus: string | null
  // Authoritative photo score (gross else estimate). Surfaced as a chip only at
  // the desktop breakpoint — the mobile thumbnail grid stays clean (ADR 0003).
  best_score?: number | null
  best_score_is_estimate?: boolean
}

let returnPosition: { key: string; top: number } | null = null

const GAP_PX = 6 // tailwind gap-1.5

/**
 * Responsive column count, mobile-first. Mirrors the old CSS breakpoints
 * (2 / 3 / 4 / 5) but as a number so the virtualizer can lay out rows.
 */
function columnsForWidth(width: number): number {
  if (width < 640) return 2
  if (width < 768) return 3
  if (width < 1024) return 4
  return 5
}

// Note: memo() intentionally omitted - previously implicated in an iOS Safari
// JavaScriptCore crash. With thumbnails + virtualization the render cost is low.
function PhotoGridItem({
  photo,
  onClick,
  priority = false,
  selecting = false,
  selected = false,
  position,
}: {
  photo: Photo
  position: number
  onClick: (id: string) => void
  priority?: boolean
  selecting?: boolean
  selected?: boolean
}): JSX.Element {
  const handleClick = useCallback(() => {
    onClick(photo.id)
  }, [photo.id, onClick])

  // Thumbnail ONLY. We never load the full-resolution original into the grid —
  // decoding dozens of multi-MB images is what crashed iOS Safari (see ADR 0003).
  // blurDataUrl is the placeholder until the (tiny) thumbnail paints.
  const blurStyle = photo.blurDataUrl != null && photo.blurDataUrl !== ''
    ? {
        backgroundImage: `url(${photo.blurDataUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : undefined

  // Data-backed processing state: while a photo is still being analyzed it carries
  // no detection signal, so we dim it and show an "Analyzing…" affordance instead
  // of presenting it as a finished, empty frame.
  const isAnalyzing =
    photo.detection_status === 'pending' || photo.detection_status === 'processing'

  const hasThumbnail = photo.thumbnailUrl != null && photo.thumbnailUrl !== ''

  // A photo with no thumbnail renders nothing at all — the grid is thumbnail-only by
  // invariant (ADR 0003), so there is no fallback image to show. Without an affordance
  // that is a silent blank square with no explanation, which is exactly what a stalled
  // variant backlog looked like in the field (an account with 89% of its photos at
  // variant_status='pending' showed thousands of empty tiles).
  //
  // Key this on the ABSENCE OF A PREVIEW rather than on either pipeline's status:
  // variants lag analysis, so a photo can be fully analyzed and still have nothing to
  // paint. A failed variant is called out separately — a spinner that never resolves
  // would be a lie.
  const variantFailed = photo.variant_status === 'failed'
  const showPendingOverlay = !hasThumbnail || isAnalyzing
  const pendingLabel = isAnalyzing
    ? 'Analyzing…'
    : variantFailed
      ? 'No preview'
      : 'Preparing…'

  return (
    <button
      type="button"
      className="group relative aspect-square w-full cursor-pointer overflow-hidden rounded-lg bg-slate ring-1 ring-inset ring-white/[0.06] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lifted active:scale-[0.97]"
      style={blurStyle}
      onClick={handleClick}
      aria-label={`${selecting ? 'Select' : 'Open'} ${photo.original_filename ?? `photo ${position}`}${(photo.captured_at !== null && photo.captured_at !== undefined && photo.captured_at !== '') ? `, captured ${new Date(photo.captured_at).toLocaleString()}` : ''}`}
      aria-pressed={selecting ? selected : undefined}
    >
      {selecting && <span className={`absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded border-2 ${selected ? 'border-brass bg-brass text-deep-forest' : 'border-parchment bg-deep-forest/70'}`}>{selected ? '✓' : ''}</span>}
      {/* No thumbnail yet (variant still generating or failed): the blurhash
          background shows through and the overlay below states why. We
          deliberately do NOT fall back to the full-res image (ADR 0003). */}
      {hasThumbnail && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={photo.thumbnailUrl ?? ''}
          alt="Trail camera photo"
          className="absolute inset-0 h-full w-full object-cover"
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
        />
      )}

      {showPendingOverlay && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-deep-forest/55 backdrop-blur-[1px]">
          {variantFailed && !isAnalyzing ? (
            // Terminal state — a spinner here would imply work still in flight.
            <div className="h-5 w-5 rounded-full border-2 border-weathered/40" />
          ) : (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-brass/40 border-t-brass" />
          )}
          <span className="text-[10px] font-medium text-weathered">{pendingLabel}</span>
        </div>
      )}

      {/* Desktop-only score chip. Mobile thumbnails stay clean (ADR 0003). The
          "est." marker is shown when the value is the Gemini estimate, not the
          authoritative fingerprint gross — honest labeling. */}
      {!showPendingOverlay && photo.best_score != null && (
        <span className="absolute left-1.5 top-1.5 z-10 hidden items-center gap-1 rounded-md bg-deep-forest/80 px-1.5 py-0.5 backdrop-blur-[1px] md:inline-flex">
          <span className="font-mono text-[12px] font-semibold leading-none tabular-nums text-score-gold">
            {photo.best_score}
          </span>
          {photo.best_score_is_estimate === true ? (
            <span className="text-[9px] font-medium uppercase leading-none text-weathered">est</span>
          ) : null}
        </span>
      )}
    </button>
  )
}

export function PhotoGrid({ filters, onPhotoClick, externalData, waitingForUpload = false, pendingPhotoCount = 12 }: PhotoGridProps): JSX.Element {
  const selecting = usePhotoSelectionStore(state => state.isSelectMode)
  const selected = usePhotoSelectionStore(state => state.selectedPhotoIds)
  const toggleSelection = usePhotoSelectionStore(state => state.togglePhotoSelection)
  const internalQuery = usePhotosInfinite(filters, { enabled: !externalData })

  const {
    data,
    isLoading,
    error,
  } = externalData
    ? {
        data: { pages: [{ photos: externalData.photos, total: externalData.total, nextCursor: null }] },
        isLoading: externalData.isLoading,
        error: externalData.error ?? null,
      }
    : internalQuery

  const photos = useMemo(() => {
    if (!data?.pages) return []
    return data.pages.flatMap<Photo>((page) => page.photos)
  }, [data?.pages])

  const total = data?.pages?.[0]?.total ?? 0

  const handlePhotoClick = useCallback(
    (photoId: string) => {
      if (selecting) toggleSelection(photoId)
      else {
        returnPosition = { key: JSON.stringify(filters ?? {}), top: scrollRef.current?.scrollTop ?? 0 }
        onPhotoClick?.(photoId)
      }
    },
    [onPhotoClick, selecting, toggleSelection, filters]
  )

  const hasNextPage = externalData?.hasNextPage ?? internalQuery.hasNextPage ?? false
  const isFetchingNextPage = externalData?.isFetchingNextPage ?? internalQuery.isFetchingNextPage ?? false
  // Depend on the (stable) function identities, not the externalData object which
  // the parent recreates every render — otherwise this callback churns and the
  // infinite-scroll effect re-runs on every render.
  const externalFetchNextPage = externalData?.fetchNextPage
  const internalFetchNextPage = internalQuery.fetchNextPage
  const fetchNextPage = useCallback(() => {
    if (externalFetchNextPage != null) {
      externalFetchNextPage()
    } else {
      void internalFetchNextPage()
    }
  }, [externalFetchNextPage, internalFetchNextPage])

  // --- Virtualization ---------------------------------------------------------
  // The dashboard main owns page scrolling. We virtualize ROWS; each row renders
  // `columns` items. Only on-screen rows live in the DOM, so DOM nodes stay
  // bounded no matter how many tens of thousands of photos are loaded.
  const scrollRef = useRef<HTMLElement | null>(null)
  const roRef = useRef<ResizeObserver | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  const [columns, setColumns] = useState(2)
  // itemSize = the square tile edge. rowHeight = itemSize + gap = the vertical
  // step the virtualizer advances per row (so there's a real gap between rows).
  const [itemSize, setItemSize] = useState(180)
  const [rowHeight, setRowHeight] = useState(180 + GAP_PX)

  // Measure container width -> column count + square tile size, via a CALLBACK
  // REF (not useLayoutEffect + useRef). The loading / empty / error states below
  // early-return without rendering the scroll container, so on first render the
  // ref is null; an empty-dep effect runs once against that null and never
  // re-runs when the real grid mounts. That left columns pinned at 2 and
  // rowHeight at 180 on desktop, so 565px tiles were stepped only 180px apart —
  // rows overlapped ~385px and buried the bottom (where the deer are). A
  // callback ref fires exactly when the node attaches, so width is always real.
  const setScrollEl = useCallback((el: HTMLDivElement | null) => {
    scrollRef.current = el?.closest('main') ?? null
    roRef.current?.disconnect()
    if (el == null) {
      roRef.current = null
      return
    }
    const measure = (): void => {
      const scroller = scrollRef.current
      if (scroller !== null) {
        setScrollMargin(el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop)
      }
      const width = el.clientWidth
      if (width <= 0) return
      const cols = columnsForWidth(width)
      const size = (width - GAP_PX * (cols - 1)) / cols
      setColumns(cols)
      setItemSize(size)
      setRowHeight(size + GAP_PX)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    // Filters, bulk selection and responsive wrapping can move the grid start.
    const toolbar = el.closest('main')?.querySelector('[data-photo-toolbar]')
    if (toolbar) ro.observe(toolbar)
    if (scrollRef.current) ro.observe(scrollRef.current)
    roRef.current = ro
  }, [])

  const rowCount = Math.ceil(photos.length / columns)

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 3,
    scrollMargin,
    initialOffset: returnPosition?.key === JSON.stringify(filters ?? {}) ? returnPosition.top : 0,
  })

  // Re-measure rows when layout (column count / row height) changes.
  useEffect(() => {
    rowVirtualizer.measure()
  }, [rowHeight, columns, rowVirtualizer])

  // Infinite scroll, driven by the virtualizer's own range (no IntersectionObserver,
  // no observer-root mismatch, no per-render observer churn). When the last
  // rendered row is within 2 rows of the end, pull the next page.
  //
  // Latch keyed on the loaded count: fire at most once per distinct loaded length,
  // so we never chain-fetch multiple pages while one is in flight or re-fire on
  // effect churn. The latch resets naturally when the new page changes the length.
  const requestedKeyRef = useRef('')
  const filterKey = JSON.stringify(filters ?? {})
  const previousFilterRef = useRef(filterKey)
  useEffect(() => {
    requestedKeyRef.current = ''
    if (previousFilterRef.current !== filterKey) {
      returnPosition = null
      scrollRef.current?.scrollTo({ top: 0 })
      previousFilterRef.current = filterKey
    }
  }, [filterKey])
  useEffect(() => {
    const clear = (): void => { returnPosition = null }
    window.addEventListener('tinesight:account-changed', clear)
    return () => window.removeEventListener('tinesight:account-changed', clear)
  }, [])
  const pageKey = `${filterKey}:${photos.length}:${photos.at(-1)?.id ?? ''}`
  const virtualRows = rowVirtualizer.getVirtualItems()
  useEffect(() => {
    const last = virtualRows[virtualRows.length - 1]
    if (last === undefined) return
    const nearEnd = last.index >= rowCount - 2
    if (nearEnd && hasNextPage && !isFetchingNextPage && !error && requestedKeyRef.current !== pageKey) {
      requestedKeyRef.current = pageKey
      fetchNextPage()
    }
  }, [virtualRows, rowCount, hasNextPage, isFetchingNextPage, fetchNextPage, pageKey, error])

  if (isLoading || (waitingForUpload && photos.length === 0 && !error)) {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className="min-h-0 flex-1">
        <p className="mb-3 text-sm text-weathered">{waitingForUpload ? 'Preparing your photos. They’ll appear here as they become ready.' : 'Loading photos…'}</p>
        <div aria-hidden="true" className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: waitingForUpload ? Math.min(12, Math.max(1, pendingPhotoCount)) : 12 }).map((_, i) => (
          <div key={i} className="relative aspect-square" data-photo-skeleton>
            <Skeleton className="h-full w-full rounded-lg" />
            {waitingForUpload && <div className="absolute inset-0 flex items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-brass/40 border-t-brass motion-reduce:animate-none" /></div>}
          </div>
        ))}
        </div>
      </div>
    )
  }

  if (error && photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-lg bg-red-900/20 px-6 py-4 text-cream-dark">
          <p className="font-semibold text-red-400">Failed to load photos</p>
          <p className="mt-1 text-sm">{error.message}</p>
          <button type="button" className="mt-3 min-h-11 rounded border px-4" onClick={() => { void (externalData?.retry ?? internalQuery.refetch)() }}>Try again</button>
        </div>
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div className="py-4"><PageState title="No photos in this view." description="Try all photos to see your full library, or add your latest camera pull."><Button asChild variant="outline" className="min-h-11"><Link href="/photos?triageView=all">View all photos</Link></Button><Button asChild className="min-h-11"><Link href="/upload">Upload photos</Link></Button></PageState></div>
    )
  }

  return (
    <div className="min-w-0">
      <div ref={setScrollEl} data-photo-grid>
        <div
          className="relative w-full"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {virtualRows.map((virtualRow) => {
            const startIndex = virtualRow.index * columns
            const rowPhotos = photos.slice(startIndex, startIndex + columns)
            return (
              <div
                key={virtualRow.key}
                className="absolute left-0 top-0 grid w-full gap-1.5"
                style={{
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  height: `${itemSize}px`,
                  transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                }}
              >
                {rowPhotos.map((photo, colIndex) => (
                  <PhotoGridItem
                    position={startIndex + colIndex + 1}
                    key={photo.id}
                    photo={photo}
                    selecting={selecting}
                    selected={selected.has(photo.id)}
                    onClick={handlePhotoClick}
                    priority={virtualRow.index === 0 && colIndex < columns}
                  />
                ))}
              </div>
            )
          })}
        </div>

        {isFetchingNextPage && (
          <div className="flex justify-center py-4">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" />
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="py-3 text-center text-cream-dark">
          <p>Could not load more photos. Your current photos are still here.</p>
          <button type="button" className="mt-2 min-h-11 rounded border px-4" onClick={() => {
            requestedKeyRef.current = ''
            if (hasNextPage) fetchNextPage()
            else void (externalData?.retry ?? internalQuery.refetch)()
          }}>Try again</button>
        </div>
      )}

      {total > 0 && (
        <div className="py-2 text-center text-sm text-cream-dark">
          Showing {photos.length} of {total} photos
        </div>
      )}
    </div>
  )
}
