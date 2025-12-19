'use client'

import { useMemo, memo } from 'react'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { BLUR_DATA_URL } from '@/lib/constants/image'

// Size class ordering for sorting
const SIZE_CLASS_ORDER: Record<string, number> = {
  trophy: 4,
  standard: 3,
  basket: 2,
  spike: 1,
  unknown: 0
}

interface Detection {
  id: string
  image_id: string
  species: string
  sex: string
  size_class: string | null
  estimated_point_range: string | null
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

  // Sort by size class (trophy > standard > basket > spike > unknown), then by confidence
  // Memoized to prevent re-sorting on every render
  const sortedBucks = useMemo(() => {
    return [...bucks].sort((a, b) => {
      const sizeA = SIZE_CLASS_ORDER[a.size_class?.toLowerCase() ?? 'unknown'] ?? 0
      const sizeB = SIZE_CLASS_ORDER[b.size_class?.toLowerCase() ?? 'unknown'] ?? 0
      if (sizeB !== sizeA) {
        return sizeB - sizeA
      }
      return b.gemini_confidence - a.gemini_confidence
    })
  }, [bucks])

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
                  alt={`${detection.size_class ? detection.size_class.charAt(0).toUpperCase() + detection.size_class.slice(1) : 'Unknown'} buck`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                  placeholder="blur"
                  blurDataURL={BLUR_DATA_URL}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <span className="text-4xl">🦌</span>
                </div>
              )}

              {/* Size class badge */}
              {detection.size_class && (
                <div className="absolute right-1 top-1">
                  <Badge
                    variant={detection.size_class.toLowerCase() === 'trophy' ? 'default' : 'secondary'}
                    className={cn(
                      detection.size_class.toLowerCase() === 'trophy' && 'bg-copper text-cream'
                    )}
                  >
                    {detection.size_class.charAt(0).toUpperCase() + detection.size_class.slice(1)}
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
