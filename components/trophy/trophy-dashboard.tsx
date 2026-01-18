'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { SummaryStats } from './summary-stats'
import { PendingMatchesSection } from './pending-matches-section'
import { ClustersSection } from './clusters-section'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { DashboardData, TrophyDetection } from '@/lib/services/trophy'
import Image from 'next/image'
import { AlertCircle } from 'lucide-react'
import { useState } from 'react'

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

function UnclusteredSection({ detections }: { detections: TrophyDetection[] }) {
  if (detections.length === 0) {
    return (
      <Card variant="elevated">
        <CardContent className="py-8 text-center text-cream-dark">
          No unclustered detections. All trophy bucks are either assigned to deer or grouped in clusters.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {detections.map((detection) => (
        <div key={detection.id} className="space-y-2">
          <div className="relative aspect-square rounded-lg overflow-hidden bg-slate/30">
            {detection.thumbnail_url && (
              <Image
                src={detection.thumbnail_url}
                alt="Unclustered detection"
                fill
                className="object-cover"
              />
            )}
          </div>
          <div className="space-y-1">
            {detection.antler_print?.scores.score_class && (
              <Badge variant="outline" className="text-xs">
                {detection.antler_print.scores.score_class}
              </Badge>
            )}
            {detection.estimated_point_range && (
              <p className="text-xs text-cream-dark">
                {detection.estimated_point_range} pts
              </p>
            )}
            {detection.captured_at && (
              <p className="text-xs text-muted-foreground">
                {new Date(detection.captured_at).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export function TrophyDashboard() {
  const queryClient = useQueryClient()
  const [activeSection, setActiveSection] = useState<'pending' | 'clusters' | 'unclustered'>('pending')

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
      <div className="flex gap-2 border-b border-slate/20">
        <button
          onClick={() => setActiveSection('pending')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeSection === 'pending'
              ? 'text-copper border-b-2 border-copper'
              : 'text-cream-dark hover:text-cream'
          }`}
        >
          Pending Matches
          {hasPendingMatches && (
            <Badge variant="warning" className="ml-2">
              {data.stats.pendingMatchCount}
            </Badge>
          )}
        </button>
        <button
          onClick={() => setActiveSection('clusters')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeSection === 'clusters'
              ? 'text-copper border-b-2 border-copper'
              : 'text-cream-dark hover:text-cream'
          }`}
        >
          Suggested Clusters
          {hasClusters && (
            <Badge variant="secondary" className="ml-2">
              {data.stats.clusterCount}
            </Badge>
          )}
        </button>
        <button
          onClick={() => setActiveSection('unclustered')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeSection === 'unclustered'
              ? 'text-copper border-b-2 border-copper'
              : 'text-cream-dark hover:text-cream'
          }`}
        >
          Unclustered
          {hasUnclustered && (
            <Badge variant="outline" className="ml-2">
              {data.stats.unclusteredCount}
            </Badge>
          )}
        </button>
      </div>

      {/* Section Content */}
      <div>
        {activeSection === 'pending' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-cream">
                Pending Matches
              </h2>
              <p className="text-sm text-cream-dark">
                Review AI-suggested matches for your trophy bucks
              </p>
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
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-cream">
                Suggested Clusters
              </h2>
              <p className="text-sm text-cream-dark">
                Auto-grouped trophy detections based on antler prints
              </p>
            </div>
            <ClustersSection
              clusters={data.clusters}
              onNameCluster={(clusterId) => {
                // TODO: Implement name cluster modal
                console.log('Name cluster:', clusterId)
              }}
              onViewDetails={(clusterId) => {
                // TODO: Implement cluster details modal
                console.log('View cluster details:', clusterId)
              }}
            />
          </div>
        )}

        {activeSection === 'unclustered' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-cream">
                Unclustered Detections
              </h2>
              <p className="text-sm text-cream-dark">
                Trophy bucks not yet assigned or clustered
              </p>
            </div>
            <UnclusteredSection detections={data.unclustered} />
          </div>
        )}
      </div>
    </div>
  )
}
