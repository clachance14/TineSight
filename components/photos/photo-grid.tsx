'use client'

import { useCallback, useMemo } from 'react'
import { usePhotosInfinite } from '@/lib/hooks/use-photos'
import type { PhotoFilters } from '@/lib/services/photos'
import { Skeleton } from '@/components/ui/skeleton'

// iOS Safari crash investigation:
// REMOVED: All useEffect hooks (resize listener, scroll listener)
// REMOVED: useRef (scroll container ref)
// REMOVED: useState for columns/isMobile (using fixed values)
// Testing if useEffect hooks cause the crash

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

// TEST 2: Removed memo() wrapper - testing if memo() causes Safari crash
function PhotoGridItem({
  photo,
  onClick,
  priority = false,
}: {
  photo: Photo
  onClick: (id: string) => void
  priority?: boolean
}) {
  const handleClick = useCallback(() => {
    onClick(photo.id)
  }, [photo.id, onClick])

  return (
    <div
      className="group relative aspect-square cursor-pointer overflow-hidden bg-slate rounded-lg active:scale-[0.97] transition-transform duration-100 hover:ring-2 hover:ring-copper"
      onClick={handleClick}
    >
      <div className="relative h-full w-full">
        {photo.thumbnailUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photo.thumbnailUrl}
            alt="Trail camera photo"
            className="absolute inset-0 h-full w-full object-cover"
            loading={priority ? 'eager' : 'lazy'}
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
      </div>
    </div>
  )
}

export function PhotoGrid({ filters, onPhotoClick, externalData }: PhotoGridProps) {
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
      if (onPhotoClick) {
        onPhotoClick(photoId)
      }
    },
    [onPhotoClick]
  )

  if (isLoading) {
    return (
      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: 10 }).map((_, i) => (
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

  // SUPER SIMPLE: Just a grid, no scroll container, no effects
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="grid grid-cols-5 gap-1.5 overflow-auto flex-1">
        {photos.map((photo, index) => (
          <PhotoGridItem
            key={photo.id}
            photo={photo}
            onClick={handlePhotoClick}
            priority={index < 10}
          />
        ))}
      </div>

      {total > 0 && (
        <div className="text-center text-sm text-cream-dark py-2">
          Showing {photos.length} of {total} photos
        </div>
      )}
    </div>
  )
}
