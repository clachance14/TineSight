import { Suspense } from 'react'
import { TrophyDashboard } from '@/components/trophy/trophy-dashboard'
import { Skeleton } from '@/components/ui/skeleton'

export const metadata = {
  title: 'Review | TineSight',
  description: 'Confirm sightings, name new bucks, and sort trophy detections.',
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-72" />
      <div className="flex gap-6 border-b border-cream/10 pb-2.5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}

export default function TrophyPage() {
  return (
    <div className="container mx-auto max-w-[1180px] py-6 px-4">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold leading-none text-cream">Review</h1>
        <p className="mt-2 text-sm text-cream-dark">
          Confirm sightings, name new bucks, sort the rest.
        </p>
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <TrophyDashboard />
      </Suspense>
    </div>
  )
}
