'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Lazy-load the map component - Google Maps is heavy (~50KB+)
// ssr: false requires a Client Component in Next.js 16
const LocationsMap = dynamic(
  () =>
    import('@/components/locations/locations-map').then((m) => m.LocationsMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full min-h-0 w-full flex items-center justify-center rounded-xl bg-forest/20">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    ),
  },
)

export function LocationsMapWrapper(): React.JSX.Element {
  return (
    <div data-map-workspace className="h-full min-h-0">
      <LocationsMap />
    </div>
  )
}
