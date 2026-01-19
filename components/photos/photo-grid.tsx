'use client'

import { useEffect, useRef, useCallback, useMemo, useState, memo } from 'react'
import Image from 'next/image'
import { usePhotosInfinite } from '@/lib/hooks/use-photos'
import type { PhotoFilters } from '@/lib/services/photos'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

// iOS Safari crash investigation:
// REMOVED: usePhotoSelectionStore - suspected cause of crash (45 subscriptions for 15 items)
// REMOVED: SmartBadge, Badge components
// REMOVED: Selection overlay and checkbox

// Mobile breakpoint (matches Tailwind's md:)
const MOBILE_BREAKPOINT = 768

// Helper function for responsive gap calculation
const getGapClass = (columns: number, isMobile: boolean) => {
  if (!isMobile) return 'gap-4'
  if (columns >= 6) return 'gap-1'
  if (columns >= 5) return 'gap-1.5'
  return 'gap-2'
}

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

// SIMPLIFIED: No Zustand store, no selection logic
const PhotoGridItem = memo(function PhotoGridItem({
  photo,
  onClick,
  priority = false,
  columns,
}: {
  photo: Photo
  onClick: (id: string) => void
  priority?: boolean
  columns: number
}) {
  const handleClick = useCallback(() => {
    onClick(photo.id)
  }, [photo.id, onClick])

  return (
    <div
      className={cn(
        'group relative aspect-square cursor-pointer overflow-hidden bg-slate',
        columns >= 6 ? 'rounded-md' : 'rounded-lg',
        'active:scale-[0.97] transition-transform duration-100',
        'hover:ring-2 hover:ring-copper'
      )}
      onClick={handleClick}
    >
      <div className="relative h-full w-full">
        {photo.thumbnailUrl ? (
          <Image
            src={photo.thumbnailUrl}
            alt="Trail camera photo"
            fill
            priority={priority}
            className="object-cover"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
          />
        ) : photo.imageUrl ? (
          <Image
            src={photo.imageUrl}
            alt="Trail camera photo"
            fill
            priority={priority}
            className="object-cover"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-slate-700">
            <svg
              className="h-8 w-8 text-cream-dark/30"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}

        {/* Hover overlay only - no selection, no badges */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-deep/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 pointer-events-none" />
      </div>
    </div>
  )
})

export function PhotoGrid({ filters, onPhotoClick, externalData }: PhotoGridProps) {
  const internalQuery = usePhotosInfinite(externalData ? undefined : filters)

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = externalData
    ? {
        data: { pages: [{ photos: externalData.photos, total: externalData.total, nextCursor: null }] },
        isLoading: externalData.isLoading,
        error: null,
        fetchNextPage: externalData.fetchNextPage,
        hasNextPage: externalData.hasNextPage,
        isFetchingNextPage: externalData.isFetchingNextPage,
      }
    : internalQuery

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isMobile, setIsMobile] = useState(false)

  const getColumnsForWidth = useCallback((width: number, mobile: boolean): number => {
    if (mobile) return 5
    if (width < 1024) return 3
    if (width < 1280) return 4
    return 5
  }, [])

  const [columns, setColumns] = useState(() => {
    if (typeof window === 'undefined') return 5
    const width = window.innerWidth
    const mobile = width < MOBILE_BREAKPOINT
    return getColumnsForWidth(width, mobile)
  })

  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth
      const mobile = width < MOBILE_BREAKPOINT
      setIsMobile(mobile)

      if (mobile) {
        setColumns(5)
      } else {
        if (width < 1024) setColumns(3)
        else if (width < 1280) setColumns(4)
        else setColumns(5)
      }
    }
    updateColumns()
    window.addEventListener('resize', updateColumns)
    return () => window.removeEventListener('resize', updateColumns)
  }, [])

  const photos = useMemo(() => {
    if (!data?.pages) return []
    return data.pages.flatMap((page) => page.photos)
  }, [data?.pages])

  const total = data?.pages?.[0]?.total ?? 0

  const handlePhotoClick = useCallback(
    (photoId: string) => {
      if (onPhotoClick) {
        onPhotoClick(photoId)
      }
    },
    [onPhotoClick]
  )

  // Scroll-based infinite loading
  useEffect(() => {
    const scrollElement = scrollContainerRef.current
    if (!scrollElement) return

    const checkShouldLoadMore = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement
      if (scrollHeight - scrollTop - clientHeight < 500 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    }

    scrollElement.addEventListener('scroll', checkShouldLoadMore, { passive: true })
    const rafId = requestAnimationFrame(checkShouldLoadMore)

    return () => {
      scrollElement.removeEventListener('scroll', checkShouldLoadMore)
      cancelAnimationFrame(rafId)
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (isLoading) {
    return (
      <div
        className={cn("grid", getGapClass(columns, isMobile))}
        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      >
        {Array.from({ length: columns * 2 }).map((_, i) => (
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
        <div className="rounded-lg bg-slate/50 px-8 py-6">
          <svg
            className="mx-auto h-12 w-12 text-cream-dark/50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-cream">No photos yet</h3>
          <p className="mt-2 text-sm text-cream-dark">
            Upload your first batch of trail camera photos to get started.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-auto"
      >
        <div
          className={cn("grid", getGapClass(columns, isMobile))}
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {photos.map((photo, index) => (
            <PhotoGridItem
              key={photo.id}
              photo={photo}
              onClick={handlePhotoClick}
              priority={index < columns * 2}
              columns={columns}
            />
          ))}
        </div>

        {isFetchingNextPage && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-copper" />
          </div>
        )}
      </div>

      {total > 0 && (
        <div className="text-center text-sm text-cream-dark py-2">
          Showing {photos.length} of {total} photos
        </div>
      )}
    </div>
  )
}
