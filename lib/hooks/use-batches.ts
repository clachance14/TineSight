'use client'

import { useQuery } from '@tanstack/react-query'

interface BatchForDropdown {
  id: string
  created_at: string
  total_images: number
}

interface BatchesResponse {
  batches: BatchForDropdown[]
}

/**
 * Hook to fetch batches for filter dropdown
 * Cached for 5 minutes to reduce API calls
 */
export function useBatches() {
  return useQuery({
    queryKey: ['batches'],
    queryFn: async (): Promise<BatchesResponse> => {
      const res = await fetch('/api/batches', { cache: 'no-store' })

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to fetch batches' }))
        throw new Error(error.error || 'Failed to fetch batches')
      }

      return res.json()
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 30 * 60 * 1000,   // Keep in memory for 30 minutes
  })
}

export type { BatchForDropdown }
