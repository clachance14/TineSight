'use client'

import { useState, useCallback, useEffect } from 'react'
import { APIProvider, Map, AdvancedMarker, type MapMouseEvent } from '@vis.gl/react-google-maps'
import { MapPinIcon, MapIcon, PlusIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { LocationWithPhotoCount } from '@/lib/services/locations'

const GOOGLE_MAPS_API_KEY = process.env['NEXT_PUBLIC_GOOGLE_MAPS_API_KEY']

const COMPASS_DIRECTIONS = [
  { label: 'N', degrees: 0 },
  { label: 'NE', degrees: 45 },
  { label: 'E', degrees: 90 },
  { label: 'SE', degrees: 135 },
  { label: 'S', degrees: 180 },
  { label: 'SW', degrees: 225 },
  { label: 'W', degrees: 270 },
  { label: 'NW', degrees: 315 },
]

// Default center: continental US
const DEFAULT_CENTER = {
  lat: 39.8283,
  lng: -98.5795,
}

const DEFAULT_ZOOM = 3

type MapTypeId = 'hybrid' | 'terrain'

export interface LocationData {
  lat: number
  lng: number
  areaName: string
  directionCompass?: number | undefined
  directionNotes?: string | undefined
  locationId?: string
}

interface LocationPickerModalProps {
  isOpen: boolean
  onConfirm: (location: LocationData) => void
  onSkip: () => void
  existingLocations?: LocationWithPhotoCount[]
}

function MapPicker({
  pinLocation,
  setPinLocation,
  mapType,
}: {
  pinLocation: { lat: number; lng: number } | null
  setPinLocation: (loc: { lat: number; lng: number }) => void
  mapType: MapTypeId
}) {
  const handleMapClick = useCallback(
    (event: MapMouseEvent) => {
      if (event.detail.latLng) {
        setPinLocation({ lat: event.detail.latLng.lat, lng: event.detail.latLng.lng })
      }
    },
    [setPinLocation]
  )

  return (
    <Map
      defaultCenter={DEFAULT_CENTER}
      defaultZoom={DEFAULT_ZOOM}
      mapId="location-picker-map"
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
      {pinLocation && (
        <AdvancedMarker position={pinLocation}>
          <MapPinIcon className="w-8 h-8 text-copper fill-copper drop-shadow-lg" />
        </AdvancedMarker>
      )}
    </Map>
  )
}

export function LocationPickerModal({
  isOpen,
  onConfirm,
  onSkip,
  existingLocations = [],
}: LocationPickerModalProps) {
  const [mapType, setMapType] = useState<MapTypeId>('hybrid')
  const [pinLocation, setPinLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [areaName, setAreaName] = useState('')
  const [selectedDirection, setSelectedDirection] = useState<number | undefined>(undefined)
  const [directionNotes, setDirectionNotes] = useState('')
  // 'new' = manual entry mode, location id = existing location selected
  const [selectedLocationId, setSelectedLocationId] = useState<string | 'new' | null>(null)

  // When an existing location is selected, populate all fields
  useEffect(() => {
    if (selectedLocationId && selectedLocationId !== 'new') {
      const location = existingLocations.find((l) => l.id === selectedLocationId)
      if (location) {
        setPinLocation({ lat: Number(location.lat), lng: Number(location.lng) })
        setAreaName(location.name)
        setSelectedDirection(location.direction_compass ?? undefined)
        setDirectionNotes(location.direction_notes ?? '')
      }
    } else if (selectedLocationId === 'new') {
      // Clear fields for manual entry
      setPinLocation(null)
      setAreaName('')
      setSelectedDirection(undefined)
      setDirectionNotes('')
    }
  }, [selectedLocationId, existingLocations])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedLocationId(null)
      setPinLocation(null)
      setAreaName('')
      setSelectedDirection(undefined)
      setDirectionNotes('')
    }
  }, [isOpen])

  const isExistingLocationSelected = selectedLocationId !== null && selectedLocationId !== 'new'

  const toggleMapType = () => {
    setMapType((prev) => (prev === 'hybrid' ? 'terrain' : 'hybrid'))
  }

  const handleConfirm = () => {
    if (!pinLocation || !areaName.trim()) return

    const locationData: LocationData = {
      lat: pinLocation.lat,
      lng: pinLocation.lng,
      areaName: areaName.trim(),
      ...(isExistingLocationSelected && { locationId: selectedLocationId }),
    }

    if (selectedDirection !== undefined) {
      locationData.directionCompass = selectedDirection
    }

    if (directionNotes.trim()) {
      locationData.directionNotes = directionNotes.trim()
    }

    onConfirm(locationData)
  }

  const canConfirm = pinLocation !== null && areaName.trim() !== ''

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onSkip()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Set Photo Location</DialogTitle>
          <DialogDescription>
            Click on the map to place a pin, then provide location details.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid gap-4 grid-cols-1 lg:grid-cols-2 lg:min-h-[400px]">
          {/* Map Section */}
          <div className="relative rounded-lg overflow-hidden border border-slate-600 min-h-[300px]">
            {GOOGLE_MAPS_API_KEY ? (
              <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
                <MapPicker
                  pinLocation={pinLocation}
                  setPinLocation={setPinLocation}
                  mapType={mapType}
                />
              </APIProvider>
            ) : (
              <div className="flex items-center justify-center h-full bg-slate-deep text-cream-dark">
                <p>Map unavailable: Missing Google Maps API key</p>
              </div>
            )}

            {/* Map Type Toggle */}
            {GOOGLE_MAPS_API_KEY && (
              <Button
                variant="outline"
                size="sm"
                onClick={toggleMapType}
                className="absolute bottom-4 left-4 bg-slate-deep/90 hover:bg-slate/90 border-slate-600 text-cream"
              >
                <MapIcon className="w-4 h-4" />
                {mapType === 'hybrid' ? 'Topo' : 'Satellite'}
              </Button>
            )}
          </div>

          {/* Form Section */}
          <div className="flex flex-col gap-4">
            {/* Location Selector */}
            {existingLocations.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label className="text-cream">Select Location</Label>
                <Select
                  value={selectedLocationId ?? ''}
                  onValueChange={(value) => setSelectedLocationId(value as string | 'new')}
                >
                  <SelectTrigger className="bg-slate-deep border-slate-600 text-cream">
                    <SelectValue placeholder="Choose a location..." />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-deep border-slate-600 z-[70]">
                    {existingLocations.map((location) => (
                      <SelectItem
                        key={location.id}
                        value={location.id}
                        className="text-cream hover:bg-slate focus:bg-slate"
                      >
                        {location.name}
                      </SelectItem>
                    ))}
                    <SelectItem
                      value="new"
                      className="text-copper hover:bg-slate focus:bg-slate"
                    >
                      <span className="flex items-center gap-2">
                        <PlusIcon className="w-4 h-4" />
                        Add New Location
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Show form fields when in manual mode or no locations exist */}
            {(selectedLocationId === 'new' || existingLocations.length === 0) && (
              <>
                {/* Area Name */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="area-name" className="text-cream">
                    Area Name <span className="text-copper">*</span>
                  </Label>
                  <Input
                    id="area-name"
                    placeholder="e.g., North Pasture, Oak Ridge, Creek Bottom"
                    value={areaName}
                    onChange={(e) => setAreaName(e.target.value)}
                    className="bg-slate-deep border-slate-600 text-cream"
                  />
                </div>

                {/* Compass Direction */}
                <div className="flex flex-col gap-2">
                  <Label className="text-cream">Camera Direction (Optional)</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {COMPASS_DIRECTIONS.map(({ label, degrees }) => (
                      <Button
                        key={degrees}
                        variant={selectedDirection === degrees ? 'default' : 'outline'}
                        size="sm"
                        onClick={() =>
                          setSelectedDirection(selectedDirection === degrees ? undefined : degrees)
                        }
                        className={
                          selectedDirection === degrees
                            ? 'bg-copper hover:bg-copper-light text-slate-deep'
                            : 'bg-slate-deep hover:bg-slate border-slate-600 text-cream'
                        }
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Direction Notes */}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="direction-notes" className="text-cream">
                    Direction Notes (Optional)
                  </Label>
                  <Textarea
                    id="direction-notes"
                    placeholder="e.g., Facing the water hole, Looking towards the tree line"
                    value={directionNotes}
                    onChange={(e) => setDirectionNotes(e.target.value)}
                    className="bg-slate-deep border-slate-600 text-cream min-h-20 resize-none"
                  />
                </div>

                {/* Pin Placement Hint */}
                {!pinLocation && (
                  <div className="text-sm text-cream-dark bg-slate-deep/50 border border-slate-600 rounded-md p-3">
                    <MapPinIcon className="w-4 h-4 inline mr-2" />
                    Click on the map to place a pin
                  </div>
                )}
              </>
            )}

            {/* Show read-only summary when existing location selected */}
            {isExistingLocationSelected && (
              <div className="space-y-3 p-4 bg-slate-deep/50 border border-slate-600 rounded-md">
                <div>
                  <span className="text-cream-dark text-sm">Location:</span>
                  <p className="text-cream font-medium">{areaName}</p>
                </div>
                {selectedDirection !== undefined && (
                  <div>
                    <span className="text-cream-dark text-sm">Direction:</span>
                    <p className="text-cream">
                      {COMPASS_DIRECTIONS.find((d) => d.degrees === selectedDirection)?.label}
                      {directionNotes && ` - ${directionNotes}`}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onSkip}
            className="bg-slate-deep hover:bg-slate border-slate-600 text-cream"
          >
            Skip
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="bg-copper hover:bg-copper-light text-slate-deep disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm Location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
