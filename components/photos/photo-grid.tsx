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
  imageUrl: string | null
  blurDataUrl?: string | null
  detection_status: string
  bestQualityStatus: string | null
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

  return (
    <button
      type="button"
      className="group relative aspect-square w-full cursor-pointer overflow-hidden rounded-lg bg-slate transition-transform duration-100 active:scale-[0.97]"
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

  const hasNextPage = externalData?.hasNextPage ?? internalQuery.hasNextPage
  const isFetchingNextPage = externalData?.isFetchingNextPage ?? internalQuery.isFetchingNextPage
  const fetchNextPage = useCallback(() => {
    if (externalData?.fetchNextPage) {
      externalData.fetchNextPage()
    } else {
      void internalQuery.fetchNextPage()
    }
  }, [externalData, internalQuery])

  // --- Virtualization ---------------------------------------------------------
  // The outer div is the scroll container. We virtualize ROWS; each row renders
  // `columns` items. Only on-screen rows live in the DOM, so DOM nodes stay
  // bounded no matter how many tens of thousands of photos are loaded.
  const scrollRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(2)
  const [rowHeight, setRowHeight] = useState(180)

  // Measure container width -> column count + square row height.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = (): void => {
      const width = el.clientWidth
      if (width <= 0) return
      const cols = columnsForWidth(width)
      const itemSize = (width - GAP_PX * (cols - 1)) / cols
      setColumns(cols)
      setRowHeight(itemSize + GAP_PX)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
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
  const virtualRows = rowVirtualizer.getVirtualItems()
  useEffect(() => {
    const last = virtualRows[virtualRows.length - 1]
    if (!last) return
    if (last.index >= rowCount - 2 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [virtualRows, rowCount, hasNextPage, isFetchingNextPage, fetchNextPage])

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
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
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
                  height: `${rowHeight}px`,
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
