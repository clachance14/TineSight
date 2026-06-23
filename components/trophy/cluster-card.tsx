'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { TrophyCluster } from '@/lib/services/trophy'

interface ClusterCardProps {
  cluster: TrophyCluster
  onNameCluster?: ((clusterId: string) => void) | undefined
  onViewDetails?: ((clusterId: string) => void) | undefined
}

/**
 * A suggested new buck: a group of lookalike trophy detections the AI believes
 * are one individual, awaiting a name. Naming it creates the Buck (CONTEXT.md).
 */
export function ClusterCard({ cluster, onNameCluster, onViewDetails }: ClusterCardProps): React.JSX.Element {
  const avgSimilarity = cluster.avg_similarity != null ? Math.round(cluster.avg_similarity * 100) : null

  return (
    <Card variant="elevated" className="overflow-hidden p-0">
      {/* Representative image — the buck is the card */}
      <div className="relative aspect-square w-full overflow-hidden bg-slate-light/40">
        {cluster.representative_crop_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cluster.representative_crop_url}
            alt="Suggested new buck"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/10" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-brass-light/90 drop-shadow-[0_1px_8px_rgba(0,0,0,0.7)]">
              Possible new buck
            </div>
            <div className="font-display text-[17px] font-semibold leading-tight text-cream drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]">
              {cluster.member_count} detection{cluster.member_count !== 1 ? 's' : ''}
            </div>
          </div>
          {avgSimilarity !== null && (
            <div className="flex-none rounded border border-copper/45 bg-gradient-to-b from-copper/20 to-copper/[0.04] px-2 py-1 text-right backdrop-blur-sm">
              <div className="font-mono text-[8px] uppercase leading-none tracking-[0.14em] text-brass-light/80">Alike</div>
              <div className="font-mono text-lg font-bold leading-none tabular-nums text-brass-light">{avgSimilarity}</div>
            </div>
          )}
        </div>
      </div>

      <CardContent className="space-y-3 p-3">
        {/* Member thumbnails preview */}
        {cluster.members.length > 0 && (
          <div className="grid grid-cols-5 gap-1">
            {cluster.members.slice(0, 5).map((member) => (
              <div
                key={member.id}
                className="relative aspect-square overflow-hidden rounded bg-slate-light/40"
              >
                {member.thumbnail_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={member.thumbnail_url} alt="Member detection" className="absolute inset-0 h-full w-full object-cover" />
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
            Name this buck
          </Button>
          <Button variant="outline" size="sm" onClick={() => onViewDetails?.(cluster.id)}>
            Review
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
