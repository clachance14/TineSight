'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Archive, Camera, CheckCircle, XCircle } from 'lucide-react'

interface BatchStats {
  total_photos: number
  analyzed_photos: number
  photos_with_deer: number
  empty_photos: number
  failed_photos: number
  buck_count: number
  doe_count: number
  unknown_count: number
  points_breakdown: {
    ten_plus: number
    eight_nine: number
    six_seven: number
    under_six: number
  }
}

interface TriageDashboardProps {
  batchId?: string
  onArchiveEmpty?: () => void
}

export function TriageDashboard({ batchId, onArchiveEmpty }: TriageDashboardProps) {
  const { data: stats, isLoading, error } = useQuery<BatchStats>({
    queryKey: ['batch-stats', batchId],
    queryFn: async () => {
      const url = batchId ? `/api/photos/stats?batch_id=${batchId}` : '/api/photos/stats'
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch stats')
      return res.json()
    },
  })

  const handleArchiveEmpty = async () => {
    if (!stats?.empty_photos) return

    try {
      const res = await fetch('/api/photos/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchId ? { batch_id: batchId } : {}),
      })
      if (res.ok) {
        onArchiveEmpty?.()
      }
    } catch (error) {
      console.error('Failed to archive:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error || !stats) {
    return <div className="text-red-500">Failed to load statistics</div>
  }

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Photos</CardTitle>
            <Camera className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_photos}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">With Deer</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{stats.photos_with_deer}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Empty</CardTitle>
            <Archive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.empty_photos}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{stats.failed_photos}</div>
          </CardContent>
        </Card>
      </div>

      {/* Detection breakdown */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Bucks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-brass">{stats.buck_count}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Does</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.doe_count}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Unknown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{stats.unknown_count}</div>
          </CardContent>
        </Card>
      </div>

      {/* Points breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Buck Points Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-4">
            <div className="flex items-center justify-between rounded-lg bg-brass/20 p-3">
              <span className="text-sm font-medium">10+ Points</span>
              <span className="text-xl font-bold text-brass">{stats.points_breakdown.ten_plus}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate/50 p-3">
              <span className="text-sm font-medium">8-9 Points</span>
              <span className="text-xl font-bold">{stats.points_breakdown.eight_nine}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate/50 p-3">
              <span className="text-sm font-medium">6-7 Points</span>
              <span className="text-xl font-bold">{stats.points_breakdown.six_seven}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate/50 p-3">
              <span className="text-sm font-medium">&lt;6 Points</span>
              <span className="text-xl font-bold">{stats.points_breakdown.under_six}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Archive button */}
      {stats.empty_photos > 0 && (
        <Button
          variant="outline"
          onClick={handleArchiveEmpty}
          className="gap-2"
        >
          <Archive className="h-4 w-4" />
          Archive {stats.empty_photos} Empty Photos
        </Button>
      )}
    </div>
  )
}
