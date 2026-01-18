import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

// Lazy-load the map component - Google Maps is heavy (~50KB+)
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

export const metadata = {
  title: 'Locations | TineSight',
  description: 'Manage your hunting locations and camera spots',
}

export default function LocationsPage() {
  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 border-b border-slate-600 bg-slate-deep px-6 py-4">
        <h1 className="text-2xl font-bold text-cream">Locations</h1>
        <p className="text-sm text-cream-dark mt-1">
          View and manage your hunting locations. Click a pin to view photos from that area.
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <LocationsMap />
      </div>
    </div>
  )
}
