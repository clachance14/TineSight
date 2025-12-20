'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { LocationWithPhotoCount, CreateLocationData, Location } from '@/lib/services/locations'

interface LocationsResponse {
  locations: LocationWithPhotoCount[]
  total: number
}

interface CreateLocationResponse {
  location: LocationWithPhotoCount
}

/**
 * Hook to fetch locations with photo counts
 */
export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    queryFn: async (): Promise<LocationsResponse> => {
      const res = await fetch('/api/locations')

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to fetch locations' }))
        throw new Error(error.error || 'Failed to fetch locations')
      }

      return res.json()
    },
  })
}

/**
 * Hook to create a new location
 */
export function useCreateLocation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateLocationData): Promise<CreateLocationResponse> => {
      const res = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to create location' }))
        throw new Error(error.error || 'Failed to create location')
      }

      return res.json()
    },
    onSuccess: () => {
      // Invalidate locations query to refetch
      void queryClient.invalidateQueries({ queryKey: ['locations'] })
      // Also invalidate areas (for autocomplete in other places)
      void queryClient.invalidateQueries({ queryKey: ['areas'] })
    },
  })
}

/**
 * Hook to delete a location
 */
export function useDeleteLocation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (locationId: string): Promise<{ success: boolean }> => {
      const res = await fetch(`/api/locations/${locationId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to delete location' }))
        throw new Error(error.error || 'Failed to delete location')
      }

      return res.json()
    },
    onSuccess: () => {
      // Invalidate locations query to refetch
      void queryClient.invalidateQueries({ queryKey: ['locations'] })
      // Also invalidate areas
      void queryClient.invalidateQueries({ queryKey: ['areas'] })
    },
  })
}

export interface UpdateLocationData {
  name?: string
  lat?: number
  lng?: number
  directionCompass?: number | null
  directionNotes?: string | null
  notes?: string | null
  color?: string | null
}

interface UpdateLocationResponse {
  location: Location
}

/**
 * Hook to update a location
 */
export function useUpdateLocation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      locationId,
      data,
    }: {
      locationId: string
      data: UpdateLocationData
    }): Promise<UpdateLocationResponse> => {
      const res = await fetch(`/api/locations/${locationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to update location' }))
        throw new Error(error.error || 'Failed to update location')
      }

      return res.json()
    },
    onSuccess: () => {
      // Invalidate locations query to refetch
      void queryClient.invalidateQueries({ queryKey: ['locations'] })
      // Also invalidate areas
      void queryClient.invalidateQueries({ queryKey: ['areas'] })
    },
  })
}
