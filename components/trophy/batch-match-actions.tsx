'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, X, Loader2 } from 'lucide-react'
import { useBatchSelectionStore } from '@/lib/stores/batch-selection'
import { cn } from '@/lib/utils'
import { useToast } from '@/lib/hooks/use-toast'

interface BatchMatchActionsProps {
  /**
   * List of all match IDs available for selection
   * Used to enable "Select All" functionality
   */
  availableMatchIds: string[]

  /**
   * Callback fired after successful batch operation
   * Used to refresh the match list or update UI
   */
  onSuccess?: () => void

  /**
   * Optional CSS class name
   */
  className?: string
}

/**
 * BatchMatchActions Component
 *
 * Provides batch operations for trophy match candidates:
 * - Shows count of selected matches
 * - Confirm All button (green) - accepts all selected matches
 * - Reject All button (red) - rejects all selected matches
 * - Clear Selection button - deselects all
 * - Select All button - selects all available matches
 *
 * Uses:
 * - useBatchSelectionStore for selection state
 * - TanStack Query for mutations
 * - Toast notifications for feedback
 */
export function BatchMatchActions({
  availableMatchIds,
  onSuccess,
  className,
}: BatchMatchActionsProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [isSelectingAll, setIsSelectingAll] = useState(false)

  const {
    selectedMatchIds,
    clearSelection,
    selectAll,
    getSelectedCount,
  } = useBatchSelectionStore()

  const selectedCount = getSelectedCount()
  const allSelected = selectedCount === availableMatchIds.length && availableMatchIds.length > 0

  // Batch confirm mutation
  const confirmMutation = useMutation({
    mutationFn: async (matchIds: string[]) => {
      const response = await fetch('/api/trophy/batch-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_ids: matchIds }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to confirm matches')
      }

      return response.json()
    },
    onSuccess: (data) => {
      toast({
        title: 'Matches confirmed',
        description: `Successfully confirmed ${data.confirmed_count} match${data.confirmed_count !== 1 ? 'es' : ''}`,
      })
      clearSelection()
      queryClient.invalidateQueries({ queryKey: ['trophy-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['pending-matches'] })
      onSuccess?.()
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to confirm matches',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  // Batch reject mutation
  const rejectMutation = useMutation({
    mutationFn: async (matchIds: string[]) => {
      const response = await fetch('/api/trophy/batch-reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_ids: matchIds }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to reject matches')
      }

      return response.json()
    },
    onSuccess: (data) => {
      toast({
        title: 'Matches rejected',
        description: `Successfully rejected ${data.rejected_count} match${data.rejected_count !== 1 ? 'es' : ''}`,
      })
      clearSelection()
      queryClient.invalidateQueries({ queryKey: ['trophy-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['pending-matches'] })
      onSuccess?.()
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to reject matches',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const handleConfirmAll = () => {
    const matchIds = Array.from(selectedMatchIds)
    confirmMutation.mutate(matchIds)
  }

  const handleRejectAll = () => {
    const matchIds = Array.from(selectedMatchIds)
    rejectMutation.mutate(matchIds)
  }

  const handleSelectAll = () => {
    setIsSelectingAll(true)
    selectAll(availableMatchIds)
    // Small delay for visual feedback
    setTimeout(() => setIsSelectingAll(false), 200)
  }

  const isLoading = confirmMutation.isPending || rejectMutation.isPending

  if (availableMatchIds.length === 0) {
    return null
  }

  return (
    <div className={cn('flex items-center justify-between gap-4 p-4 rounded-lg bg-slate/30 border border-slate/50', className)}>
      {/* Selection count and controls */}
      <div className="flex items-center gap-3">
        <div className="text-sm">
          <span className="font-medium text-cream">{selectedCount}</span>
          <span className="text-cream-dark ml-1">
            of {availableMatchIds.length} selected
          </span>
        </div>

        {selectedCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            disabled={isLoading}
            className="h-7"
          >
            <X className="h-3.5 w-3.5 mr-1.5" />
            Clear
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSelectAll}
            disabled={isLoading || allSelected || isSelectingAll}
            className="h-7"
          >
            {isSelectingAll ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            )}
            Select All
          </Button>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={handleConfirmAll}
          disabled={selectedCount === 0 || isLoading}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          {confirmMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mr-2" />
          )}
          Confirm All ({selectedCount})
        </Button>

        <Button
          variant="destructive"
          size="sm"
          onClick={handleRejectAll}
          disabled={selectedCount === 0 || isLoading}
        >
          {rejectMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <XCircle className="h-4 w-4 mr-2" />
          )}
          Reject All ({selectedCount})
        </Button>
      </div>
    </div>
  )
}
