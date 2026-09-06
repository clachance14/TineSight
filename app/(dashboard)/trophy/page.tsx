import { PageHeading } from '@/components/layout/page-heading'
import { Suspense } from 'react'
import { TrophyDashboard } from '@/components/trophy/trophy-dashboard'
import { Skeleton } from '@/components/ui/skeleton'

export const metadata = {
  title: 'Review | TineSight',
  description: 'Confirm sightings, name new bucks, and sort trophy detections.',
}

function DashboardSkeleton(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-[1180px]">
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

export default function TrophyPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeading eyebrow="Connect the sightings" title="Review" description="Confirm suggested matches, name new bucks, and keep your catalog growing." />
      <Suspense fallback={<DashboardSkeleton />}>
        <TrophyDashboard />
      </Suspense>
    </div>
  )
}
