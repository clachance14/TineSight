'use client'

import { type JSX, useCallback, useMemo, useRef, useEffect, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { usePhotosInfinite } from '@/lib/hooks/use-photos'
import type { PhotoFilters } from '@/lib/services/photos'
import { Skeleton } from '@/components/ui/skeleton'

interface PhotoGridProps {
  filters?: Omit<PhotoFilters, 'offset'>
  onPhotoClick?: (photoId: string) => void
  externalData?: {
    photos: Photo[]
    total: number
    isLoading: boolean
    hasNextPage: boolean
    isFetchingNextPage: boolean
    fetchNextPage: () => void
  }
}

interface Photo {
  id: string
  thumbnailUrl: string | null
  // NOTE: full-res imageUrl is deliberately NOT part of the grid contract — the
  // grid is thumbnail-only by invariant (ADR 0003). Do not reintroduce it.
  blurDataUrl?: string | null
  detection_status: string
  bestQualityStatus: string | null
  // Authoritative photo score (gross else estimate). Surfaced as a chip only at
  // the desktop breakpoint — the mobile thumbnail grid stays clean (ADR 0003).
  best_score?: number | null
  best_score_is_estimate?: boolean
}

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
}: {
  photo: Photo
  onClick: (id: string) => void
  priority?: boolean
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
  const isProcessing =
    photo.detection_status === 'pending' || photo.detection_status === 'processing'

  return (
    <button
      type="button"
      className="group relative aspect-square w-full cursor-pointer overflow-hidden rounded-lg bg-slate ring-1 ring-inset ring-white/[0.06] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lifted active:scale-[0.97]"
      style={blurStyle}
      onClick={handleClick}
      aria-label="Open trail camera photo"
    >
      {photo.thumbnailUrl != null && photo.thumbnailUrl !== '' ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={photo.thumbnailUrl}
          alt="Trail camera photo"
          className="absolute inset-0 h-full w-full object-cover"
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
        />
      ) : (
        // No thumbnail yet (variant still generating): the blurhash background
        // shows through. We deliberately do NOT fall back to the full-res image.
        <span className="sr-only">Preview generating</span>
      )}

      {isProcessing && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-deep-forest/55 backdrop-blur-[1px]">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-brass/40 border-t-brass" />
          <span className="text-[10px] font-medium text-weathered">Analyzing…</span>
        </div>
      )}

      {/* Desktop-only score chip. Mobile thumbnails stay clean (ADR 0003). The
          "est." marker is shown when the value is the Gemini estimate, not the
          authoritative fingerprint gross — honest labeling. */}
      {!isProcessing && photo.best_score != null && (
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

export function PhotoGrid({ filters, onPhotoClick, externalData }: PhotoGridProps): JSX.Element {
  const internalQuery = usePhotosInfinite(externalData ? undefined : filters)

  const {
    data,
    isLoading,
    error,
  } = externalData
    ? {
        data: { pages: [{ photos: externalData.photos, total: externalData.total, nextCursor: null }] },
        isLoading: externalData.isLoading,
        error: null,
      }
    : internalQuery

  const photos = useMemo(() => {
    if (!data?.pages) return []
    return data.pages.flatMap((page) => page.photos)
  }, [data?.pages])

  const total = data?.pages?.[0]?.total ?? 0

  const handlePhotoClick = useCallback(
    (photoId: string) => {
      onPhotoClick?.(photoId)
    },
    [onPhotoClick]
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
  // The outer div is the scroll container. We virtualize ROWS; each row renders
  // `columns` items. Only on-screen rows live in the DOM, so DOM nodes stay
  // bounded no matter how many tens of thousands of photos are loaded.
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const roRef = useRef<ResizeObserver | null>(null)
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
    scrollRef.current = el
    roRef.current?.disconnect()
    if (el == null) {
      roRef.current = null
      return
    }
    const measure = (): void => {
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
    roRef.current = ro
  }, [])

  const rowCount = Math.ceil(photos.length / columns)

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 3,
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
  const requestedAtLengthRef = useRef(0)
  const virtualRows = rowVirtualizer.getVirtualItems()
  useEffect(() => {
    const last = virtualRows[virtualRows.length - 1]
    if (last === undefined) return
    const nearEnd = last.index >= rowCount - 2
    if (nearEnd && hasNextPage && !isFetchingNextPage && requestedAtLengthRef.current !== photos.length) {
      requestedAtLengthRef.current = photos.length
      fetchNextPage()
    }
  }, [virtualRows, rowCount, hasNextPage, isFetchingNextPage, fetchNextPage, photos.length])

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="aspect-square">
            <Skeleton className="h-full w-full rounded-lg" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-lg bg-red-900/20 px-6 py-4 text-cream-dark">
          <p className="font-semibold text-red-400">Failed to load photos</p>
          <p className="mt-1 text-sm">{error.message}</p>
        </div>
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-cream-dark">No photos yet</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={setScrollEl} className="min-h-0 flex-1 overflow-auto">
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
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {rowPhotos.map((photo, colIndex) => (
                  <PhotoGridItem
                    key={photo.id}
                    photo={photo}
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

      {total > 0 && (
        <div className="py-2 text-center text-sm text-cream-dark">
          Showing {photos.length} of {total} photos
        </div>
      )}
    </div>
  )
}
