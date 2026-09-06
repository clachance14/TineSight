'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { APIProvider, Map, AdvancedMarker, useMap, type MapMouseEvent } from '@vis.gl/react-google-maps'
import { MapPinIcon, MapIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateLocation } from '@/lib/hooks/use-locations'

import type { LocationWithPhotoCount } from '@/lib/services/locations'

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
  onClose: () => void
  photoCount?: number
  isLoading?: boolean
  loadError?: boolean
  onRetry?: () => void
  existingLocations?: LocationWithPhotoCount[]
}

function MapPicker({
  pinLocation,
  setPinLocation,
  mapType,
  existingLocations,
  selectedLocationId,
  onSelectLocation,
}: {
  pinLocation: { lat: number; lng: number } | null
  setPinLocation: (loc: { lat: number; lng: number }) => void
  mapType: MapTypeId
  existingLocations: LocationWithPhotoCount[]
  selectedLocationId: string
  onSelectLocation: (id: string) => void
}): React.JSX.Element {
  const map = useMap()
  const hasFittedBoundsRef = useRef(false)

  // Auto-fit map bounds to show existing location pins
  useEffect(() => {
    if (!map || existingLocations.length === 0 || hasFittedBoundsRef.current) return

    hasFittedBoundsRef.current = true

    // Single location: center with reasonable zoom
    if (existingLocations.length === 1) {
      const loc = existingLocations[0]
      if (loc) {
        map.setCenter({ lat: loc.lat, lng: loc.lng })
        map.setZoom(12)
        return
      }
    }

    // Build bounding box from all pins
    const bounds = new google.maps.LatLngBounds()
    existingLocations.forEach((location) => {
      bounds.extend({ lat: location.lat, lng: location.lng })
    })

    // All pins at same location: treat like single pin
    if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
      map.setCenter(bounds.getCenter())
      map.setZoom(12)
      return
    }

    // Fit bounds with padding (50px on each side)
    map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 })

    // Cap max zoom if pins are very close together
    setTimeout(() => {
      const zoom = map.getZoom()
      if (zoom !== undefined && zoom > 15) map.setZoom(15)
    }, 100)
  }, [map, existingLocations])

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
      {/* Existing Location Markers */}
      {existingLocations.map((location) => (
        <AdvancedMarker
          key={location.id}
          title={`Select ${location.name}`}
          onClick={() => onSelectLocation(location.id)}
          position={{ lat: location.lat, lng: location.lng }}
        >
          <MapPinIcon
            className={selectedLocationId === location.id ? 'w-9 h-9 drop-shadow-lg ring-2 ring-copper rounded-full' : 'w-7 h-7 drop-shadow-lg'}
            style={{
              color: location.color ?? '#C4895A',
              fill: `${location.color ?? '#C4895A'}CC`,
            }}
          />
        </AdvancedMarker>
      ))}

      {/* User's selected pin (copper, prominent) */}
      {pinLocation && (
        <AdvancedMarker position={pinLocation}>
          <MapPinIcon className="w-8 h-8 text-copper fill-copper drop-shadow-lg" />
        </AdvancedMarker>
      )}
    </Map>
  )
}

export function LocationPickerModal({ isOpen, onConfirm, onSkip, onClose, existingLocations = [], photoCount, isLoading = false, loadError = false, onRetry }: LocationPickerModalProps): React.JSX.Element | null {
  // Mount a fresh draft each time the picker opens; dismissed choices never start uploads.
  if (!isOpen) return null
  return <LocationPickerDraft isOpen={isOpen} onConfirm={onConfirm} onSkip={onSkip} onClose={onClose} existingLocations={existingLocations} {...(photoCount !== undefined && { photoCount })} isLoading={isLoading} loadError={loadError} {...(onRetry && { onRetry })} />
}

function LocationPickerDraft({ onConfirm, onSkip, onClose, existingLocations = [], photoCount, isLoading, loadError, onRetry }: LocationPickerModalProps): React.JSX.Element | null {
  const createLocation = useCreateLocation()
  const savingRef = useRef(false)
  const [selectedId, setSelectedId] = useState('')
  const [mapType, setMapType] = useState<MapTypeId>('hybrid')
  const [areaName, setAreaName] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [error, setError] = useState<string | null>(null)
  const selected = existingLocations.find(location => location.id === selectedId)
  const isNew = selectedId === 'new'
  const lat = Number(latitude), lng = Number(longitude)
  const validCoordinates = latitude.trim() !== '' && longitude.trim() !== '' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  const pinLocation = isNew && validCoordinates ? { lat, lng } : null
  const choosePin = (pin: { lat: number; lng: number }): void => {
    if (savingRef.current) return
    setSelectedId('new')
    setError(null)
    setLatitude(String(pin.lat))
    setLongitude(String(pin.lng))
  }
  const chooseLocation = (id: string): void => {
    if (savingRef.current) return
    setSelectedId(id)
    setError(null)
  }
  const confirm = async (): Promise<void> => {
    if (savingRef.current) return
    if (selected) {
      onConfirm({ locationId: selected.id, areaName: selected.name, lat: Number(selected.lat), lng: Number(selected.lng), directionCompass: selected.direction_compass ?? undefined, directionNotes: selected.direction_notes ?? undefined })
      return
    }
    if (!isNew || !validCoordinates || areaName.trim().length === 0) return
    savingRef.current = true
    setError(null)
    try {
      const result = await createLocation.mutateAsync({ name: areaName.trim(), lat, lng })
      onConfirm({ locationId: result.location.id, areaName: result.location.name, lat: Number(result.location.lat), lng: Number(result.location.lng), directionCompass: result.location.direction_compass ?? undefined, directionNotes: result.location.direction_notes ?? undefined })
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save location. Please try again.') }
    finally { savingRef.current = false }
  }
  const mapsKey = process.env['NEXT_PUBLIC_GOOGLE_MAPS_API_KEY']
  const hasMap = mapsKey !== undefined && mapsKey.length > 0
  const hasSelection = selected !== undefined || (isNew && validCoordinates)
  return (
    <Dialog open onOpenChange={open => { if (!open && !savingRef.current) onClose() }}>
      <DialogContent className="flex h-[min(46rem,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl sm:p-0" showCloseButton={!createLocation.isPending}>
        <DialogHeader className="shrink-0 px-4 py-3 pr-12 text-left">
          <DialogTitle>Select location</DialogTitle>
          <DialogDescription>{photoCount !== undefined ? `${photoCount.toLocaleString()} photo${photoCount === 1 ? '' : 's'} in this group. ` : ''}Select a pin or tap the map to add a new location.</DialogDescription>
        </DialogHeader>
        <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-deep" aria-label="Location map workspace">
          {hasMap && <APIProvider apiKey={mapsKey}><MapPicker pinLocation={pinLocation} setPinLocation={choosePin} mapType={mapType} existingLocations={existingLocations} selectedLocationId={selectedId} onSelectLocation={chooseLocation} /></APIProvider>}
          <div className="absolute left-3 right-3 top-3 flex items-start gap-2">
            <div className="min-w-0 flex-1 sm:max-w-xs">
              <Label htmlFor="upload-location" className="sr-only">Saved location</Label>
              <select id="upload-location" disabled={createLocation.isPending} value={selectedId} onChange={event => chooseLocation(event.target.value)} className="h-11 w-full rounded-md border border-slate bg-slate-deep px-3 text-sm text-cream shadow-lg">
                <option value="" disabled>Find a saved location</option>
                {existingLocations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
                <option value="new">Add new location</option>
              </select>
              {isLoading === true && <p role="status" className="rounded bg-slate-deep p-2 text-sm text-cream-dark">Loading saved locations…</p>}
              {loadError === true && <div role="alert" className="rounded bg-slate-deep p-2 text-sm text-destructive">Could not load locations. <Button variant="link" onClick={onRetry}>Try again</Button></div>}
            </div>
            {hasMap && <Button variant="outline" className="h-11 bg-slate-deep shadow-lg" onClick={() => setMapType(mapType === 'hybrid' ? 'terrain' : 'hybrid')}><MapIcon className="size-4" />{mapType === 'hybrid' ? 'Topo' : 'Satellite'}</Button>}
          </div>
          {isNew && !validCoordinates && hasMap && <p role="status" className="pointer-events-none absolute bottom-4 left-4 right-4 rounded-lg bg-slate-deep/90 p-3 text-center text-sm text-cream">Tap the map to place your new location.</p>}
          {!hasMap && <div className="absolute inset-x-4 top-20 space-y-3">
            <p className="text-sm text-cream-dark">Map unavailable. Choose a saved location or enter a new point.</p>
            {isNew && <fieldset disabled={createLocation.isPending} className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="upload-latitude">Latitude</Label><Input id="upload-latitude" type="number" step="any" min={-90} max={90} value={latitude} onChange={e => setLatitude(e.target.value)} /></div>
              <div><Label htmlFor="upload-longitude">Longitude</Label><Input id="upload-longitude" type="number" step="any" min={-180} max={180} value={longitude} onChange={e => setLongitude(e.target.value)} /></div>
            </fieldset>}
          </div>}
        </div>
        <div className="shrink-0 space-y-2 border-t border-slate bg-background px-4 py-3">
          {hasSelection && <div className="min-w-0">
            {isNew ? <><Label htmlFor="area-name" className="sr-only">Location name</Label><Input id="area-name" disabled={createLocation.isPending} maxLength={100} value={areaName} onChange={e => setAreaName(e.target.value)} placeholder="Name this location" /></> : <p className="truncate font-medium text-cream">{selected?.name}</p>}
          </div>}
          {error !== null && <p role="alert" className="line-clamp-2 text-sm text-destructive" title={error}>{error}</p>}
          <div className="flex items-center gap-2">
            <Button variant="ghost" disabled={createLocation.isPending} onClick={onClose}>Back</Button>
            <Button variant="ghost" disabled={createLocation.isPending} onClick={onSkip}>Skip location</Button>
            {hasSelection && <Button className="ml-auto" disabled={createLocation.isPending || (isNew && areaName.trim().length === 0)} onClick={() => void confirm()}>{createLocation.isPending ? 'Saving…' : 'Confirm'}</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
