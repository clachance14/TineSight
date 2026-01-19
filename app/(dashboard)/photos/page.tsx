'use client'

import React, { Suspense } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { usePhotosInfinite } from '@/lib/hooks/use-photos'
import { useDeerCatalog } from '@/lib/hooks/use-deer'
import { useAreas } from '@/lib/hooks/use-areas'
import { useLocations } from '@/lib/hooks/use-locations'

// TEST: Adding extra queries back
// Previous: minimal page with just usePhotosInfinite - WORKED
// Now testing: + stats query, deer catalog, areas, locations

function PhotosContent(): React.JSX.Element {
  const router = useRouter()

  // Primary data
  const {
    data,
    isLoading,
    error,
  } = usePhotosInfinite({ limit: 15 })

  // ADDING BACK: Extra queries
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
  const deerCount = deerData?.deer?.length ?? 0
  const areasCount = areasData?.areas?.length ?? 0
  const locationsCount = locationsData?.locations?.length ?? 0
  const totalPhotos = statsData?.total_photos ?? photos.length

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <h1 className="text-xl font-bold text-cream mb-4">Photos</h1>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="aspect-square bg-slate rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col h-full">
        <h1 className="text-xl font-bold text-cream mb-4">Photos</h1>
        <p className="text-red-400">{error.message}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-cream">Photos</h1>
        <p className="text-sm text-cream-dark">
          {photos.length} of {totalPhotos} photos | {deerCount} deer | {areasCount} areas | {locationsCount} locations
        </p>
      </div>

      {/* Simple CSS grid - no virtualization, no complex components */}
      <div className="grid grid-cols-5 gap-2 flex-1 overflow-auto">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="relative aspect-square bg-slate rounded-lg overflow-hidden cursor-pointer active:scale-95 transition-transform"
            onClick={() => router.push(`/photos/${photo.id}`)}
          >
            {photo.thumbnailUrl ? (
              <Image
                src={photo.thumbnailUrl}
                alt="Trail camera photo"
                fill
                className="object-cover"
                sizes="20vw"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-cream-dark/50">
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
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
