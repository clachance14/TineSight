'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'

// Track upload session instead of individual batch for accurate multi-batch counts
const ACTIVE_SESSION_KEY = 'tinesight:active_upload_session_id'

// Legacy key for backward compatibility (can be removed after deployment)
const LEGACY_BATCH_KEY = 'tinesight:active_batch_id'

interface BatchStats {
  total_photos: number
  analyzed_photos: number
  pending_photos: number
  processing_photos: number
  failed_photos: number
}

interface UseActiveProcessingBatchReturn {
  batchId: string | null  // Keep name for backward compatibility (actually session ID now)
  stats: BatchStats | null
  isLoading: boolean
  isProcessing: boolean
  isCancelled: boolean
  clearBatch: () => void
  cancelSession: () => void
}

/**
 * Hook to track and monitor the currently active upload session.
 * Reads session ID from sessionStorage (set during upload) and polls for stats.
 * Auto-clears when processing completes.
 *
 * Note: This tracks upload sessions (which group multiple batches) to properly
 * aggregate stats when large uploads are split into multiple chunks.
 */
export function useActiveProcessingBatch(): UseActiveProcessingBatchReturn {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isCancelled, setIsCancelled] = useState(false)

  // Read session ID from sessionStorage on mount
  // Also migrate from legacy batch key if present
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Try new session key first
    let storedId = sessionStorage.getItem(ACTIVE_SESSION_KEY)

    // Fall back to legacy batch key for backward compatibility
    if (!storedId) {
      storedId = sessionStorage.getItem(LEGACY_BATCH_KEY)
      if (storedId) {
        // Migrate to new key
        sessionStorage.setItem(ACTIVE_SESSION_KEY, storedId)
        sessionStorage.removeItem(LEGACY_BATCH_KEY)
      }
    }

    if (storedId) {
      setSessionId(storedId)
    }
  }, [])

  // Clear the active session
  const clearBatch = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(ACTIVE_SESSION_KEY)
      sessionStorage.removeItem(LEGACY_BATCH_KEY)  // Clean up legacy key too
    }
    setSessionId(null)
    setIsCancelled(false)
  }, [])

  // Cancel the session (marks as cancelled and clears)
  const cancelSession = useCallback(() => {
    setIsCancelled(true)
    clearBatch()
  }, [clearBatch])

  // Fetch session-scoped stats with polling
  const { data: statsData, isLoading } = useQuery({
    queryKey: ['photos', 'stats', 'session', sessionId],
    queryFn: async (): Promise<BatchStats> => {
      const res = await fetch(`/api/photos/stats?upload_session_id=${sessionId}`, { cache: 'no-store' })
      if (!res.ok) {
        // 404 might indicate session was cancelled/deleted
        if (res.status === 404) {
          setIsCancelled(true)
        }
        throw new Error('Failed to fetch session stats')
      }
      return res.json()
    },
    enabled: sessionId !== null && !isCancelled,
    // Poll every 3 seconds while processing
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return 3000

      // Stop polling if cancelled or no photos are pending/processing
      if (isCancelled) return false
      const isStillProcessing = data.pending_photos > 0 || data.processing_photos > 0
      return isStillProcessing ? 3000 : false
    },
    staleTime: 1000, // Consider data stale after 1 second
  })

  // Auto-clear session when processing completes or is cancelled
  useEffect(() => {
    // Clear immediately if cancelled
    if (isCancelled) {
      clearBatch()
      return undefined
    }

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
  }, [statsData, isCancelled, clearBatch])

  const isProcessing = statsData
    ? (statsData.pending_photos > 0 || statsData.processing_photos > 0)
    : false

  return {
    batchId: sessionId,  // Return as batchId for backward compatibility
    stats: statsData ?? null,
    isLoading,
    isProcessing,
    isCancelled,
    clearBatch,
    cancelSession,
  }
}

/**
 * Set the active upload session ID in sessionStorage.
 * Call this once when upload starts (before batches are created).
 *
 * This is the preferred method - it properly tracks all batches in a session.
 */
export function setActiveUploadSessionId(sessionId: string): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(ACTIVE_SESSION_KEY, sessionId)
  }
}

/**
 * @deprecated Use setActiveUploadSessionId instead.
 * This function is kept for backward compatibility but now sets the session ID.
 */
export function setActiveBatchId(batchId: string): void {
  // For backward compatibility, treat batch ID as session ID
  // This works because the old code called this per-batch, and the last batch ID
  // would still be a valid UUID that can be used to look up stats
  // However, this won't aggregate properly - prefer setActiveUploadSessionId
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(ACTIVE_SESSION_KEY, batchId)
  }
}
