import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface MatchReview {
  id: string
  detection: {
    id: string
    image_url?: string
    thumbnail_url?: string
    head_crop_url?: string
    species: string
    sex: string
    antler_points: number | null
    age_class: string | null
    captured_at?: string
  }
  suggested_deer: {
    id: string
    name: string
    reference_image_url?: string
  } | null
  gemini_confidence: number
  gemini_reasoning: string | null
  other_possibilities: Array<{
    deer_id: string
    deer_name: string
    confidence: number
  }>
  is_likely_new_deer: boolean
  catalog_deer: Array<{
    id: string
    name: string
    reference_image_url?: string
  }>
}

/**
 * Hook to fetch pending matches
 */
export function usePendingMatches(detectionId?: string) {
  return useQuery<{ matches: MatchReview[]; total_pending: number }>({
    queryKey: ['pending-matches', detectionId],
    queryFn: async () => {
      const url = detectionId
        ? `/api/deer/matches?detection_id=${detectionId}`
        : '/api/deer/matches'
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to fetch matches')
      return res.json()
    },
  })
}

/**
 * Hook to confirm a match
 */
export function useConfirmMatch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (matchId: string) => {
      const res = await fetch(`/api/deer/matches/${matchId}/confirm`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to confirm match')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-matches'] })
      queryClient.invalidateQueries({ queryKey: ['deer-catalog'] })
    },
  })
}

/**
 * Hook to correct a match (assign to different deer)
 */
export function useCorrectMatch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ matchId, deerId }: { matchId: string; deerId: string }) => {
      const res = await fetch(`/api/deer/matches/${matchId}/correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deer_id: deerId }),
      })
      if (!res.ok) throw new Error('Failed to correct match')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-matches'] })
      queryClient.invalidateQueries({ queryKey: ['deer-catalog'] })
    },
  })
}

/**
 * Hook to reject a match
 */
export function useRejectMatch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (matchId: string) => {
      const res = await fetch(`/api/deer/matches/${matchId}/reject`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to reject match')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-matches'] })
    },
  })
}

/**
 * Hook to skip a match (leave for later)
 */
export function useSkipMatch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (matchId: string) => {
      const res = await fetch(`/api/deer/matches/${matchId}/skip`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to skip match')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-matches'] })
    },
  })
}

/**
 * Hook to create new deer from a match
 */
export function useCreateNewFromMatch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      matchId,
      name,
      notes,
    }: {
      matchId: string
      name: string
      notes?: string | null
    }) => {
      const res = await fetch(`/api/deer/matches/${matchId}/create-new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, notes }),
      })
      if (!res.ok) throw new Error('Failed to create new deer')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-matches'] })
      queryClient.invalidateQueries({ queryKey: ['deer-catalog'] })
    },
  })
}

/**
 * Hook to trigger matching job
 */
export function useTriggerMatching() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (detectionIds?: string[]) => {
      const res = await fetch('/api/deer/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(detectionIds ? { detection_ids: detectionIds } : {}),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to trigger matching')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-matches'] })
    },
  })
}
