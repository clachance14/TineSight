'use client'

import { useEffect, useRef, useCallback, useMemo, useState, memo } from 'react'
import Image from 'next/image'
// REMOVED: import { useVirtualizer } from '@tanstack/react-virtual'
// Virtualization causes iOS Safari crashes - using simple CSS grid instead
import { usePhotosInfinite } from '@/lib/hooks/use-photos'
import type { PhotoFilters } from '@/lib/services/photos'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Loader2, Check } from 'lucide-react'
import { usePhotoSelectionStore } from '@/lib/stores/photo-selection'
import { SmartBadge } from './smart-badge'

// Mobile breakpoint (matches Tailwind's md:)
const MOBILE_BREAKPOINT = 768

// Helper function for responsive gap calculation
const getGapClass = (columns: number, isMobile: boolean) => {
  if (!isMobile) return 'gap-4'  // Desktop: 16px
  if (columns >= 6) return 'gap-1'  // Mobile 6-7 cols: 4px
  if (columns >= 5) return 'gap-1.5'  // Mobile 5 cols: 6px
  return 'gap-2'  // Mobile 4 cols: 8px
}

interface PhotoGridProps {
  filters?: Omit<PhotoFilters, 'offset'>
  onPhotoClick?: (photoId: string) => void
  // Optional: receive data from parent to share single data source
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

// Memoized individual photo card component
const PhotoGridItem = memo(function PhotoGridItem({
  photo,
  onClick,
  priority = false,
  columns,
}: {
  photo: Photo
  onClick: (id: string) => void
  priority?: boolean // Load above-fold images with higher priority
  columns: number
}) {
  // Use separate selectors for better memoization
  const isSelectMode = usePhotoSelectionStore((state) => state.isSelectMode)
  const selected = usePhotoSelectionStore((state) => state.selectedPhotoIds.has(photo.id))
  const togglePhotoSelection = usePhotoSelectionStore((state) => state.togglePhotoSelection)

  const handleClick = useCallback(() => {
    // If in select mode, toggle selection instead of navigating
    if (isSelectMode) {
      togglePhotoSelection(photo.id)
      return
    }
    onClick(photo.id)
  }, [isSelectMode, togglePhotoSelection, photo.id, onClick])

  const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    togglePhotoSelection(photo.id) // This auto-enters select mode
  }, [togglePhotoSelection, photo.id])

  return (
    <div
      className={cn(
        'group relative aspect-square cursor-pointer overflow-hidden bg-slate',
        columns >= 6 ? 'rounded-md' : 'rounded-lg',  // Adaptive border radius
        'active:scale-[0.97] transition-transform duration-100',  // Touch feedback
        !isSelectMode && 'hover:ring-2 hover:ring-copper',
        selected && 'ring-2 ring-copper'
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
            // Blur placeholders disabled - causes iOS Safari crash (next.js #34455)
          />
        ) : photo.imageUrl ? (
          <Image
            src={photo.imageUrl}
            alt="Trail camera photo"
            fill
            priority={priority}
            className="object-cover"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
            // Blur placeholders disabled - causes iOS Safari crash (next.js #34455)
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

        {/* Checkbox overlay - visible on hover or in select mode, hidden on mobile */}
        <div
          className={cn(
            'absolute top-2 left-2 z-10',
            'hidden md:block',  // Hide on mobile
            'transition-opacity duration-150',
            isSelectMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
        >
          <button
            type="button"
            onClick={handleCheckboxClick}
            className={cn(
              'w-6 h-6 rounded border-2 flex items-center justify-center',
              'transition-colors duration-150',
              selected
                ? 'bg-copper border-copper text-slate-deep'
                : 'bg-slate-deep/80 border-cream/50 hover:border-cream'
            )}
          >
            {selected && <Check className="w-4 h-4" />}
          </button>
        </div>

        {/* Selection overlay - hidden on mobile */}
        {selected && (
          <div className="absolute inset-0 bg-copper/10 pointer-events-none hidden md:block" />
        )}

        {/* Status badge overlay - only show for non-completed status */}
        {photo.detection_status !== 'completed' && (
          <div className="absolute right-2 top-2">
            <SmartBadge
              status={photo.detection_status}
              iconOnly={columns >= 5}
            />
          </div>
        )}

        {/* Quality status badge - hidden on mobile, tap to reveal */}
        {photo.bestQualityStatus && photo.bestQualityStatus !== 'pending' && (
          <div className={cn(
            "absolute bottom-2 right-2",
            "md:opacity-100",
            "opacity-0 group-hover:opacity-100 transition-opacity"
          )}>
            <Badge
              variant={
                photo.bestQualityStatus === 'high_quality'
                  ? 'success'
                  : photo.bestQualityStatus === 'low_quality'
                  ? 'destructive'
                  : 'secondary'
              }
            >
              {photo.bestQualityStatus === 'high_quality'
                ? 'High'
                : photo.bestQualityStatus === 'low_quality'
                ? 'Low'
                : 'Review'}
            </Badge>
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-deep/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 pointer-events-none" />
      </div>
    </div>
  )
})

/**
 * PhotoGrid component displays a responsive grid of photos
 * with infinite scroll, status badges, and loading states.
 *
 * NOTE: Virtualization removed due to iOS Safari crashes.
 * Using simple CSS grid with scroll-based infinite loading instead.
 */
export function PhotoGrid({ filters, onPhotoClick, externalData }: PhotoGridProps) {
  // Use external data if provided (single source of truth), otherwise fetch internally
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

  // Calculate initial columns based on screen width
  const getColumnsForWidth = useCallback((width: number, mobile: boolean): number => {
    if (mobile) return 5 // Fixed 5 columns on mobile
    if (width < 1024) return 3
    if (width < 1280) return 4
    return 5
  }, [])

  // Initialize columns synchronously to avoid flicker
  const [columns, setColumns] = useState(() => {
    if (typeof window === 'undefined') return 5
    const width = window.innerWidth
    const mobile = width < MOBILE_BREAKPOINT
    return getColumnsForWidth(width, mobile)
  })

  // Track if we're on mobile and calculate columns
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

  // Flatten all pages into a single array of photos
  const photos = useMemo(() => {
    if (!data?.pages) return []
    return data.pages.flatMap((page) => page.photos)
  }, [data?.pages])

  // Get total count from first page
  const total = data?.pages?.[0]?.total ?? 0

  // Handle photo click
  const handlePhotoClick = useCallback(
    (photoId: string) => {
      if (onPhotoClick) {
        onPhotoClick(photoId)
      }
    },
    [onPhotoClick]
  )

  // Scroll-based infinite loading (without virtualization)
  useEffect(() => {
    const scrollElement = scrollContainerRef.current
    if (!scrollElement) return

    const checkShouldLoadMore = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement
      // Load more when within 500px of bottom
      if (scrollHeight - scrollTop - clientHeight < 500 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    }

    scrollElement.addEventListener('scroll', checkShouldLoadMore, { passive: true })

    // Check once after mount
    const rafId = requestAnimationFrame(checkShouldLoadMore)

    return () => {
      scrollElement.removeEventListener('scroll', checkShouldLoadMore)
      cancelAnimationFrame(rafId)
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Loading skeleton
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

  // Error state
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

  // Empty state
  if (photos.length === 0) {
    const hasFilters = filters && (
      filters.status !== undefined ||
      filters.cameraId !== undefined ||
      filters.hasDeer !== undefined ||
      filters.minConfidence !== undefined ||
      filters.qualityStatus !== undefined ||
      filters.batchId !== undefined
    )

    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-lg bg-slate/50 px-8 py-6">
          <svg
            className="mx-auto h-12 w-12 text-cream-dark/50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {hasFilters ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            )}
          </svg>
          <h3 className="mt-4 text-lg font-medium text-cream">
            {hasFilters ? 'No photos match your filters' : 'No photos yet'}
          </h3>
          <p className="mt-2 text-sm text-cream-dark">
            {hasFilters ? (
              <>
                Try adjusting your filters or removing some to see more results.
                <br />
                You can clear all filters to view your entire photo collection.
              </>
            ) : (
              'Upload your first batch of trail camera photos to get started.'
            )}
          </p>
        </div>
      </div>
    )
  }

  // Simple CSS grid - NO virtualization (causes iOS Safari crash)
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Scroll container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-auto"
        style={{
          // CSS containment for performance (but not the problematic virtualization)
          contain: 'layout',
        }}
      >
        {/* Simple CSS grid */}
        <div
          className={cn("grid", getGapClass(columns, isMobile))}
          style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
        >
          {photos.map((photo, index) => (
            <PhotoGridItem
              key={photo.id}
              photo={photo}
              onClick={handlePhotoClick}
              priority={index < columns * 2} // First 2 rows get priority
              columns={columns}
            />
          ))}
        </div>

        {/* Loading more indicator */}
        {isFetchingNextPage && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-copper" />
          </div>
        )}
      </div>

      {/* Total count info */}
      {total > 0 && (
        <div className="text-center text-sm text-cream-dark py-2">
          Showing {photos.length} of {total} photos
        </div>
      )}
    </div>
  )
}
