'use client'

import { useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { usePhotos } from '@/lib/hooks/use-photos'
import type { PhotoFilters } from '@/lib/services/photos'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface PhotoGridProps {
  filters?: PhotoFilters
  onPhotoClick?: (photoId: string) => void
}

/**
 * PhotoGrid component displays a responsive masonry-style grid of photos
 * with infinite scroll, status badges, and loading states.
 */
export function PhotoGrid({ filters, onPhotoClick }: PhotoGridProps) {
  const { data, isLoading, error } = usePhotos(filters)
  const observerTarget = useRef<HTMLDivElement>(null)

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

  // Format status text
  const formatStatus = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1)
  }

  // Handle photo click
  const handlePhotoClick = useCallback(
    (photoId: string) => {
      if (onPhotoClick) {
        onPhotoClick(photoId)
      }
    },
    [onPhotoClick]
  )

  // Infinite scroll implementation
  // For now, we'll prepare the structure but implement basic pagination later
  // as the API needs cursor-based pagination support
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          // TODO: Load more photos when intersection observer triggers
          // This will require implementing cursor-based pagination in the API
          console.log('Load more photos...')
        }
      },
      { threshold: 0.1 }
    )

    const currentTarget = observerTarget.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [])

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
  if (!data?.photos || data.photos.length === 0) {
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

  // Photo grid
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {data.photos.map((photo) => (
          <div
            key={photo.id}
            className={cn(
              'group relative aspect-square cursor-pointer overflow-hidden rounded-lg bg-slate',
              'transition-all duration-200 hover:ring-2 hover:ring-copper'
            )}
            onClick={() => handlePhotoClick(photo.id)}
          >
            {/* Photo thumbnail */}
            <div className="relative h-full w-full">
              {photo.thumbnailUrl ? (
                <Image
                  src={photo.thumbnailUrl}
                  alt="Trail camera photo"
                  fill
                  className="object-cover transition-transform duration-200 group-hover:scale-105"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
                  unoptimized // Signed URLs from Supabase don't work well with Next.js image optimization
                />
              ) : photo.imageUrl ? (
                <Image
                  src={photo.imageUrl}
                  alt="Trail camera photo"
                  fill
                  className="object-cover transition-transform duration-200 group-hover:scale-105"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw"
                  unoptimized
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

              {/* Deer classification badge (if present) */}
              {photo.classification && (
                <div className="absolute bottom-2 left-2">
                  <Badge variant="default">
                    {photo.classification}
                    {photo.confidence && (
                      <span className="ml-1 opacity-75">
                        {Math.round(photo.confidence * 100)}%
                      </span>
                    )}
                  </Badge>
                </div>
              )}

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-deep/60 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            </div>
          </div>
        ))}
      </div>

      {/* Infinite scroll trigger (invisible element) */}
      <div ref={observerTarget} className="h-4" />

      {/* Total count info */}
      {data.total > 0 && (
        <div className="text-center text-sm text-cream-dark">
          Showing {data.photos.length} of {data.total} photos
        </div>
      )}
    </div>
  )
}
