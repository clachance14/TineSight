'use client'

import { useQuery } from '@tanstack/react-query'

// Response types for match endpoints
interface MatchCandidate {
  deer_id: string
  similarity_score: number
  match_status: 'pending' | 'confirmed' | 'rejected'
  created_at: string
  deer: {
    id: string
    name: string | null
    notes: string | null
    first_seen_at: string | null
    last_seen_at: string | null
    is_archived: boolean
    created_at: string
    detection_count?: number
    thumbnail_url?: string | null
  }
}

interface MatchCandidatesResponse {
  candidates: MatchCandidate[]
}

interface PendingMatch {
  id: string
  file_path: string
  captured_at: string | null
  created_at: string
  thumbnailUrl: string | null
  imageUrl: string | null
  detections: Array<{
    id: string
    bbox_x: number
    bbox_y: number
    bbox_width: number
    bbox_height: number
    confidence: number
    pending_match_count: number
  }>
}

interface PendingMatchesResponse {
  photos: PendingMatch[]
  total: number
}

/**
 * Hook to fetch match candidates for a specific detection
 * Returns the list of potential deer matches with similarity scores
 */
export function useMatchCandidates(detectionId: string) {
  return useQuery({
    queryKey: ['match-candidates', detectionId],
    queryFn: async (): Promise<MatchCandidatesResponse> => {
      const res = await fetch(`/api/detections/${detectionId}/matches`)

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to fetch match candidates' }))
        throw new Error(error.error || 'Failed to fetch match candidates')
      }

      return res.json()
    },
    enabled: !!detectionId, // Only run query if detectionId is provided
  })
}

/**
 * Hook to fetch all photos with unreviewed match candidates
 * Auto-refetches every 5 seconds to catch new matches from background processing
 */
export function usePendingMatches() {
  return useQuery({
    queryKey: ['pending-matches'],
    queryFn: async (): Promise<PendingMatchesResponse> => {
      const res = await fetch('/api/photos/pending-matches')

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to fetch pending matches' }))
        throw new Error(error.error || 'Failed to fetch pending matches')
      }

      return res.json()
    },
    refetchInterval: 5000, // Auto-refetch every 5 seconds
  })
}
