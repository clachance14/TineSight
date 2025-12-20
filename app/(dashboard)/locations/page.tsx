import { LocationsMap } from '@/components/locations/locations-map'

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
