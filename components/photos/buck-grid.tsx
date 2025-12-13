'use client'

import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface Detection {
  id: string
  image_id: string
  species: string
  sex: string
  antler_points: number | null
  age_class: string | null
  gemini_confidence: number
  head_crop_url?: string
  thumbnail_url?: string
  deer?: {
    id: string
    name: string
  } | null
}

interface BuckGridProps {
  detections: Detection[]
  isLoading?: boolean
  onDetectionClick?: (detection: Detection) => void
}

export function BuckGrid({ detections, isLoading, onDetectionClick }: BuckGridProps) {
  // Filter to only bucks
  const bucks = detections.filter((d) => d.sex === 'buck')

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {[...Array(12)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-2">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="mt-2 h-4 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (bucks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-lg bg-slate/50 px-8 py-6">
          <h3 className="text-lg font-medium text-cream">No bucks found</h3>
          <p className="mt-2 text-sm text-cream-dark">
            Upload and analyze photos to find bucks in your collection.
          </p>
        </div>
      </div>
    )
  }

  // Sort by points (highest first), then by confidence
  const sortedBucks = [...bucks].sort((a, b) => {
    if ((b.antler_points ?? 0) !== (a.antler_points ?? 0)) {
      return (b.antler_points ?? 0) - (a.antler_points ?? 0)
    }
    return b.gemini_confidence - a.gemini_confidence
  })

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {sortedBucks.map((detection) => (
        <Card
          key={detection.id}
          className={cn(
            'cursor-pointer transition-all hover:ring-2 hover:ring-copper',
            detection.deer && 'ring-1 ring-green-500/50'
          )}
          onClick={() => onDetectionClick?.(detection)}
        >
          <CardContent className="p-2">
            {/* Head crop or thumbnail */}
            <div className="relative aspect-square overflow-hidden rounded-lg bg-slate">
              {detection.head_crop_url || detection.thumbnail_url ? (
                <Image
                  src={detection.head_crop_url || detection.thumbnail_url || ''}
                  alt={`Buck ${detection.antler_points ?? '?'} points`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                  unoptimized
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <span className="text-4xl">🦌</span>
                </div>
              )}

              {/* Points badge */}
              {detection.antler_points !== null && (
                <div className="absolute right-1 top-1">
                  <Badge
                    variant={detection.antler_points >= 10 ? 'default' : 'secondary'}
                    className={cn(
                      detection.antler_points >= 10 && 'bg-copper text-cream'
                    )}
                  >
                    {detection.antler_points}pt
                  </Badge>
                </div>
              )}

              {/* Assigned deer indicator */}
              {detection.deer && (
                <div className="absolute bottom-1 left-1">
                  <Badge variant="success" className="text-xs">
                    {detection.deer.name}
                  </Badge>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {detection.age_class || 'Unknown age'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {detection.gemini_confidence}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
