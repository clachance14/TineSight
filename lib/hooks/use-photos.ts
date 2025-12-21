'use client'

import { useRef } from 'react'
import { useQuery, useInfiniteQuery, keepPreviousData } from '@tanstack/react-query'
import type { PhotoFilters } from '@/lib/services/photos'

/**
 * Exponential backoff configuration for polling
 * Starts at baseInterval, doubles each poll with no changes, caps at maxInterval
 * Resets to baseInterval when data changes
 */
const BACKOFF_CONFIG = {
  baseInterval: 3000,   // Start at 3 seconds
  maxInterval: 30000,   // Cap at 30 seconds
  multiplier: 2,        // Double each time
}

/**
 * Realtime fallback poll interval (1 minute)
 * Used when realtime is active but as a fallback safety mechanism
 */
const REALTIME_ACTIVE_POLL_INTERVAL = 60000

/**
 * Calculate next poll interval with exponential backoff
 */
function calculateBackoff(pollCount: number): number {
  const interval = BACKOFF_CONFIG.baseInterval * Math.pow(BACKOFF_CONFIG.multiplier, pollCount)
  return Math.min(interval, BACKOFF_CONFIG.maxInterval)
}

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
 * Auto-refetches with exponential backoff when photos are processing
 */
export function usePhotos(filters?: PhotoFilters) {
  // Track poll count and previous processing IDs for backoff
  const pollCountRef = useRef(0)
  const prevProcessingIdsRef = useRef<string>('')

  return useQuery({
    queryKey: ['photos', filters],
    // Cache optimization for filter switching
    staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh during browsing session
    gcTime: 30 * 60 * 1000,   // 30 minutes - keep unused cache for filter switching
    placeholderData: keepPreviousData, // Show previous photos instantly while loading new filter results
    queryFn: async (): Promise<PhotosResponse> => {
      const params = new URLSearchParams()

      // Build query params from filters
      if (filters?.status !== undefined) {
        params.append('status', filters.status)
      }
      if (filters?.hasDeer !== undefined) {
        params.append('hasDeer', String(filters.hasDeer))
      }
      if (filters?.hasDetections !== undefined) {
        params.append('hasDetections', String(filters.hasDetections))
      }
      if (filters?.batchId !== undefined) {
        params.append('batchId', filters.batchId)
      }
      if (filters?.uploadSessionId !== undefined) {
        params.append('uploadSessionId', filters.uploadSessionId)
      }
      if (filters?.cameraId !== undefined) {
        params.append('cameraId', filters.cameraId)
      }
      if (filters?.isArchived !== undefined) {
        params.append('isArchived', String(filters.isArchived))
      }
      if (filters?.qualityStatus !== undefined) {
        params.append('qualityStatus', filters.qualityStatus)
      }
      if (filters?.minConfidence !== undefined) {
        params.append('minConfidence', String(filters.minConfidence))
      }
      if (filters?.sex !== undefined) {
        params.append('sex', filters.sex)
      }
      if (filters?.minPoints !== undefined) {
        params.append('min_points', String(filters.minPoints))
      }
      if (filters?.maxPoints !== undefined) {
        params.append('max_points', String(filters.maxPoints))
      }
      if (filters?.sizeClass !== undefined) {
        params.append('sizeClass', filters.sizeClass)
      }
      if (filters?.dateFrom !== undefined) {
        params.append('dateFrom', filters.dateFrom)
      }
      if (filters?.dateTo !== undefined) {
        params.append('dateTo', filters.dateTo)
      }
      if (filters?.deerId !== undefined) {
        params.append('deerId', filters.deerId)
      }
      if (filters?.areaName !== undefined) {
        params.append('areaName', filters.areaName)
      }
      if (filters?.sortBy !== undefined) {
        params.append('sortBy', filters.sortBy)
      }
      if (filters?.limit !== undefined) {
        params.append('limit', String(filters.limit))
      }
      if (filters?.offset !== undefined) {
        params.append('offset', String(filters.offset))
      }
      if (filters?.otherAnimals?.length) {
        params.append('otherAnimals', filters.otherAnimals.join(','))
      }

      const queryString = params.toString()
      const url = `/api/photos${queryString ? `?${queryString}` : ''}`

      const res = await fetch(url, { cache: 'no-store' })

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to fetch photos' }))
        throw new Error(error.error || 'Failed to fetch photos')
      }

      return res.json()
    },
    refetchInterval: (query) => {
      const photos = query.state.data?.photos
      if (!photos) return false

      // Get currently processing photo IDs
      const processingPhotos = photos.filter(
        (p) => p.detection_status === 'pending' || p.detection_status === 'processing'
      )

      // No active photos, stop polling and reset counter
      if (processingPhotos.length === 0) {
        pollCountRef.current = 0
        prevProcessingIdsRef.current = ''
        return false
      }

      // Check if processing set changed (photos completed)
      const currentIds = processingPhotos.map(p => p.id).sort().join(',')
      if (currentIds !== prevProcessingIdsRef.current) {
        // Data changed, reset backoff
        pollCountRef.current = 0
        prevProcessingIdsRef.current = currentIds
      } else {
        // No change, increment backoff
        pollCountRef.current += 1
      }

      return calculateBackoff(pollCountRef.current)
    },
  })
}

/**
 * Hook to fetch photos with infinite scroll pagination
 * Uses cursor-based pagination with exponential backoff for polling
 */
export function usePhotosInfinite(
  filters?: Omit<PhotoFilters, 'offset'>,
  options?: { realtimeActive?: boolean }
) {
  // Track poll count and previous processing IDs for backoff
  const pollCountRef = useRef(0)
  const prevProcessingIdsRef = useRef<string>('')

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
      if (filters?.hasDetections !== undefined) {
        params.append('hasDetections', String(filters.hasDetections))
      }
      if (filters?.batchId !== undefined) {
        params.append('batchId', filters.batchId)
      }
      if (filters?.uploadSessionId !== undefined) {
        params.append('uploadSessionId', filters.uploadSessionId)
      }
      if (filters?.cameraId !== undefined) {
        params.append('cameraId', filters.cameraId)
      }
      if (filters?.isArchived !== undefined) {
        params.append('isArchived', String(filters.isArchived))
      }
      if (filters?.qualityStatus !== undefined) {
        params.append('qualityStatus', filters.qualityStatus)
      }
      if (filters?.minConfidence !== undefined) {
        params.append('minConfidence', String(filters.minConfidence))
      }
      if (filters?.sex !== undefined) {
        params.append('sex', filters.sex)
      }
      if (filters?.minPoints !== undefined) {
        params.append('min_points', String(filters.minPoints))
      }
      if (filters?.maxPoints !== undefined) {
        params.append('max_points', String(filters.maxPoints))
      }
      if (filters?.sizeClass !== undefined) {
        params.append('sizeClass', filters.sizeClass)
      }
      if (filters?.dateFrom !== undefined) {
        params.append('dateFrom', filters.dateFrom)
      }
      if (filters?.dateTo !== undefined) {
        params.append('dateTo', filters.dateTo)
      }
      if (filters?.deerId !== undefined) {
        params.append('deerId', filters.deerId)
      }
      if (filters?.areaName !== undefined) {
        params.append('areaName', filters.areaName)
      }
      if (filters?.sortBy !== undefined) {
        params.append('sortBy', filters.sortBy)
      }
      if (filters?.limit !== undefined) {
        params.append('limit', String(filters.limit))
      } else {
        params.append('limit', '50')
      }
      if (filters?.otherAnimals?.length) {
        params.append('otherAnimals', filters.otherAnimals.join(','))
      }

      // Add cursor for pagination
      if (pageParam) {
        params.append('cursor', pageParam)
      }

      const queryString = params.toString()
      const url = `/api/photos${queryString ? `?${queryString}` : ''}`

      const res = await fetch(url, { cache: 'no-store' })

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to fetch photos' }))
        throw new Error(error.error || 'Failed to fetch photos')
      }

      return res.json()
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    // Cache optimization for filter switching
    staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh during browsing session
    gcTime: 30 * 60 * 1000,   // 30 minutes - keep unused cache for filter switching
    placeholderData: keepPreviousData, // Show previous photos instantly while loading new filter results
    maxPages: 10, // Limit memory usage - older pages can be re-fetched
    refetchInterval: (query) => {
      const pages = query.state.data?.pages
      if (!pages) return false

      // Get all processing photos across all pages
      const processingPhotos = pages.flatMap(page =>
        page.photos.filter(
          (p) => p.detection_status === 'pending' || p.detection_status === 'processing'
        )
      )

      // No active photos, stop polling and reset counter
      if (processingPhotos.length === 0) {
        pollCountRef.current = 0
        prevProcessingIdsRef.current = ''
        return false
      }

      // Check if processing set changed (photos completed)
      const currentIds = processingPhotos.map(p => p.id).sort().join(',')
      if (currentIds !== prevProcessingIdsRef.current) {
        // Data changed, reset backoff
        pollCountRef.current = 0
        prevProcessingIdsRef.current = currentIds
      } else {
        // No change, increment backoff
        pollCountRef.current += 1
      }

      // If realtime is active, use slow fallback polling instead of backoff
      if (options?.realtimeActive === true) {
        return REALTIME_ACTIVE_POLL_INTERVAL
      }

      return calculateBackoff(pollCountRef.current)
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
      const res = await fetch(`/api/photos/${id}`, { cache: 'no-store' })

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
 * Auto-refetches with exponential backoff while batch is processing
 */
export function useBatchStatus(batchId: string) {
  // Track poll count and previous processed count for backoff
  const pollCountRef = useRef(0)
  const prevProcessedCountRef = useRef<number>(-1)

  return useQuery({
    queryKey: ['batch', batchId],
    queryFn: async (): Promise<BatchStatusResponse> => {
      const res = await fetch(`/api/batches/${batchId}`, { cache: 'no-store' })

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to fetch batch status' }))
        throw new Error(error.error || 'Failed to fetch batch status')
      }

      return res.json()
    },
    enabled: !!batchId,
    refetchInterval: (query) => {
      const batch = query.state.data?.batch
      if (!batch) return false

      // Stop polling if batch is complete
      if (batch.status !== 'processing' && batch.status !== 'pending' && batch.status !== 'uploading') {
        pollCountRef.current = 0
        prevProcessedCountRef.current = -1
        return false
      }

      // Check if progress changed
      const currentProcessed = batch.processed_images
      if (currentProcessed !== prevProcessedCountRef.current) {
        // Progress made, reset backoff
        pollCountRef.current = 0
        prevProcessedCountRef.current = currentProcessed
      } else {
        // No progress, increment backoff
        pollCountRef.current += 1
      }

      return calculateBackoff(pollCountRef.current)
    },
  })
}
