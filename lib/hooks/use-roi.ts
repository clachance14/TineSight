'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ROICoordinates } from '@/components/photos/roi-selector'
import type { FeedbackType } from '@/components/photos/quality-feedback-dialog'

// Response types for ROI API endpoints
interface ROIResponse {
  roi: {
    id: string
    detection_id: string
    roi_x: number
    roi_y: number
    roi_width: number
    roi_height: number
    is_reference: boolean
    created_at: string
    updated_at: string
    created_by: string | null
  } | null
}

interface ROISaveResponse {
  roi: {
    id: string
    detection_id: string
    roi_x: number
    roi_y: number
    roi_width: number
    roi_height: number
    is_reference: boolean
    created_at: string
    updated_at: string
    created_by: string | null
  }
}

interface ROIReferenceResponse {
  roi: {
    id: string
    is_reference: boolean
  }
}

interface RegenerateEmbeddingResponse {
  message: string
  taskId: string
}

interface FeedbackResponse {
  feedback: {
    id: string
    detection_id: string
    feedback_type: FeedbackType
    notes: string | null
    created_at: string
    created_by: string | null
  }
}

interface FeedbackListResponse {
  feedback: Array<{
    id: string
    detection_id: string
    feedback_type: FeedbackType
    notes: string | null
    created_at: string
    created_by: string | null
  }>
}

/**
 * Hook to fetch ROI for a detection
 */
export function useROI(detectionId: string) {
  return useQuery({
    queryKey: ['roi', detectionId],
    queryFn: async (): Promise<ROIResponse> => {
      const res = await fetch(`/api/detections/${detectionId}/roi`, { cache: 'no-store' })

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to fetch ROI' }))
        throw new Error(error.error || 'Failed to fetch ROI')
      }

      return res.json()
    },
    enabled: !!detectionId,
  })
}

/**
 * Hook to save/update ROI for a detection
 */
export function useSaveROI() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      detectionId,
      roi,
    }: {
      detectionId: string
      roi: ROICoordinates
    }): Promise<ROISaveResponse> => {
      const res = await fetch(`/api/detections/${detectionId}/roi`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roi_x: roi.x,
          roi_y: roi.y,
          roi_width: roi.width,
          roi_height: roi.height,
        }),
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to save ROI' }))
        throw new Error(error.error || 'Failed to save ROI')
      }

      return res.json()
    },
    onSuccess: (_, { detectionId }) => {
      // Invalidate ROI query to refetch
      queryClient.invalidateQueries({ queryKey: ['roi', detectionId] })
      // Also invalidate photo detail to update has_roi status if tracked
      queryClient.invalidateQueries({ queryKey: ['photo'] })
    },
  })
}

/**
 * Hook to delete ROI for a detection
 */
export function useDeleteROI() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (detectionId: string): Promise<void> => {
      const res = await fetch(`/api/detections/${detectionId}/roi`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to delete ROI' }))
        throw new Error(error.error || 'Failed to delete ROI')
      }
    },
    onSuccess: (_, detectionId) => {
      queryClient.invalidateQueries({ queryKey: ['roi', detectionId] })
      queryClient.invalidateQueries({ queryKey: ['photo'] })
    },
  })
}

/**
 * Hook to toggle reference status of an ROI
 */
export function useToggleROIReference() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      detectionId,
      isReference,
    }: {
      detectionId: string
      isReference: boolean
    }): Promise<ROIReferenceResponse> => {
      const res = await fetch(`/api/detections/${detectionId}/roi`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_reference: isReference }),
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to update reference status' }))
        throw new Error(error.error || 'Failed to update reference status')
      }

      return res.json()
    },
    onSuccess: (_, { detectionId }) => {
      queryClient.invalidateQueries({ queryKey: ['roi', detectionId] })
      // Invalidate reference count queries
      queryClient.invalidateQueries({ queryKey: ['referenceCount'] })
    },
  })
}

/**
 * Hook to trigger embedding regeneration from ROI
 */
export function useRegenerateEmbedding() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (detectionId: string): Promise<RegenerateEmbeddingResponse> => {
      const res = await fetch(`/api/detections/${detectionId}/regenerate-embedding`, {
        method: 'POST',
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to trigger embedding regeneration' }))
        throw new Error(error.error || 'Failed to trigger embedding regeneration')
      }

      return res.json()
    },
    onSuccess: (_, detectionId) => {
      // Invalidate detection/photo queries to show updated status
      queryClient.invalidateQueries({ queryKey: ['photo'] })
      queryClient.invalidateQueries({ queryKey: ['detection', detectionId] })
    },
  })
}

/**
 * Hook to fetch feedback for a detection
 */
export function useFeedback(detectionId: string) {
  return useQuery({
    queryKey: ['feedback', detectionId],
    queryFn: async (): Promise<FeedbackListResponse> => {
      const res = await fetch(`/api/detections/${detectionId}/feedback`, { cache: 'no-store' })

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to fetch feedback' }))
        throw new Error(error.error || 'Failed to fetch feedback')
      }

      return res.json()
    },
    enabled: !!detectionId,
  })
}

/**
 * Hook to submit quality feedback for a detection
 */
export function useSubmitFeedback() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      detectionId,
      feedbackType,
      notes,
    }: {
      detectionId: string
      feedbackType: FeedbackType
      notes: string | null
    }): Promise<FeedbackResponse> => {
      const res = await fetch(`/api/detections/${detectionId}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          feedback_type: feedbackType,
          notes,
        }),
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Failed to submit feedback' }))
        throw new Error(error.error || 'Failed to submit feedback')
      }

      return res.json()
    },
    onSuccess: (_, { detectionId }) => {
      queryClient.invalidateQueries({ queryKey: ['feedback', detectionId] })
      // May also want to update detection status
      queryClient.invalidateQueries({ queryKey: ['photo'] })
      queryClient.invalidateQueries({ queryKey: ['detection', detectionId] })
    },
  })
}

/**
 * Helper to convert API ROI to component ROICoordinates
 */
export function apiRoiToCoordinates(
  roi: ROIResponse['roi']
): ROICoordinates | null {
  if (!roi) return null
  return {
    x: roi.roi_x,
    y: roi.roi_y,
    width: roi.roi_width,
    height: roi.roi_height,
  }
}
