'use client'

import React, { Suspense } from 'react'
import Image from 'next/image'
import { usePhotosInfinite } from '@/lib/hooks/use-photos'

// TEST VERSION 3: next/image component (NO virtualization)
// Testing if next/image itself causes the iOS Safari crash

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
        Photos Test v3 ({photos.length} loaded)
      </h1>
      <p className="text-cream-dark mb-4 text-sm">
        Using next/image component (NO virtualization, NO blur placeholder)
      </p>

      {/* Simple CSS grid with next/image - no virtualization */}
      <div className="grid grid-cols-5 gap-2">
        {photos.map((photo, i) => (
          <div
            key={photo.id}
            className="relative aspect-square bg-slate rounded-lg overflow-hidden"
          >
            {photo.thumbnailUrl ? (
              <Image
                src={photo.thumbnailUrl}
                alt={`Photo ${i + 1}`}
                fill
                className="object-cover"
                sizes="20vw"
                // NO blur placeholder - already confirmed that causes issues
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-cream-dark">
                {i + 1}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-cream-dark mt-4 text-sm">
        If this crashes, next/image is the problem (even without blur).
        If this works, virtualization is the problem.
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
