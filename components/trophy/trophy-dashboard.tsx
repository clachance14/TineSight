'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { SummaryStats } from './summary-stats'
import { PendingMatchesSection } from './pending-matches-section'
import { ClustersSection } from './clusters-section'
import { NameClusterDialog } from './name-cluster-dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { DashboardData, TrophyDetection } from '@/lib/services/trophy'
import { AlertCircle, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTriggerMatching } from '@/lib/hooks/use-matches'
import { useToast } from '@/lib/hooks/use-toast'

async function fetchDashboard(): Promise<DashboardData> {
  const response = await fetch('/api/trophy/dashboard')
  if (!response.ok) {
    throw new Error('Failed to fetch dashboard data')
  }
  return response.json()
}

async function confirmMatch(matchId: string): Promise<void> {
  const response = await fetch(`/api/deer/matches/${matchId}/confirm`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error('Failed to confirm match')
  }
}

async function rejectMatch(matchId: string): Promise<void> {
  const response = await fetch(`/api/deer/matches/${matchId}/reject`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error('Failed to reject match')
  }
}

async function batchConfirmMatches(matchIds: string[]): Promise<void> {
  const response = await fetch('/api/trophy/batch-confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ match_ids: matchIds }),
  })
  if (!response.ok) {
    throw new Error('Failed to batch confirm matches')
  }
}

async function batchRejectMatches(matchIds: string[]): Promise<void> {
  const response = await fetch('/api/trophy/batch-reject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ match_ids: matchIds }),
  })
  if (!response.ok) {
    throw new Error('Failed to batch reject matches')
  }
}

function UnsortedSection({ detections }: { detections: TrophyDetection[] }) {
  if (detections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-xl border border-cream/10 bg-slate px-10 py-8">
          <h3 className="font-display text-xl font-semibold text-cream">Nothing left to sort</h3>
          <p className="mx-auto mt-2 max-w-xs text-sm text-cream-dark">
            Every trophy detection is either named or grouped with a buck.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {detections.map((detection) => {
        const captured =
          detection.captured_at != null && detection.captured_at !== ''
            ? new Date(detection.captured_at).toLocaleDateString()
            : null
        return (
          <div
            key={detection.id}
            className="group overflow-hidden rounded-xl border border-cream/10 bg-slate"
          >
            <div className="relative aspect-square overflow-hidden bg-slate-light/40">
              {detection.thumbnail_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={detection.thumbnail_url}
                  alt="Unsorted trophy detection"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
            </div>
            <div className="flex items-center justify-between gap-2 bg-gradient-to-b from-slate to-slate-deep px-3 py-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-cream-dark">
                {detection.estimated_point_range != null && detection.estimated_point_range !== ''
                  ? `${detection.estimated_point_range} pts`
                  : (detection.antler_print?.scores.score_class ?? 'Trophy')}
              </span>
              {captured && (
                <span className="font-mono text-[10px] tabular-nums text-cream-dark/70">{captured}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function TrophyDashboard() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const triggerMatching = useTriggerMatching()
  const [activeSection, setActiveSection] = useState<'pending' | 'clusters' | 'unclustered'>('pending')
  const [namingClusterId, setNamingClusterId] = useState<string | null>(null)

  const clusterMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/deer/clusters', { method: 'POST' })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        throw new Error(data.error ?? 'Failed to start clustering')
      }
      return res.json()
    },
    onSuccess: () => {
      toast({
        title: 'Finding lookalikes',
        description: 'Grouping your trophy detections — new bucks appear here within a minute.',
      })
      queryClient.invalidateQueries({ queryKey: ['trophy-dashboard'] })
    },
    onError: (err: unknown) => {
      toast({
        title: 'Could not start clustering',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    },
  })

  const handleFindMatches = () => {
    triggerMatching.mutate(undefined, {
      onSuccess: (res: { detection_count: number; limited?: boolean }) => {
        toast({
          title: 'Matching queued',
          description: res.detection_count > 0
            ? `${res.detection_count} buck${res.detection_count === 1 ? '' : 's'} queued for re-ID${res.limited ? ' (batch capped — run again for more' : ''}${res.limited ? ')' : ''}. Results appear here within a minute.`
            : 'No fingerprinted bucks awaiting re-ID.',
        })
        queryClient.invalidateQueries({ queryKey: ['trophy-dashboard'] })
      },
      onError: (err: unknown) => {
        toast({
          title: 'Could not start matching',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        })
      },
    })
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['trophy-dashboard'],
    queryFn: fetchDashboard,
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  const confirmMutation = useMutation({
    mutationFn: confirmMatch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trophy-dashboard'] })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: rejectMatch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trophy-dashboard'] })
    },
  })

  const batchConfirmMutation = useMutation({
    mutationFn: batchConfirmMatches,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trophy-dashboard'] })
    },
  })

  const batchRejectMutation = useMutation({
    mutationFn: batchRejectMatches,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trophy-dashboard'] })
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} variant="elevated" className="py-4">
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <Card variant="elevated">
        <CardContent className="py-8 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-cream-dark">Failed to load trophy dashboard</p>
          <p className="text-sm text-muted-foreground mt-2">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  const hasPendingMatches = data.pendingGroups.length > 0
  const hasClusters = data.clusters.length > 0
  const hasUnclustered = data.unclustered.length > 0

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <SummaryStats stats={data.stats} />

      {/* Section Tabs */}
      <div className="flex gap-6 border-b border-cream/10">
        {([
          ['pending', 'Matches', data.stats.pendingMatchCount, hasPendingMatches],
          ['clusters', 'New Bucks', data.stats.clusterCount, hasClusters],
          ['unclustered', 'Unsorted', data.stats.unclusteredCount, hasUnclustered],
        ] as const).map(([key, label, count, show]) => (
          <button
            key={key}
            onClick={() => setActiveSection(key)}
            className={`-mb-px flex items-center gap-2 border-b-2 pb-2.5 font-sans text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors ${
              activeSection === key
                ? 'border-copper text-copper'
                : 'border-transparent text-cream-dark hover:text-cream'
            }`}
          >
            {label}
            {show && <span className="font-mono text-[11px] tabular-nums text-cream-dark/70">{count}</span>}
          </button>
        ))}
      </div>

      {/* Section Content */}
      <div>
        {activeSection === 'pending' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-semibold text-cream">
                  Matches
                </h2>
                <p className="text-sm text-cream-dark">
                  Confirm whether each detection is a buck already in your catalog.
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleFindMatches}
                disabled={triggerMatching.isPending}
              >
                <Sparkles className="h-4 w-4" />
                {triggerMatching.isPending ? 'Queuing…' : 'Find Matches'}
              </Button>
            </div>
            <PendingMatchesSection
              groups={data.pendingGroups}
              onConfirmMatch={(matchId) => confirmMutation.mutate(matchId)}
              onRejectMatch={(matchId) => rejectMutation.mutate(matchId)}
              onBatchConfirm={(matchIds) => batchConfirmMutation.mutate(matchIds)}
              onBatchReject={(matchIds) => batchRejectMutation.mutate(matchIds)}
            />
          </div>
        )}

        {activeSection === 'clusters' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-semibold text-cream">
                  New Bucks
                </h2>
                <p className="text-sm text-cream-dark">
                  Lookalike detections grouped as one unnamed buck — name a group to add it to your catalog.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => clusterMutation.mutate()}
                disabled={clusterMutation.isPending}
              >
                <Sparkles className="h-4 w-4" />
                {clusterMutation.isPending ? 'Grouping…' : 'Find lookalikes'}
              </Button>
            </div>
            <ClustersSection
              clusters={data.clusters}
              onNameCluster={(clusterId) => setNamingClusterId(clusterId)}
            />
          </div>
        )}

        {activeSection === 'unclustered' && (
          <div className="space-y-4">
            <div>
              <h2 className="font-display text-xl font-semibold text-cream">
                Unsorted
              </h2>
              <p className="text-sm text-cream-dark">
                Trophy detections not yet named or grouped with a buck.
              </p>
            </div>
            <UnsortedSection detections={data.unclustered} />
          </div>
        )}
      </div>

      <NameClusterDialog
        clusterId={namingClusterId}
        memberCount={data.clusters.find((c) => c.id === namingClusterId)?.member_count ?? 0}
        open={namingClusterId !== null}
        onOpenChange={(open) => { if (!open) setNamingClusterId(null) }}
      />
    </div>
  )
}
