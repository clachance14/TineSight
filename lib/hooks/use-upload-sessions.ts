'use client'

import { useQuery } from '@tanstack/react-query'

interface UploadSessionForDropdown {
  id: string
  created_at: string
  total_images: number
}

interface UploadSessionsResponse {
  sessions: UploadSessionForDropdown[]
}

/**
 * Hook to fetch upload sessions for filter dropdown
 * Cached for 5 minutes to reduce API calls
 */
export function useUploadSessions() {
  return useQuery({
    queryKey: ['upload-sessions'],
    queryFn: async (): Promise<UploadSessionsResponse> => {
      const res = await fetch('/api/upload-sessions')

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to fetch upload sessions' }))
        throw new Error(error.error || 'Failed to fetch upload sessions')
      }

      return res.json()
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 30 * 60 * 1000,   // Keep in memory for 30 minutes
  })
}

export type { UploadSessionForDropdown }
