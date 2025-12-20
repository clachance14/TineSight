'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/lib/hooks/use-toast'

interface PhotoDeleteButtonProps {
  photoId: string
  returnUrl?: string
}

export function PhotoDeleteButton({ photoId, returnUrl = '/photos' }: PhotoDeleteButtonProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [isDeleting, setIsDeleting] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/photos/${photoId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete photo')
      }

      // Invalidate all photo-related queries to ensure fresh data
      await queryClient.invalidateQueries({ queryKey: ['photos'] })

      toast({
        title: 'Photo Deleted',
        description: 'The photo and its detections have been permanently removed.',
      })

      router.push(returnUrl)
      router.refresh()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete photo',
        variant: 'destructive',
      })
      setIsDeleting(false)
      setIsOpen(false)
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="icon" className="text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/30">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-slate-deep border border-cream/20">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-cream">Delete Photo?</AlertDialogTitle>
          <AlertDialogDescription className="text-cream-dark">
            This will permanently delete this photo and all its detections. This action cannot be undone.
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
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isDeleting ? (
              <>
                <span className="animate-spin mr-2">&#8987;</span>
                Deleting...
              </>
            ) : (
              'Delete Photo'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
