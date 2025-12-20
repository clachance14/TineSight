'use client'

import { useState, useCallback, useEffect } from 'react'
import { APIProvider, Map, AdvancedMarker, InfoWindow, useMap, type MapMouseEvent } from '@vis.gl/react-google-maps'
import { MapPinIcon, MapIcon, PlusIcon, XIcon, ImageIcon, PencilIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLocations } from '@/lib/hooks/use-locations'
import { LocationCreateForm } from './location-create-form'
import { LocationEditDialog } from './location-edit-dialog'
import { DEFAULT_LOCATION_COLOR } from '@/lib/constants/location-colors'
import type { LocationWithPhotoCount } from '@/lib/services/locations'
import Link from 'next/link'

const GOOGLE_MAPS_API_KEY = process.env['NEXT_PUBLIC_GOOGLE_MAPS_API_KEY']

// Default center: continental US
const DEFAULT_CENTER = {
  lat: 39.8283,
  lng: -98.5795,
}

const DEFAULT_ZOOM = 4

type MapTypeId = 'hybrid' | 'terrain'

function MapContent({
  locations,
  isCreating,
  newPinLocation,
  setNewPinLocation,
  selectedLocation,
  setSelectedLocation,
  onEditLocation,
  mapType,
}: {
  locations: LocationWithPhotoCount[]
  isCreating: boolean
  newPinLocation: { lat: number; lng: number } | null
  setNewPinLocation: (loc: { lat: number; lng: number } | null) => void
  selectedLocation: LocationWithPhotoCount | null
  setSelectedLocation: (loc: LocationWithPhotoCount | null) => void
  onEditLocation: (location: LocationWithPhotoCount) => void
  mapType: MapTypeId
}) {
  const map = useMap()

  const handleMapClick = useCallback(
    (event: MapMouseEvent) => {
      if (isCreating && event.detail.latLng) {
        setNewPinLocation({ lat: event.detail.latLng.lat, lng: event.detail.latLng.lng })
        setSelectedLocation(null)
      }
    },
    [isCreating, setNewPinLocation, setSelectedLocation]
  )

  // Update map type when it changes
  useEffect(() => {
    if (map) {
      map.setMapTypeId(mapType)
    }
  }, [map, mapType])

  return (
    <Map
      defaultCenter={DEFAULT_CENTER}
      defaultZoom={DEFAULT_ZOOM}
      mapId="locations-map"
      mapTypeId={mapType}
      onClick={handleMapClick}
      style={{ width: '100%', height: '100%' }}
      gestureHandling="greedy"
      disableDefaultUI={false}
      zoomControl={true}
      mapTypeControl={false}
      streetViewControl={false}
      fullscreenControl={false}
      clickableIcons={false}
    >
      {/* Existing Location Markers */}
      {locations.map((location) => (
        <AdvancedMarker
          key={location.id}
          position={{ lat: location.lat, lng: location.lng }}
          onClick={() => {
            if (!isCreating) {
              setSelectedLocation(location)
            }
          }}
        >
          <div className="cursor-pointer group">
            <MapPinIcon
              className="w-8 h-8 drop-shadow-lg transition-transform group-hover:scale-110"
              style={{
                color: location.color || DEFAULT_LOCATION_COLOR,
                fill: location.color || DEFAULT_LOCATION_COLOR,
              }}
            />
          </div>
        </AdvancedMarker>
      ))}

      {/* New Pin Location (when creating) */}
      {newPinLocation && (
        <AdvancedMarker position={newPinLocation}>
          <MapPinIcon className="w-8 h-8 text-green-500 fill-green-500 drop-shadow-lg animate-bounce" />
        </AdvancedMarker>
      )}

      {/* InfoWindow for selected location */}
      {selectedLocation && (
        <InfoWindow
          position={{ lat: selectedLocation.lat, lng: selectedLocation.lng }}
          onCloseClick={() => setSelectedLocation(null)}
          pixelOffset={[0, -32]}
        >
          <div className="bg-slate-deep border border-slate-600 rounded-lg p-3 min-w-48 shadow-xl">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-semibold text-cream">{selectedLocation.name}</h3>
              <button
                onClick={() => setSelectedLocation(null)}
                className="text-cream-dark hover:text-cream"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 text-sm text-cream-dark mb-3">
              <ImageIcon className="w-4 h-4" />
              <span>{selectedLocation.photo_count} photos</span>
            </div>

            {selectedLocation.direction_compass !== null && (
              <p className="text-xs text-cream-dark mb-2">
                Direction: {getCompassLabel(selectedLocation.direction_compass)}
              </p>
            )}

            {selectedLocation.notes && (
              <p className="text-xs text-cream-dark mb-3 line-clamp-2">
                {selectedLocation.notes}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onEditLocation(selectedLocation)
                  setSelectedLocation(null)
                }}
                className="flex-1 bg-slate hover:bg-slate-600 border-slate-600 text-cream"
              >
                <PencilIcon className="w-4 h-4 mr-1" />
                Edit
              </Button>
              <Link
                href={`/photos?areaName=${encodeURIComponent(selectedLocation.name)}`}
                className="flex-1"
              >
                <Button
                  size="sm"
                  className="w-full bg-copper hover:bg-copper-light text-slate-deep"
                >
                  View Photos
                </Button>
              </Link>
            </div>
          </div>
        </InfoWindow>
      )}
    </Map>
  )
}

export function LocationsMap() {
  const { data, isLoading } = useLocations()
  const locations = data?.locations ?? []

  const [mapType, setMapType] = useState<MapTypeId>('hybrid')
  const [isCreating, setIsCreating] = useState(false)
  const [newPinLocation, setNewPinLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<LocationWithPhotoCount | null>(null)
  const [editingLocation, setEditingLocation] = useState<LocationWithPhotoCount | null>(null)

  const toggleMapType = () => {
    setMapType((prev) => (prev === 'hybrid' ? 'terrain' : 'hybrid'))
  }

  const handleStartCreate = () => {
    setIsCreating(true)
    setSelectedLocation(null)
  }

  const handleCancelCreate = () => {
    setIsCreating(false)
    setNewPinLocation(null)
  }

  const handleCreateSuccess = () => {
    setIsCreating(false)
    setNewPinLocation(null)
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-deep text-cream-dark">
        <p>Map unavailable: Missing Google Maps API key</p>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
        <MapContent
          locations={locations}
          isCreating={isCreating}
          newPinLocation={newPinLocation}
          setNewPinLocation={setNewPinLocation}
          selectedLocation={selectedLocation}
          setSelectedLocation={setSelectedLocation}
          onEditLocation={setEditingLocation}
          mapType={mapType}
        />
      </APIProvider>

      {/* Map Type Toggle */}
      <Button
        variant="outline"
        size="sm"
        onClick={toggleMapType}
        className="absolute bottom-4 left-4 bg-slate-deep/90 hover:bg-slate/90 border-slate-600 text-cream"
      >
        <MapIcon className="w-4 h-4 mr-1" />
        {mapType === 'hybrid' ? 'Topo' : 'Satellite'}
      </Button>

      {/* Create Location Button */}
      {!isCreating && (
        <Button
          onClick={handleStartCreate}
          className="absolute top-4 left-4 bg-copper hover:bg-copper-light text-slate-deep"
        >
          <PlusIcon className="w-4 h-4 mr-2" />
          Add Location
        </Button>
      )}

      {/* Create Mode Instructions */}
      {isCreating && !newPinLocation && (
        <div className="absolute top-4 left-4 bg-slate-deep/95 border border-slate-600 rounded-lg p-4 max-w-xs">
          <p className="text-cream text-sm mb-3">
            Click on the map to place a pin for your new location.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancelCreate}
            className="bg-slate hover:bg-slate-600 border-slate-600 text-cream"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Create Form (shown when pin is placed) */}
      {isCreating && newPinLocation && (
        <div className="absolute top-4 left-4 max-w-sm">
          <LocationCreateForm
            lat={newPinLocation.lat}
            lng={newPinLocation.lng}
            onSuccess={handleCreateSuccess}
            onCancel={handleCancelCreate}
          />
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="absolute inset-0 bg-slate-deep/50 flex items-center justify-center">
          <div className="text-cream">Loading locations...</div>
        </div>
      )}

      {/* Edit Dialog */}
      {editingLocation && (
        <LocationEditDialog
          location={editingLocation}
          open={!!editingLocation}
          onOpenChange={(open) => !open && setEditingLocation(null)}
        />
      )}
    </div>
  )
}

function getCompassLabel(degrees: number): string {
  const directions = [
    { label: 'N', degrees: 0 },
    { label: 'NE', degrees: 45 },
    { label: 'E', degrees: 90 },
    { label: 'SE', degrees: 135 },
    { label: 'S', degrees: 180 },
    { label: 'SW', degrees: 225 },
    { label: 'W', degrees: 270 },
    { label: 'NW', degrees: 315 },
  ]
  const match = directions.find((d) => d.degrees === degrees)
  return match ? `${match.label} (${degrees}°)` : `${degrees}°`
}
