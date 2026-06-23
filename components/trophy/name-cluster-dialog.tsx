'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

/**
 * Name a suggested cluster, turning the whole group into one catalogued Buck
 * (Phase 1 cold-start bootstrap). POSTs to /api/deer/clusters/[id]/name, which
 * creates the deer and links every member detection as a Sighting.
 */
export function NameClusterDialog({
  clusterId,
  memberCount,
  open,
  onOpenChange,
}: {
  clusterId: string | null
  memberCount: number
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (): Promise<{ deer: { id: string } }> => {
      if (clusterId == null) throw new Error('No cluster selected')
      const res = await fetch(`/api/deer/clusters/${clusterId}/name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to name cluster')
      }
      return res.json() as Promise<{ deer: { id: string } }>
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trophy-dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['deer-catalog'] })
      setName('')
      setError(null)
      onOpenChange(false)
    },
    onError: (err: Error) => setError(err.message),
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
          <DialogTitle>Name this buck</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-cream-dark">
          Naming this group adds {memberCount} sighting{memberCount === 1 ? '' : 's'} to a new buck in your catalog.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cluster-name">Name</Label>
            <Input
              id="cluster-name"
              placeholder="e.g., Big 12, Split Brow…"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              maxLength={100}
              autoFocus
            />
          </div>
          {error !== null && error.length > 0 && <p className="text-sm text-red-400">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create buck
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
