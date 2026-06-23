import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface MatchReview {
  id: string
  detection: {
    id: string
    image_url?: string
    thumbnail_url?: string
    head_crop_url?: string
    crop_url?: string | null
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
 * Hook for just the pending-match count (sidebar badge). Cheap: no rows, no signed URLs.
 */
export function usePendingMatchCount() {
  return useQuery<{ total_pending: number }>({
    queryKey: ['pending-matches', 'count'],
    queryFn: async () => {
      const res = await fetch('/api/deer/matches?count=1', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to fetch match count')
      return res.json()
    },
    // Keep the Re-ID badge live: re-ID matches are produced by the compare-deer
    // background job, so the count climbs without any user action. Poll so the
    // badge reflects new pending matches, and refresh on focus/reconnect.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}

/**
 * Hook to fetch pending matches (proposed Sightings) for a single Buck.
 */
export function usePendingMatchesForDeer(deerId: string) {
  return useQuery<{ matches: MatchReview[]; total_pending: number }>({
    queryKey: ['pending-matches', 'deer', deerId],
    queryFn: async () => {
      const res = await fetch(`/api/deer/matches?deer_id=${deerId}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to fetch pending matches')
      return res.json()
    },
    enabled: deerId.length > 0,
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
      queryClient.invalidateQueries({ queryKey: ['deer'] }) // refresh the profile's Sightings
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
      queryClient.invalidateQueries({ queryKey: ['deer'] }) // refresh the profile's Sightings
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
 * One ranked "Find sightings" candidate (ADR 0005). Mirrors the API DTO.
 */
export interface SightingCandidate {
  detection_id: string
  crop_url: string | null
  similarity: number
  score_gross: number | null
  point_range: string | null
  age_class: string | null
  captured_at: string | null
}

/**
 * Hook for the operator-driven "Find sightings" ranked search for one Buck.
 * Gated by `enabled` so the scan only runs when the operator opens the panel.
 */
export function useFindSightings(deerId: string, enabled: boolean) {
  return useQuery<{ candidates: SightingCandidate[] }>({
    queryKey: ['find-sightings', deerId],
    queryFn: async () => {
      const res = await fetch(`/api/deer/${deerId}/find-sightings`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to find sightings')
      return res.json()
    },
    enabled: enabled && deerId.length > 0,
    staleTime: 0,
  })
}

/**
 * Hook to confirm/reject one "Find sightings" candidate. Optimistically removes
 * the reviewed row from the loaded list so we don't re-run the scan mid-review;
 * a confirm refreshes the Buck's Sightings, catalog, and pending-match surfaces.
 */
export function useReviewSightingCandidate(deerId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: {
      detectionId: string
      decision: 'confirm' | 'reject'
      similarity: number
    }) => {
      const res = await fetch(`/api/deer/${deerId}/find-sightings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vars),
      })
      if (!res.ok) throw new Error('Failed to review candidate')
      return res.json()
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['find-sightings', deerId] })
      const prev = queryClient.getQueryData<{ candidates: SightingCandidate[] }>(['find-sightings', deerId])
      if (prev) {
        queryClient.setQueryData(['find-sightings', deerId], {
          candidates: prev.candidates.filter((c) => c.detection_id !== vars.detectionId),
        })
      }
      return { prev }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(['find-sightings', deerId], context.prev)
      }
    },
    onSuccess: (_data, vars) => {
      if (vars.decision === 'confirm') {
        queryClient.invalidateQueries({ queryKey: ['deer'] }) // refresh the profile's Sightings
        queryClient.invalidateQueries({ queryKey: ['deer-catalog'] })
        queryClient.invalidateQueries({ queryKey: ['pending-matches'] })
      }
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
