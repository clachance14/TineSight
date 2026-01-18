import { Suspense } from 'react'
import { TrophyDashboard } from '@/components/trophy/trophy-dashboard'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'

export const metadata = {
  title: 'Trophy Dashboard | TineSight',
  description: 'Manage your trophy buck detections, matches, and clusters',
}

function DashboardSkeleton() {
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

export default function TrophyPage() {
  return (
    <div className="container mx-auto py-6 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-cream">Trophy Dashboard</h1>
        <p className="text-sm text-cream-dark mt-1">
          Manage trophy buck detections with AI-powered matching and clustering
        </p>
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <TrophyDashboard />
      </Suspense>
    </div>
  )
}
