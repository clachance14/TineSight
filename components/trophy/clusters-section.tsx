'use client'

import { Card, CardContent } from '@/components/ui/card'
import { ClusterCard } from './cluster-card'
import type { TrophyCluster } from '@/lib/services/trophy'

interface ClustersSectionProps {
  clusters: TrophyCluster[]
  onNameCluster?: ((clusterId: string) => void) | undefined
  onViewDetails?: ((clusterId: string) => void) | undefined
}

export function ClustersSection({
  clusters,
  onNameCluster,
  onViewDetails,
}: ClustersSectionProps) {
  if (clusters.length === 0) {
    return (
      <Card variant="elevated">
        <CardContent className="py-8 text-center text-cream-dark">
          No pending clusters. Upload more trophy buck photos to auto-cluster similar deer.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {clusters.map((cluster) => (
        <ClusterCard
          key={cluster.id}
          cluster={cluster}
          onNameCluster={onNameCluster}
          onViewDetails={onViewDetails}
        />
      ))}
    </div>
  )
}
