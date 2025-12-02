'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { RefreshCw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RetryButtonProps {
  photoId: string
  batchId?: string
  onRetrySuccess?: () => void
  onRetryAllSuccess?: () => void
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
}

/**
 * RetryButton Component
 *
 * Provides retry functionality for failed photo processing.
 * Supports both single photo retry and batch retry operations.
 *
 * @param photoId - ID of the photo to retry
 * @param batchId - Optional batch ID for "Retry All Failed" option
 * @param onRetrySuccess - Callback fired after successful single retry
 * @param onRetryAllSuccess - Callback fired after successful batch retry
 * @param variant - Button variant (default, outline, ghost)
 * @param size - Button size (default, sm, lg, icon)
 * @param className - Additional CSS classes
 */
export function RetryButton({
  photoId,
  batchId,
  onRetrySuccess,
  onRetryAllSuccess,
  variant = 'outline',
  size = 'sm',
  className,
}: RetryButtonProps) {
  const [showBatchOption, setShowBatchOption] = useState(false)

  // Single photo retry mutation
  const retryMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/photos/${id}/retry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to retry photo processing')
      }

      return response.json()
    },
    onSuccess: () => {
      onRetrySuccess?.()
    },
  })

  // Batch retry mutation
  const retryAllMutation = useMutation({
    mutationFn: async (bId: string) => {
      const response = await fetch(`/api/photos/${photoId}/retry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batchId: bId }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to retry batch processing')
      }

      return response.json()
    },
    onSuccess: () => {
      setShowBatchOption(false)
      onRetryAllSuccess?.()
    },
  })

  const handleRetry = () => {
    if (batchId && !showBatchOption) {
      // Show batch option if batchId is provided
      setShowBatchOption(true)
    } else {
      // Retry single photo
      retryMutation.mutate(photoId)
      setShowBatchOption(false)
    }
  }

  const handleRetryAll = () => {
    if (batchId) {
      retryAllMutation.mutate(batchId)
    }
  }

  const isLoading = retryMutation.isPending || retryAllMutation.isPending

  // Show batch options when batchId is provided and user clicked once
  if (showBatchOption && batchId) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant={variant}
          size={size}
          onClick={handleRetry}
          disabled={isLoading}
          className={cn('gap-1.5', className)}
        >
          {retryMutation.isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Retrying...</span>
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry This</span>
            </>
          )}
        </Button>
        <Button
          variant="destructive"
          size={size}
          onClick={handleRetryAll}
          disabled={isLoading}
          className={cn('gap-1.5', className)}
        >
          {retryAllMutation.isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Retrying All...</span>
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry All Failed</span>
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size={size}
          onClick={() => setShowBatchOption(false)}
          disabled={isLoading}
          className="text-xs"
        >
          Cancel
        </Button>
      </div>
    )
  }

  // Default single button view
  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleRetry}
      disabled={isLoading}
      className={cn('gap-1.5', className)}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Retrying...</span>
        </>
      ) : (
        <>
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Retry</span>
        </>
      )}
    </Button>
  )
}
