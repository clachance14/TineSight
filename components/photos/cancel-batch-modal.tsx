'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertTriangle, Loader2 } from 'lucide-react'

interface CancelBatchModalProps {
  sessionId: string
  isOpen: boolean
  onClose: () => void
  onCancelled: () => void
}

interface SessionStats {
  total_photos: number
  analyzed_photos: number
  pending_photos: number
  processing_photos: number
  failed_photos: number
  photos_with_deer?: number
}

export function CancelBatchModal({
  sessionId,
  isOpen,
  onClose,
  onCancelled,
}: CancelBatchModalProps) {
  const [deleteScope, setDeleteScope] = useState<'pending' | 'all'>('pending')
  const [confirmText, setConfirmText] = useState('')
  const queryClient = useQueryClient()

  // Fetch current stats
  const { data: stats, isLoading: statsLoading } = useQuery<SessionStats>({
    queryKey: ['photos', 'stats', 'session', sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/photos/stats?upload_session_id=${sessionId}`)
      if (!res.ok) throw new Error('Failed to fetch stats')
      return res.json()
    },
    enabled: isOpen && !!sessionId,
  })

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/upload-sessions/${sessionId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteScope }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to cancel')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['photos'] })
      onCancelled()
      onClose()
    },
  })

  const pendingCount = (stats?.pending_photos ?? 0) + (stats?.processing_photos ?? 0)
  const completedCount = stats?.analyzed_photos ?? 0
  const totalCount = stats?.total_photos ?? 0
  const deerCount = stats?.photos_with_deer ?? 0

  const isDeleteAllConfirmed = deleteScope === 'all' && confirmText.toUpperCase() === 'DELETE'
  const canSubmit = deleteScope === 'pending' || isDeleteAllConfirmed

  const handleClose = () => {
    setDeleteScope('pending')
    setConfirmText('')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md bg-slate-deep border-slate">
        <DialogHeader>
          <DialogTitle className="text-cream flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Cancel Processing
          </DialogTitle>
          <DialogDescription className="text-cream-dark">
            Stop processing and optionally delete photos
          </DialogDescription>
        </DialogHeader>

        {statsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-cream-dark" />
          </div>
        ) : (
          <>
            <div className="space-y-3 py-2 text-sm text-cream-dark">
              <p>This upload has:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li className="text-green-400">
                  {completedCount} completed photos
                  {deerCount > 0 && ` (${deerCount} with deer)`}
                </li>
                <li className="text-yellow-400">
                  {pendingCount} pending/processing photos
                </li>
                {(stats?.failed_photos ?? 0) > 0 && (
                  <li className="text-red-400">
                    {stats?.failed_photos} failed photos
                  </li>
                )}
              </ul>
            </div>

            <RadioGroup
              value={deleteScope}
              onValueChange={(v) => setDeleteScope(v as 'pending' | 'all')}
              className="space-y-3"
            >
              <div className="flex items-start space-x-3 p-3 rounded-lg bg-slate hover:bg-slate/80 cursor-pointer">
                <RadioGroupItem value="pending" id="pending" className="mt-0.5" />
                <div className="space-y-1">
                  <Label htmlFor="pending" className="text-cream cursor-pointer">
                    Delete only pending photos ({pendingCount} photos)
                  </Label>
                  <p className="text-xs text-cream-dark">
                    Keeps {completedCount} completed photos
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3 rounded-lg bg-slate hover:bg-slate/80 cursor-pointer">
                <RadioGroupItem value="all" id="all" className="mt-0.5" />
                <div className="space-y-1">
                  <Label htmlFor="all" className="text-cream cursor-pointer">
                    Delete ALL photos ({totalCount} photos)
                  </Label>
                  <p className="text-xs text-red-400">
                    This cannot be undone
                  </p>
                </div>
              </div>
            </RadioGroup>

            {deleteScope === 'all' && (
              <div className="space-y-2 pt-2">
                <Label htmlFor="confirm" className="text-cream-dark text-sm">
                  Type &quot;DELETE&quot; to confirm
                </Label>
                <Input
                  id="confirm"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="bg-slate border-slate text-cream"
                />
              </div>
            )}
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={cancelMutation.isPending}
            className="text-cream-dark hover:text-cream hover:bg-slate"
          >
            Keep Processing
          </Button>
          <Button
            variant="destructive"
            onClick={() => cancelMutation.mutate()}
            disabled={!canSubmit || cancelMutation.isPending || statsLoading}
            className="bg-red-600 hover:bg-red-700"
          >
            {cancelMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cancelling...
              </>
            ) : (
              'Cancel & Delete'
            )}
          </Button>
        </DialogFooter>

        {cancelMutation.error && (
          <p className="text-sm text-red-400 mt-2">
            {cancelMutation.error instanceof Error
              ? cancelMutation.error.message
              : 'An error occurred'}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
