import { LocationsMapWrapper } from './locations-map-wrapper'

export const metadata = { title: 'Locations | TineSight', description: 'Your camera spots, field notes, and photos on the map.' }

export default function LocationsPage(): React.JSX.Element {
  return <LocationsMapWrapper />
}
