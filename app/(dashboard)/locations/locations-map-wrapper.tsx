'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Lazy-load the map component - Google Maps is heavy (~50KB+)
// ssr: false requires a Client Component in Next.js 16
const LocationsMap = dynamic(
  () => import('@/components/locations/locations-map').then(m => m.LocationsMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center bg-slate-deep">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    ),
  }
)

export function LocationsMapWrapper() {
  return <LocationsMap />
}
