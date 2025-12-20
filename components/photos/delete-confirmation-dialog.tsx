"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface DeleteConfirmationDialogProps {
  /**
   * Whether the dialog is open
   */
  open: boolean
  /**
   * Callback when the dialog open state changes
   */
  onOpenChange: (open: boolean) => void
  /**
   * Callback when the user confirms deletion
   */
  onConfirm: () => void
  /**
   * Whether deletion is in progress
   */
  isDeleting?: boolean
}

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  isDeleting = false,
}: DeleteConfirmationDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-slate-deep border border-cream/20">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-cream">Delete Detection?</AlertDialogTitle>
          <AlertDialogDescription className="text-cream-dark">
            This will permanently hide this detection from all views. This action marks the
            detection as a false positive and cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={isDeleting}
            className="border-cream/20 text-cream hover:bg-slate hover:text-cream"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isDeleting ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Deleting...
              </>
            ) : (
              'Delete Detection'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
