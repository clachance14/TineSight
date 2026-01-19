'use client'

import React, { Suspense } from 'react'
import { usePhotosInfinite } from '@/lib/hooks/use-photos'

// TEST VERSION 2: Data fetching + simple CSS grid
// NO next/image, NO virtualization
// Using CSS background-image instead of next/image component

function PhotosContent(): React.JSX.Element {
  // Fetch photos - minimal config
  const {
    data,
    isLoading,
    error,
  } = usePhotosInfinite({ limit: 15 })

  // Flatten pages
  const photos = data?.pages?.flatMap(p => p.photos) ?? []

  if (isLoading) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold text-cream mb-4">Photos (Loading...)</h1>
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
      <div className="p-4">
        <h1 className="text-2xl font-bold text-cream mb-4">Photos (Error)</h1>
        <p className="text-red-400">{error.message}</p>
      </div>
    )
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-cream mb-4">
        Photos Test v2 ({photos.length} loaded)
      </h1>
      <p className="text-cream-dark mb-4 text-sm">
        Using CSS background-image (NO next/image, NO virtualization)
      </p>

      {/* Simple CSS grid - no virtualization */}
      <div className="grid grid-cols-5 gap-2">
        {photos.map((photo, i) => (
          <div
            key={photo.id}
            className="aspect-square bg-slate rounded-lg overflow-hidden"
            style={{
              backgroundImage: photo.thumbnailUrl ? `url(${photo.thumbnailUrl})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {!photo.thumbnailUrl && (
              <div className="w-full h-full flex items-center justify-center text-cream-dark">
                {i + 1}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-cream-dark mt-4 text-sm">
        If this works, next/image or virtualization is the problem.
      </p>
    </div>
  )
}

export default function PhotosPage() {
  return (
    <Suspense fallback={<div className="text-cream-dark p-4">Loading...</div>}>
      <PhotosContent />
    </Suspense>
  )
}
