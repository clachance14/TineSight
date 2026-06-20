'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, Plus } from 'lucide-react'

interface DeerProfile {
  id: string
  name: string
  notes: string | null
  sighting_count: number
  reference_image_url?: string | null
  reference_bbox?: {
    x: number | null
    y: number | null
    width: number | null
    height: number | null
  } | null
  created_at: string
}

interface DeerCatalogProps {
  onDeerClick?: (deer: DeerProfile) => void
  onCreateClick?: () => void
}

export function DeerCatalog({ onDeerClick, onCreateClick }: DeerCatalogProps): React.JSX.Element {
  const [search, setSearch] = useState('')

  const { data, isLoading, error } = useQuery<{ deer: DeerProfile[] }>({
    queryKey: ['deer-catalog', search],
    queryFn: async (): Promise<{ deer: DeerProfile[] }> => {
      const url = search.length > 0 ? `/api/deer?search=${encodeURIComponent(search)}` : '/api/deer'
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch catalog')
      return res.json() as Promise<{ deer: DeerProfile[] }>
    },
  })

  const deer = data?.deer ?? []

  if (error) {
    return (
      <div className="text-center py-8 text-red-500">
        Failed to load deer catalog
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search deer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={onCreateClick} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Deer
        </Button>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Card key={i}>
              <CardContent className="p-3">
                <Skeleton className="aspect-square w-full rounded-lg" />
                <Skeleton className="mt-3 h-5 w-24" />
                <Skeleton className="mt-1 h-4 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : deer.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-lg bg-slate/50 px-8 py-6">
            <span className="text-4xl">🦌</span>
            <h3 className="mt-4 text-lg font-medium text-cream">
              {search.length > 0 ? 'No deer found' : 'Your catalog is empty'}
            </h3>
            <p className="mt-2 text-sm text-cream-dark">
              {search.length > 0
                ? 'Try a different search term.'
                : 'Name your first buck to start building your catalog.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {deer.map((d) => (
            <Link href={`/deer/${d.id}`} key={d.id}>
              <Card
                className="cursor-pointer transition-transform duration-100 hover:ring-2 hover:ring-copper active:scale-[0.98]"
                onClick={() => {
                  onDeerClick?.(d)
                }}
              >
                <CardContent className="p-3">
                  <div className="relative aspect-square overflow-hidden rounded-lg bg-slate">
                    {d.reference_image_url && d.reference_bbox?.x != null ? (
                      (() => {
                        // Calculate proper zoom to fit bbox with padding
                        const imageSize = 10000
                        const widthPct = ((d.reference_bbox.width ?? 1000) / imageSize) * 100
                        const heightPct = ((d.reference_bbox.height ?? 1000) / imageSize) * 100
                        const padding = 0.20
                        const regionWidthPct = widthPct * (1 + 2 * padding)
                        const regionHeightPct = heightPct * (1 + 2 * padding)
                        const bgSizeX = (100 / regionWidthPct) * 100
                        const bgSizeY = (100 / regionHeightPct) * 100
                        const bgSize = Math.min(bgSizeX, bgSizeY, 2000)
                        const centerXPct = ((d.reference_bbox.x ?? 5000) / imageSize) * 100
                        const centerYPct = ((d.reference_bbox.y ?? 5000) / imageSize) * 100

                        return (
                          <div
                            className="absolute inset-0"
                            style={{
                              backgroundImage: `url(${d.reference_image_url})`,
                              backgroundSize: `${bgSize}%`,
                              backgroundPosition: `${centerXPct}% ${centerYPct}%`,
                              backgroundRepeat: 'no-repeat',
                            }}
                          />
                        )
                      })()
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <span className="text-4xl">🦌</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3">
                    <h3 className="font-medium text-cream truncate">{d.name}</h3>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {d.sighting_count} sighting{d.sighting_count !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
