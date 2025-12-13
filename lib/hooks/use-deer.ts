import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface Deer {
  id: string
  name: string
  notes: string | null
  sighting_count: number
  reference_image_url?: string | null
  created_at: string
  updated_at: string
}

interface DeerWithSightings extends Deer {
  sightings: Array<{
    id: string
    image_id: string
    thumbnail_url?: string
    captured_at?: string
    antler_points?: number
  }>
  pagination?: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

interface CreateDeerData {
  name: string
  notes?: string | null
  detection_id: string
}

interface UpdateDeerData {
  name?: string
  notes?: string | null
}

interface UseDeerOptions {
  page?: number
  pageSize?: number
}

/**
 * Hook to fetch deer catalog
 */
export function useDeerCatalog(search?: string) {
  return useQuery<{ deer: Deer[] }>({
    queryKey: ['deer-catalog', search],
    queryFn: async () => {
      const url = search ? `/api/deer?search=${encodeURIComponent(search)}` : '/api/deer'
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch catalog')
      return res.json()
    },
  })
}

/**
 * Hook to fetch single deer with sightings (paginated)
 */
export function useDeer(deerId: string | null, options: UseDeerOptions = {}) {
  const { page = 1, pageSize = 12 } = options

  return useQuery<DeerWithSightings>({
    queryKey: ['deer', deerId, page, pageSize],
    queryFn: async () => {
      if (!deerId) throw new Error('No deer ID')
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })
      const res = await fetch(`/api/deer/${deerId}?${params}`)
      if (!res.ok) throw new Error('Failed to fetch deer')
      return res.json()
    },
    enabled: !!deerId,
  })
}

/**
 * Hook to create deer
 */
export function useCreateDeer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateDeerData) => {
      const res = await fetch('/api/deer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create deer')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deer-catalog'] })
    },
  })
}

/**
 * Hook to update deer
 */
export function useUpdateDeer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateDeerData }) => {
      const res = await fetch(`/api/deer/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update deer')
      }
      return res.json()
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['deer-catalog'] })
      queryClient.invalidateQueries({ queryKey: ['deer', id] })
    },
  })
}

/**
 * Hook to delete deer
 */
export function useDeleteDeer() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (deerId: string) => {
      const res = await fetch(`/api/deer/${deerId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        throw new Error('Failed to delete deer')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deer-catalog'] })
    },
  })
}
