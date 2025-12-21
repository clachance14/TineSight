'use client'

import { useQuery } from '@tanstack/react-query'

interface AreasResponse {
  areas: string[]
}

/**
 * Hook to fetch distinct area names for filter dropdown
 * Cached for 5 minutes to reduce API calls
 */
export function useAreas() {
  return useQuery({
    queryKey: ['areas'],
    queryFn: async (): Promise<AreasResponse> => {
      const res = await fetch('/api/photos/areas', { cache: 'no-store' })

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to fetch areas' }))
        throw new Error(error.error || 'Failed to fetch areas')
      }

      return res.json()
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 30 * 60 * 1000,   // Keep in memory for 30 minutes
  })
}
