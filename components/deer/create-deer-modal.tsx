'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'

interface CreateDeerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  detectionId: string
  onSuccess?: (deer: { id: string; name: string }) => void
}

interface CreateDeerResponse {
  id: string
  name: string
}

interface ErrorResponse {
  error?: string
}

export function CreateDeerModal({
  open,
  onOpenChange,
  detectionId,
  onSuccess,
}: CreateDeerModalProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (): Promise<CreateDeerResponse> => {
      const res = await fetch('/api/deer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, notes: notes.length > 0 ? notes : null, detection_id: detectionId }),
      })
      if (!res.ok) {
        const data = (await res.json()) as ErrorResponse
        throw new Error(data.error ?? 'Failed to create deer')
      }
      return res.json() as Promise<CreateDeerResponse>
    },
    onSuccess: (deer: CreateDeerResponse) => {
      void queryClient.invalidateQueries({ queryKey: ['deer-catalog'] })
      setName('')
      setNotes('')
      setError(null)
      onOpenChange(false)
      onSuccess?.(deer)
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (name.trim().length === 0) {
      setError('Name is required')
      return
    }
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Name This Deer</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g., Big 12, Split Brow, etc."
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Any notes about this deer..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={3}
            />
          </div>
          {error !== null && error.length > 0 && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
