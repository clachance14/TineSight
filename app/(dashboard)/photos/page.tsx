'use client'

import React, { Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { usePhotosInfinite } from '@/lib/hooks/use-photos'
import { useDeerCatalog } from '@/lib/hooks/use-deer'
import { useAreas } from '@/lib/hooks/use-areas'
import { useLocations } from '@/lib/hooks/use-locations'
import { PhotoGrid } from '@/components/photos/photo-grid'

// TEST: Adding PhotoGrid component back
// Previous: extra queries - WORKED
// Now testing: + PhotoGrid component (has selection store, memoization, scroll handling)

function PhotosContent(): React.JSX.Element {
  const router = useRouter()

  // Primary data
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePhotosInfinite({ limit: 15 })

  // Extra queries (confirmed working)
  const { data: statsData } = useQuery({
    queryKey: ['photos', 'stats'],
    queryFn: async () => {
      const res = await fetch('/api/photos/stats')
      if (!res.ok) return null
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: deerData } = useDeerCatalog()
  const { data: areasData } = useAreas()
  const { data: locationsData } = useLocations()

  // Flatten pages
  const photos = data?.pages?.flatMap(p => p.photos) ?? []
  const total = data?.pages?.[0]?.total ?? 0
  const deerCount = deerData?.deer?.length ?? 0
  const areasCount = areasData?.areas?.length ?? 0
  const locationsCount = locationsData?.locations?.length ?? 0
  const totalPhotos = statsData?.total_photos ?? total

  return (
    <div className="flex flex-col h-full space-y-2">
      <div>
        <h1 className="text-xl font-bold text-cream">Photos</h1>
        <p className="text-sm text-cream-dark">
          {photos.length} of {totalPhotos} photos | {deerCount} deer | {areasCount} areas | {locationsCount} locations
        </p>
      </div>

      {/* ADDING BACK: PhotoGrid component */}
      <PhotoGrid
        externalData={{
          photos,
          total,
          isLoading,
          hasNextPage: hasNextPage ?? false,
          isFetchingNextPage,
          fetchNextPage,
        }}
        onPhotoClick={(id) => {
          router.push(`/photos/${id}`)
        }}
      />
    </div>
  )
}

export default function PhotosPage() {
  return (
    <Suspense fallback={<div className="text-cream-dark">Loading...</div>}>
      <PhotosContent />
    </Suspense>
  )
}
