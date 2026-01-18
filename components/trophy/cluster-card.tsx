'use client'

import Image from 'next/image'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { TrophyCluster } from '@/lib/services/trophy'
import { Users, TrendingUp } from 'lucide-react'

interface ClusterCardProps {
  cluster: TrophyCluster
  onNameCluster?: ((clusterId: string) => void) | undefined
  onViewDetails?: ((clusterId: string) => void) | undefined
}

export function ClusterCard({ cluster, onNameCluster, onViewDetails }: ClusterCardProps) {
  const avgSimilarity = cluster.avg_similarity
    ? Math.round(cluster.avg_similarity * 100)
    : null

  return (
    <Card variant="elevated">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            Cluster {cluster.id.slice(0, 8)}
          </CardTitle>
          {avgSimilarity !== null && (
            <Badge variant={avgSimilarity >= 85 ? 'success' : 'secondary'}>
              <TrendingUp className="h-3 w-3 mr-1" />
              {avgSimilarity}% match
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Representative image */}
        {cluster.representative_crop_url && (
          <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-slate/30">
            <Image
              src={cluster.representative_crop_url}
              alt="Cluster representative"
              fill
              className="object-cover"
            />
          </div>
        )}

        {/* Member count */}
        <div className="flex items-center gap-2 text-sm text-cream-dark">
          <Users className="h-4 w-4" />
          <span>{cluster.member_count} detection{cluster.member_count !== 1 ? 's' : ''}</span>
        </div>

        {/* Member thumbnails preview */}
        {cluster.members.length > 0 && (
          <div className="grid grid-cols-5 gap-1">
            {cluster.members.slice(0, 5).map((member) => (
              <div
                key={member.id}
                className="relative aspect-square rounded overflow-hidden bg-slate/30"
              >
                {member.thumbnail_url && (
                  <Image
                    src={member.thumbnail_url}
                    alt="Member"
                    fill
                    className="object-cover"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            onClick={() => onNameCluster?.(cluster.id)}
          >
            Name This Deer
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewDetails?.(cluster.id)}
          >
            Review
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
