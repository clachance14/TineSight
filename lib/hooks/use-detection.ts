'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface DetectionResponse {
  id: string
  imageId: string
  imageUrl: string | null
  cropUrl: string | null
  bboxX: number | null
  bboxY: number | null
  bboxWidth: number | null
  bboxHeight: number | null
  sex: string | null
  sizeClass: string | null
  estimatedPointRange: string | null
  ageClass: string | null
  species: string | null
  distinguishingFeatures: string | null
  confidence: number | null
  geminiConfidence: number | null
  deerId: string | null
  createdAt: string
}

interface UpdateDetectionInput {
  sex?: string | null
  sizeClass?: string | null
  estimatedPointRange?: string | null
  ageClass?: string | null
  species?: string | null
  distinguishingFeatures?: string | null
  deerId?: string | null
}

interface DeleteDetectionResponse {
  success: boolean
  deletedAt: string
}

/**
 * Fetch a single detection by ID
 */
async function fetchDetection(detectionId: string): Promise<DetectionResponse> {
  const response = await fetch(`/api/detections/${detectionId}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch detection' }))
    throw new Error(error.error || 'Failed to fetch detection')
  }

  return response.json()
}

/**
 * Update detection fields
 */
async function updateDetectionApi(
  detectionId: string,
  data: UpdateDetectionInput
): Promise<DetectionResponse> {
  const response = await fetch(`/api/detections/${detectionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to update detection' }))
    throw new Error(error.error || 'Failed to update detection')
  }

  return response.json()
}

/**
 * Soft-delete a detection
 */
async function deleteDetectionApi(detectionId: string): Promise<DeleteDetectionResponse> {
  const response = await fetch(`/api/detections/${detectionId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete detection' }))
    throw new Error(error.error || 'Failed to delete detection')
  }

  return response.json()
}

/**
 * Hook to fetch a single detection
 * @param detectionId - UUID of the detection to fetch
 */
export function useDetection(detectionId: string) {
  return useQuery({
    queryKey: ['detection', detectionId],
    queryFn: () => fetchDetection(detectionId),
    enabled: !!detectionId,
    staleTime: 1000 * 60, // 1 minute
  })
}

/**
 * Hook to update detection classification fields
 * Invalidates the detection query and related photo queries on success
 */
export function useUpdateDetection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ detectionId, data }: { detectionId: string; data: UpdateDetectionInput }) =>
      updateDetectionApi(detectionId, data),
    onSuccess: (data) => {
      // Invalidate the specific detection query
      queryClient.invalidateQueries({ queryKey: ['detection', data.id] })
      // Invalidate only the specific photo containing this detection (if imageId available)
      if (data.imageId) {
        queryClient.invalidateQueries({ queryKey: ['photo', data.imageId] })
      }
      // Invalidate photo stats since detection classifications affect counts
      queryClient.invalidateQueries({ queryKey: ['photo-stats'] })
    },
  })
}

/**
 * Hook to soft-delete a detection
 * Invalidates photo queries on success to remove the detection from lists
 */
export function useDeleteDetection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ detectionId, imageId }: { detectionId: string; imageId?: string }) =>
      deleteDetectionApi(detectionId),
    onSuccess: (_, { detectionId, imageId }) => {
      // Remove the detection from cache
      queryClient.removeQueries({ queryKey: ['detection', detectionId] })
      // Invalidate only the specific photo containing this detection
      if (imageId) {
        queryClient.invalidateQueries({ queryKey: ['photo', imageId] })
      }
      // Invalidate photo stats since deletion affects counts
      queryClient.invalidateQueries({ queryKey: ['photo-stats'] })
    },
  })
}
