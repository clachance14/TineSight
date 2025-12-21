import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface Deer {
  id: string
  name: string
  notes: string | null
  sighting_count: number
  reference_image_url?: string | null
  created_at: string
  updated_at: string
}

interface DeerCatalogResponse {
  deer: Deer[]
  nextCursor: string | null
  total: number
}

interface DeerWithSightings extends Deer {
  reference_bbox?: {
    x: number | null
    y: number | null
    width: number | null
    height: number | null
  } | null
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
 * Hook to fetch deer catalog (first page only, for dropdowns/filters)
 */
export function useDeerCatalog(search?: string, options?: { limit?: number }) {
  const limit = options?.limit ?? 50

  return useQuery<DeerCatalogResponse>({
    queryKey: ['deer-catalog', search, limit],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      params.set('limit', limit.toString())
      const url = `/api/deer?${params}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to fetch catalog')
      return res.json()
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - deer catalog rarely changes
    gcTime: 30 * 60 * 1000,   // Keep in cache for 30 minutes
  })
}

/**
 * Hook to fetch deer catalog with infinite scroll pagination
 */
export function useDeerCatalogInfinite(search?: string, options?: { limit?: number }) {
  const limit = options?.limit ?? 24

  return useInfiniteQuery<DeerCatalogResponse>({
    queryKey: ['deer-catalog-infinite', search],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      params.set('limit', limit.toString())
      if (pageParam) params.set('cursor', pageParam as string)
      const url = `/api/deer?${params}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to fetch catalog')
      return res.json()
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
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
      const res = await fetch(`/api/deer/${deerId}?${params}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to fetch deer')
      return res.json()
    },
    enabled: !!deerId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000,   // 10 minutes
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
