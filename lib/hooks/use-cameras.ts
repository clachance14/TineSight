'use client'

import { useQuery } from '@tanstack/react-query'
import type { CameraWithPhotoCount } from '@/lib/services/cameras'

interface CamerasResponse {
  cameras: CameraWithPhotoCount[]
  total: number
}

/**
 * Hook to fetch cameras with photo counts
 */
export function useCameras() {
  return useQuery({
    queryKey: ['cameras'],
    queryFn: async (): Promise<CamerasResponse> => {
      const res = await fetch('/api/cameras', { cache: 'no-store' })

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to fetch cameras' }))
        throw new Error(error.error || 'Failed to fetch cameras')
      }

      return res.json()
    },
  })
}
