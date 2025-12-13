'use client'

import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import type { PhotoFilters } from '@/lib/services/photos'

// Response types for API endpoints
interface PhotosResponse {
  photos: Array<{
    id: string
    user_id: string
    file_path: string
    camera_id: string | null
    file_size_bytes: number | null
    captured_at: string | null
    detection_status: string
    classification: string | null
    confidence: number | null
    is_archived: boolean
    created_at: string
    updated_at: string
    thumbnailUrl: string | null
    imageUrl: string | null
    thumbnail_path?: string | null
    bestQualityStatus: string | null
  }>
  total: number
  nextCursor: string | null
}

interface PhotoDetailResponse {
  photo: {
    id: string
    user_id: string
    file_path: string
    camera_id: string | null
    file_size_bytes: number | null
    captured_at: string | null
    detection_status: string
    classification: string | null
    confidence: number | null
    is_archived: boolean
    created_at: string
    updated_at: string
    detections: Array<{
      id: string
      image_id: string
      bbox_x: number
      bbox_y: number
      bbox_width: number
      bbox_height: number
      confidence: number
      class_name: string | null
      created_at: string
      has_embedding: boolean
    }>
  }
}

interface BatchStatusResponse {
  batch: {
    id: string
    user_id: string
    status: 'pending' | 'uploading' | 'processing' | 'completed' | 'partial_error' | 'failed'
    total_images: number
    uploaded_images: number
    processed_images: number
    successful_images: number
    failed_images: number
    error_message: string | null
    created_at: string
    completed_at: string | null
  }
}

/**
 * Hook to fetch photos with optional filters
 * Auto-refetches every 2 seconds when any photos are in 'processing' status
 */
export function usePhotos(filters?: PhotoFilters) {
  return useQuery({
    queryKey: ['photos', filters],
    queryFn: async (): Promise<PhotosResponse> => {
      const params = new URLSearchParams()

      // Build query params from filters
      if (filters?.status !== undefined) {
        params.append('status', filters.status)
      }
      if (filters?.hasDeer !== undefined) {
        params.append('hasDeer', String(filters.hasDeer))
      }
      if (filters?.batchId !== undefined) {
        params.append('batchId', filters.batchId)
      }
      if (filters?.cameraId !== undefined) {
        params.append('cameraId', filters.cameraId)
      }
      if (filters?.isArchived !== undefined) {
        params.append('isArchived', String(filters.isArchived))
      }
      if (filters?.minConfidence !== undefined) {
        params.append('minConfidence', String(filters.minConfidence))
      }
      if (filters?.limit !== undefined) {
        params.append('limit', String(filters.limit))
      }
      if (filters?.offset !== undefined) {
        params.append('offset', String(filters.offset))
      }

      const queryString = params.toString()
      const url = `/api/photos${queryString ? `?${queryString}` : ''}`

      const res = await fetch(url)

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to fetch photos' }))
        throw new Error(error.error || 'Failed to fetch photos')
      }

      return res.json()
    },
    refetchInterval: (query) => {
      // Auto-refetch every 3 seconds if any photos are pending or processing
      const hasActivePhotos = query.state.data?.photos?.some(
        (p) => p.detection_status === 'pending' || p.detection_status === 'processing'
      )
      return hasActivePhotos ? 3000 : false
    },
  })
}

/**
 * Hook to fetch photos with infinite scroll pagination
 * Uses cursor-based pagination for efficient loading
 */
export function usePhotosInfinite(filters?: Omit<PhotoFilters, 'offset'>) {
  return useInfiniteQuery({
    queryKey: ['photos', 'infinite', filters],
    queryFn: async ({ pageParam }): Promise<PhotosResponse> => {
      const params = new URLSearchParams()

      // Build query params from filters
      if (filters?.status !== undefined) {
        params.append('status', filters.status)
      }
      if (filters?.hasDeer !== undefined) {
        params.append('hasDeer', String(filters.hasDeer))
      }
      if (filters?.batchId !== undefined) {
        params.append('batchId', filters.batchId)
      }
      if (filters?.cameraId !== undefined) {
        params.append('cameraId', filters.cameraId)
      }
      if (filters?.isArchived !== undefined) {
        params.append('isArchived', String(filters.isArchived))
      }
      if (filters?.minConfidence !== undefined) {
        params.append('minConfidence', String(filters.minConfidence))
      }
      if (filters?.limit !== undefined) {
        params.append('limit', String(filters.limit))
      } else {
        params.append('limit', '50')
      }

      // Add cursor for pagination
      if (pageParam) {
        params.append('cursor', pageParam)
      }

      const queryString = params.toString()
      const url = `/api/photos${queryString ? `?${queryString}` : ''}`

      const res = await fetch(url)

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to fetch photos' }))
        throw new Error(error.error || 'Failed to fetch photos')
      }

      return res.json()
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    refetchInterval: (query) => {
      // Auto-refetch every 3 seconds if any photos are pending or processing
      const hasActivePhotos = query.state.data?.pages?.some((page) =>
        page.photos.some(
          (p) => p.detection_status === 'pending' || p.detection_status === 'processing'
        )
      )
      return hasActivePhotos ? 3000 : false
    },
  })
}

/**
 * Hook to fetch a single photo by ID with its detections
 */
export function usePhotoDetail(id: string) {
  return useQuery({
    queryKey: ['photo', id],
    queryFn: async (): Promise<PhotoDetailResponse> => {
      const res = await fetch(`/api/photos/${id}`)

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to fetch photo' }))
        throw new Error(error.error || 'Failed to fetch photo')
      }

      return res.json()
    },
    enabled: !!id, // Only run query if id is provided
  })
}

/**
 * Hook to fetch batch status by ID
 * Auto-refetches every 2 seconds while batch is in 'processing' status
 */
export function useBatchStatus(batchId: string) {
  return useQuery({
    queryKey: ['batch', batchId],
    queryFn: async (): Promise<BatchStatusResponse> => {
      const res = await fetch(`/api/batches/${batchId}`)

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to fetch batch status' }))
        throw new Error(error.error || 'Failed to fetch batch status')
      }

      return res.json()
    },
    enabled: !!batchId, // Only run query if batchId is provided
    refetchInterval: (query) => {
      // Auto-refetch every 2 seconds if batch is in 'processing' status
      const isProcessing = query.state.data?.batch?.status === 'processing'
      return isProcessing ? 2000 : false
    },
  })
}
