'use client'

import { useEffect, useRef, useCallback, useMemo, useState, memo } from 'react'
import Image from 'next/image'
import { useVirtualizer } from '@tanstack/react-virtual'
import { usePhotosInfinite } from '@/lib/hooks/use-photos'
import type { PhotoFilters } from '@/lib/services/photos'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

// Constants for virtualization
const ROW_HEIGHT = 200 // px - approximate height for aspect-square cards
const GAP = 16 // gap-4 = 1rem = 16px

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
  detection_status: string
  bestQualityStatus: string | null
}

// Memoized individual photo card component
const PhotoGridItem = memo(function PhotoGridItem({
  photo,
  onClick,
  priority = false,
}: {
  photo: Photo
  onClick: (id: string) => void
  priority?: boolean // Load above-fold images with higher priority
}) {
  // Status badge variant mapping
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'pending':
        return 'secondary'
      case 'processing':
        return 'processing'
      case 'completed':
        return 'success'
      case 'failed':
        return 'destructive'
      default:
        return 'outline'
    }
  }

  const formatStatus = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1)
  }

  return (
    <div
      className={cn(
        'group relative aspect-square cursor-pointer overflow-hidden rounded-lg bg-slate',
        'transition-all duration-200 hover:ring-2 hover:ring-copper'
      )}
      onClick={() => onClick(photo.id)}
    >
      <div className="relative h-full w-full">
        {photo.thumbnailUrl ? (
          <Image
            src={photo.thumbnailUrl}
            alt="Trail camera photo"
            fill
            priority={priority}
            className="object-cover transition-transform duration-200 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
            {...(!priority && {
              placeholder: "blur" as const,
              blurDataURL: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAoDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAMH/8QAIhAAAQMDBQEBAAAAAAAAAAAAAQIDBAAFEQYHEiExQVH/xAAVAQEBAAAAAAAAAAAAAAAAAAAAA//EABkRAAIDAQAAAAAAAAAAAAAAAAEhAAIDEf/aAAwDAQACEQMRAD8AqNr9O2+1Wi4Pzo0cREfbeKnFAFKPLkrOc4/apFN7f6JaSBpdgAD8AY/qUphsKmMxg7JP/9k=",
            })}
          />
        ) : photo.imageUrl ? (
          <Image
            src={photo.imageUrl}
            alt="Trail camera photo"
            fill
            priority={priority}
            className="object-cover transition-transform duration-200 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
            {...(!priority && {
              placeholder: "blur" as const,
              blurDataURL: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAoDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAMH/8QAIhAAAQMDBQEBAAAAAAAAAAAAAQIDBAAFEQYHEiExQVH/xAAVAQEBAAAAAAAAAAAAAAAAAAAAA//EABkRAAIDAQAAAAAAAAAAAAAAAAEhAAIDEf/aAAwDAQACEQMRAD8AqNr9O2+1Wi4Pzo0cREfbeKnFAFKPLkrOc4/apFN7f6JaSBpdgAD8AY/qUphsKmMxg7JP/9k=",
            })}
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

        {/* Status badge overlay */}
        <div className="absolute right-2 top-2">
          <Badge variant={getStatusBadgeVariant(photo.detection_status)}>
            {formatStatus(photo.detection_status)}
          </Badge>
        </div>

        {/* Quality status badge (if present) */}
        {photo.bestQualityStatus && photo.bestQualityStatus !== 'pending' && (
          <div className="absolute bottom-2 right-2">
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
        <div className="absolute inset-0 bg-gradient-to-t from-slate-deep/60 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      </div>
    </div>
  )
})

/**
 * PhotoGrid component displays a virtualized responsive grid of photos
 * with infinite scroll, status badges, and loading states.
 * Uses @tanstack/react-virtual for performance with large datasets.
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

  const parentRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(5)

  // Calculate columns based on viewport width (matching grid breakpoints)
  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth
      if (width < 640) setColumns(2)       // grid-cols-2
      else if (width < 1024) setColumns(3) // sm:grid-cols-3
      else if (width < 1280) setColumns(4) // lg:grid-cols-4
      else setColumns(5)                   // xl:grid-cols-5
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

  // Calculate row count for virtualization
  const rowCount = Math.ceil(photos.length / columns)

  // Virtualizer for rows
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT + GAP,
    overscan: 3, // Render 3 extra rows above/below viewport
  })

  // Handle photo click
  const handlePhotoClick = useCallback(
    (photoId: string) => {
      if (onPhotoClick) {
        onPhotoClick(photoId)
      }
    },
    [onPhotoClick]
  )

  // Check if we're near the bottom to trigger infinite scroll
  useEffect(() => {
    const scrollElement = parentRef.current
    if (!scrollElement) return

    const checkShouldLoadMore = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement
      // Load more when within 500px of bottom
      if (scrollHeight - scrollTop - clientHeight < 500 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    }

    scrollElement.addEventListener('scroll', checkShouldLoadMore, { passive: true })

    // Check after layout completes - use RAF to ensure dimensions are calculated
    const rafId = requestAnimationFrame(() => {
      checkShouldLoadMore()
    })

    return () => {
      scrollElement.removeEventListener('scroll', checkShouldLoadMore)
      cancelAnimationFrame(rafId)
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Re-check when photos array changes (initial load or new data)
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return
    const scrollElement = parentRef.current
    if (!scrollElement) return

    // Small delay to let virtualized content render
    const timeoutId = setTimeout(() => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement
      if (scrollHeight - scrollTop - clientHeight < 500) {
        fetchNextPage()
      }
    }, 100)

    return () => clearTimeout(timeoutId)
  }, [photos.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="aspect-square">
            <Skeleton className="h-full w-full" />
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
    // Check if any filters are applied
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
              // Filter icon for filtered empty state
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            ) : (
              // Image icon for no photos uploaded
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

  // Virtualized photo grid
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Virtualized scroll container */}
      <div
        ref={parentRef}
        className="flex-1 min-h-0 overflow-auto"
        style={{ contain: 'strict' }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const startIndex = virtualRow.index * columns
            const rowPhotos = photos.slice(startIndex, startIndex + columns)
            // First 2 rows get priority loading for above-fold images
            const isAboveFold = virtualRow.index < 2

            return (
              <div
                key={virtualRow.key}
                className="absolute left-0 top-0 w-full"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div
                  className="grid gap-4"
                  style={{
                    gridTemplateColumns: `repeat(${columns}, 1fr)`,
                    height: `${ROW_HEIGHT}px`,
                  }}
                >
                  {rowPhotos.map((photo) => (
                    <PhotoGridItem
                      key={photo.id}
                      photo={photo}
                      onClick={handlePhotoClick}
                      priority={isAboveFold}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Loading more indicator */}
      {isFetchingNextPage && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-copper" />
        </div>
      )}

      {/* Total count info */}
      {total > 0 && (
        <div className="text-center text-sm text-cream-dark">
          Showing {photos.length} of {total} photos
        </div>
      )}
    </div>
  )
}
