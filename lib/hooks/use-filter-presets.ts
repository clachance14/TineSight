'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

/**
 * Filter preset data structure
 */
interface FilterPreset {
  id: string
  user_id: string
  name: string
  filters: Record<string, unknown>
  created_at: string
  updated_at: string
}

/**
 * Response from filter presets list endpoint
 */
interface FilterPresetsResponse {
  presets: FilterPreset[]
}

/**
 * Input for creating a new filter preset
 */
interface CreateFilterPresetInput {
  name: string
  filters: Record<string, unknown>
}

/**
 * Input for updating an existing filter preset
 */
interface UpdateFilterPresetInput {
  name?: string
  filters?: Record<string, unknown>
}

/**
 * Query key factory for filter presets
 */
export const filterPresetsKeys = {
  all: ['filterPresets'] as const,
  list: () => [...filterPresetsKeys.all, 'list'] as const,
  detail: (id: string) => [...filterPresetsKeys.all, 'detail', id] as const,
}

/**
 * Hook to fetch all filter presets for the current user
 */
export function useFilterPresets() {
  return useQuery({
    queryKey: filterPresetsKeys.list(),
    queryFn: async (): Promise<FilterPresetsResponse> => {
      const res = await fetch('/api/filter-presets', { cache: 'no-store' })
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to fetch presets' }))
        throw new Error(error.error || 'Failed to fetch presets')
      }
      return res.json()
    },
  })
}

/**
 * Hook to fetch a single filter preset by ID
 */
export function useFilterPreset(presetId: string | null) {
  return useQuery({
    queryKey: filterPresetsKeys.detail(presetId!),
    queryFn: async (): Promise<FilterPreset> => {
      if (!presetId) throw new Error('No preset ID')
      const res = await fetch(`/api/filter-presets/${presetId}`, { cache: 'no-store' })
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to fetch preset' }))
        throw new Error(error.error || 'Failed to fetch preset')
      }
      return res.json()
    },
    enabled: !!presetId,
  })
}

/**
 * Hook to create a new filter preset
 * Invalidates the presets list query on success
 */
export function useCreateFilterPreset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateFilterPresetInput): Promise<FilterPreset> => {
      const res = await fetch('/api/filter-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to create preset' }))
        throw new Error(error.error || 'Failed to create preset')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: filterPresetsKeys.all })
    },
  })
}

/**
 * Hook to update an existing filter preset
 * Invalidates the presets list and detail queries on success
 */
export function useUpdateFilterPreset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string
      data: UpdateFilterPresetInput
    }): Promise<FilterPreset> => {
      const res = await fetch(`/api/filter-presets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to update preset' }))
        throw new Error(error.error || 'Failed to update preset')
      }
      return res.json()
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: filterPresetsKeys.all })
      queryClient.invalidateQueries({ queryKey: filterPresetsKeys.detail(id) })
    },
  })
}

/**
 * Hook to delete a filter preset
 * Invalidates the presets list query on success
 */
export function useDeleteFilterPreset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (presetId: string): Promise<void> => {
      const res = await fetch(`/api/filter-presets/${presetId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to delete preset' }))
        throw new Error(error.error || 'Failed to delete preset')
      }
    },
    onSuccess: (_, presetId) => {
      queryClient.invalidateQueries({ queryKey: filterPresetsKeys.all })
      queryClient.removeQueries({ queryKey: filterPresetsKeys.detail(presetId) })
    },
  })
}
