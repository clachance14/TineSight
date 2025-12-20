'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'

const ACTIVE_BATCH_KEY = 'tinesight:active_batch_id'

interface BatchStats {
  total_photos: number
  analyzed_photos: number
  pending_photos: number
  processing_photos: number
  failed_photos: number
}

interface UseActiveProcessingBatchReturn {
  batchId: string | null
  stats: BatchStats | null
  isLoading: boolean
  isProcessing: boolean
  clearBatch: () => void
}

/**
 * Hook to track and monitor the currently active processing batch.
 * Reads batch ID from sessionStorage (set during upload) and polls for stats.
 * Auto-clears when processing completes.
 */
export function useActiveProcessingBatch(): UseActiveProcessingBatchReturn {
  const [batchId, setBatchId] = useState<string | null>(null)

  // Read batch ID from sessionStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const storedId = sessionStorage.getItem(ACTIVE_BATCH_KEY)
    if (storedId) {
      setBatchId(storedId)
    }
  }, [])

  // Clear the active batch
  const clearBatch = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(ACTIVE_BATCH_KEY)
    }
    setBatchId(null)
  }, [])

  // Fetch batch-specific stats with polling
  const { data: statsData, isLoading } = useQuery({
    queryKey: ['photos', 'stats', 'batch', batchId],
    queryFn: async (): Promise<BatchStats> => {
      const res = await fetch(`/api/photos/stats?batch_id=${batchId}`)
      if (!res.ok) {
        throw new Error('Failed to fetch batch stats')
      }
      return res.json()
    },
    enabled: batchId !== null,
    // Poll every 3 seconds while processing
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return 3000

      // Stop polling if no photos are pending or processing
      const isStillProcessing = data.pending_photos > 0 || data.processing_photos > 0
      return isStillProcessing ? 3000 : false
    },
    staleTime: 1000, // Consider data stale after 1 second
  })

  // Auto-clear batch when processing completes
  useEffect(() => {
    if (!statsData) return undefined

    const { pending_photos, processing_photos, total_photos } = statsData
    const isComplete = pending_photos === 0 && processing_photos === 0 && total_photos > 0

    if (isComplete) {
      // Delay clearing slightly so user sees the completed state
      const timeout = setTimeout(() => {
        clearBatch()
      }, 2000)
      return () => clearTimeout(timeout)
    }

    return undefined
  }, [statsData, clearBatch])

  const isProcessing = statsData
    ? (statsData.pending_photos > 0 || statsData.processing_photos > 0)
    : false

  return {
    batchId,
    stats: statsData ?? null,
    isLoading,
    isProcessing,
    clearBatch,
  }
}

/**
 * Set the active batch ID in sessionStorage.
 * Call this after upload completes to enable processing status tracking.
 */
export function setActiveBatchId(batchId: string): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(ACTIVE_BATCH_KEY, batchId)
  }
}
