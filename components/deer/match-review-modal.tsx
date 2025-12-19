'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Check, X, SkipForward, Plus, ArrowRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MatchReview {
  id: string
  detection: {
    id: string
    image_url?: string
    thumbnail_url?: string
    species: string
    sex: string
    size_class: string | null
    estimated_point_range: string | null
    age_class: string | null
  }
  suggested_deer: {
    id: string
    name: string
    reference_image_url?: string
  } | null
  gemini_confidence: number
  gemini_reasoning: string | null
  other_possibilities: Array<{
    deer_id: string
    deer_name: string
    confidence: number
  }>
  is_likely_new_deer: boolean
  catalog_deer: Array<{
    id: string
    name: string
    reference_image_url?: string
  }>
}

interface MatchReviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  match: MatchReview | null
  onComplete?: () => void
}

export function MatchReviewModal({
  open,
  onOpenChange,
  match,
  onComplete,
}: MatchReviewModalProps) {
  const [showCreateNew, setShowCreateNew] = useState(false)
  const [newDeerName, setNewDeerName] = useState('')
  const queryClient = useQueryClient()

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/deer/matches/${match?.id}/confirm`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to confirm')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-matches'] })
      queryClient.invalidateQueries({ queryKey: ['deer-catalog'] })
      onComplete?.()
    },
  })

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/deer/matches/${match?.id}/reject`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to reject')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-matches'] })
      onComplete?.()
    },
  })

  const skipMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/deer/matches/${match?.id}/skip`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to skip')
      return res.json()
    },
    onSuccess: () => {
      onComplete?.()
    },
  })

  const createNewMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`/api/deer/matches/${match?.id}/create-new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error('Failed to create')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-matches'] })
      queryClient.invalidateQueries({ queryKey: ['deer-catalog'] })
      setShowCreateNew(false)
      setNewDeerName('')
      onComplete?.()
    },
  })

  const correctMutation = useMutation({
    mutationFn: async (deerId: string) => {
      const res = await fetch(`/api/deer/matches/${match?.id}/correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deer_id: deerId }),
      })
      if (!res.ok) throw new Error('Failed to correct')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-matches'] })
      queryClient.invalidateQueries({ queryKey: ['deer-catalog'] })
      onComplete?.()
    },
  })

  const isPending = confirmMutation.isPending || rejectMutation.isPending ||
                    skipMutation.isPending || createNewMutation.isPending ||
                    correctMutation.isPending

  if (!match) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Review Match Suggestion</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Side by side comparison */}
          <div className="grid grid-cols-2 gap-6">
            {/* Detection */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-muted-foreground">New Detection</h3>
              <div className="relative aspect-square rounded-lg bg-slate overflow-hidden">
                {match.detection.thumbnail_url ? (
                  <Image
                    src={match.detection.thumbnail_url}
                    alt="Detection"
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 50vw, 300px"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-4xl">🦌</div>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {match.detection.size_class && (
                  <Badge
                    variant={match.detection.size_class.toLowerCase() === 'trophy' ? 'default' : 'secondary'}
                    className={cn(
                      match.detection.size_class.toLowerCase() === 'trophy' && 'bg-copper text-cream'
                    )}
                  >
                    {match.detection.size_class.charAt(0).toUpperCase() + match.detection.size_class.slice(1)}
                  </Badge>
                )}
                {match.detection.estimated_point_range && (
                  <Badge variant="outline" className="text-xs">
                    {match.detection.estimated_point_range}
                  </Badge>
                )}
                <Badge variant="secondary">{match.detection.age_class || 'Unknown age'}</Badge>
              </div>
            </div>

            {/* Arrow */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
              <ArrowRight className="h-8 w-8 text-copper" />
            </div>

            {/* Suggested deer */}
            <div className="space-y-3">
              <h3 className="font-medium text-sm text-muted-foreground">
                {match.suggested_deer ? `Suggested: ${match.suggested_deer.name}` : 'No match found'}
              </h3>
              <div className="relative aspect-square rounded-lg bg-slate overflow-hidden">
                {match.suggested_deer?.reference_image_url ? (
                  <Image
                    src={match.suggested_deer.reference_image_url}
                    alt={match.suggested_deer.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 50vw, 300px"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    No reference
                  </div>
                )}
              </div>
              {match.suggested_deer && (
                <Badge
                  variant={match.gemini_confidence >= 70 ? 'default' : 'secondary'}
                  className={cn(match.gemini_confidence >= 70 && 'bg-green-600')}
                >
                  {match.gemini_confidence}% confidence
                </Badge>
              )}
            </div>
          </div>

          {/* AI reasoning */}
          {match.gemini_reasoning && (
            <div className="rounded-lg bg-slate/50 p-4">
              <h4 className="text-sm font-medium mb-2">AI Reasoning</h4>
              <p className="text-sm text-muted-foreground">{match.gemini_reasoning}</p>
            </div>
          )}

          {/* New deer form */}
          {showCreateNew && (
            <div className="rounded-lg border p-4 space-y-3">
              <Label htmlFor="new-deer-name">Name this deer</Label>
              <div className="flex gap-2">
                <Input
                  id="new-deer-name"
                  value={newDeerName}
                  onChange={(e) => setNewDeerName(e.target.value)}
                  placeholder="e.g., Big 12"
                />
                <Button
                  onClick={() => createNewMutation.mutate(newDeerName)}
                  disabled={!newDeerName.trim() || createNewMutation.isPending}
                >
                  {createNewMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create
                </Button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => skipMutation.mutate()}
                disabled={isPending}
              >
                <SkipForward className="mr-2 h-4 w-4" />
                Skip
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowCreateNew(!showCreateNew)}
                disabled={isPending}
              >
                <Plus className="mr-2 h-4 w-4" />
                New Deer
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={() => rejectMutation.mutate()}
                disabled={isPending}
              >
                <X className="mr-2 h-4 w-4" />
                Reject
              </Button>
              {match.suggested_deer && (
                <Button
                  onClick={() => confirmMutation.mutate()}
                  disabled={isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {confirmMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Check className="mr-2 h-4 w-4" />
                  Confirm
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
