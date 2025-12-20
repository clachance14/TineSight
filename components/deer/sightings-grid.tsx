'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BLUR_DATA_URL } from '@/lib/constants/image'

interface Sighting {
  id: string
  image_id: string
  thumbnail_url?: string
  captured_at?: string
  size_class?: string
}

interface SightingsGridProps {
  sightings: Sighting[]
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function SightingsGrid({
  sightings,
  page,
  totalPages,
  onPageChange,
}: SightingsGridProps): React.JSX.Element {
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown date'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  if (sightings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-lg bg-slate/50 px-8 py-6">
          <span className="text-4xl">📷</span>
          <h3 className="mt-4 text-lg font-medium text-cream">
            No sightings yet
          </h3>
          <p className="mt-2 text-sm text-cream-dark">
            Sightings will appear here as you confirm detections.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {sightings.map((sighting) => (
          <Link key={sighting.id} href={`/photos/${sighting.image_id}`}>
            <Card className="cursor-pointer transition-all hover:ring-2 hover:ring-copper">
              <CardContent className="p-2">
                <div className="relative aspect-square overflow-hidden rounded-lg bg-slate">
                  {sighting.thumbnail_url ? (
                    <Image
                      src={sighting.thumbnail_url}
                      alt={`Sighting from ${formatDate(sighting.captured_at)}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      placeholder="blur"
                      blurDataURL={BLUR_DATA_URL}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="text-2xl">🦌</span>
                    </div>
                  )}
                </div>
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-cream-dark">
                    {formatDate(sighting.captured_at)}
                  </p>
                  {sighting.size_class && (
                    <Badge
                      variant={sighting.size_class.toLowerCase() === 'trophy' ? 'default' : 'secondary'}
                      className={cn(
                        'text-xs',
                        sighting.size_class.toLowerCase() === 'trophy' && 'bg-copper text-cream'
                      )}
                    >
                      {sighting.size_class.charAt(0).toUpperCase() + sighting.size_class.slice(1)}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-cream-dark">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
