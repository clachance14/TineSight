'use client'

import { useCameras } from '@/lib/hooks/use-cameras'
import { CameraCard } from './camera-card'
import { Camera, Loader2 } from 'lucide-react'

export function CameraList() {
  const { data, isLoading, error } = useCameras()

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 text-copper animate-spin" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-red-400">Failed to load cameras</p>
        <p className="text-sm text-cream-dark mt-1">{error.message}</p>
      </div>
    )
  }

  // Empty state
  if (!data?.cameras || data.cameras.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate border border-slate-light mb-4">
          <Camera className="h-8 w-8 text-cream-dark" />
        </div>
        <h3 className="font-medium text-cream">No cameras yet</h3>
        <p className="text-sm text-cream-dark mt-1 max-w-sm">
          Cameras are automatically detected when you upload photos. Upload some photos to get started.
        </p>
      </div>
    )
  }

  // Camera grid
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.cameras.map((camera) => (
        <CameraCard key={camera.id} camera={camera} />
      ))}
    </div>
  )
}
