'use client'

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
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-xl border border-cream/10 bg-slate px-10 py-8">
          <h3 className="font-display text-xl font-semibold text-cream">No new bucks suggested</h3>
          <p className="mx-auto mt-2 max-w-xs text-sm text-cream-dark">
            Run “Find lookalikes” after importing more trophy photos to group unnamed bucks here.
          </p>
        </div>
      </div>
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
