'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertTriangle, Loader2 } from 'lucide-react'

interface BulkDeleteModalProps {
  isOpen: boolean
  photoCount: number
  photoIds: string[]
  onClose: () => void
  onDeleted: () => void
}

export function BulkDeleteModal({
  isOpen,
  photoCount,
  photoIds,
  onClose,
  onDeleted,
}: BulkDeleteModalProps) {
  const [confirmText, setConfirmText] = useState('')

  // Require confirmation for > 10 photos
  const requiresConfirmation = photoCount > 10
  const isConfirmed = !requiresConfirmation || confirmText === 'DELETE'

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/photos/bulk-delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoIds }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete photos')
      }
      return res.json()
    },
    onSuccess: () => {
      onDeleted()
      handleClose()
    },
  })

  const handleClose = () => {
    setConfirmText('')
    onClose()
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <AlertDialogContent className="bg-slate-deep border-slate">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-cream flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            Delete {photoCount} Photo{photoCount !== 1 ? 's' : ''}?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-cream-dark">
            This action cannot be undone. All selected photos and their
            detections will be permanently deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {requiresConfirmation && (
          <div className="space-y-2 py-2">
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

        <AlertDialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={deleteMutation.isPending}
            className="text-cream-dark hover:text-cream hover:bg-slate"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteMutation.mutate()}
            disabled={!isConfirmed || deleteMutation.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              `Delete ${photoCount} Photo${photoCount !== 1 ? 's' : ''}`
            )}
          </Button>
        </AlertDialogFooter>

        {deleteMutation.error && (
          <p className="text-sm text-red-400 mt-2">
            {deleteMutation.error instanceof Error
              ? deleteMutation.error.message
              : 'An error occurred'}
          </p>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
