'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
  useApiLoadingStatus,
  APILoadingStatus,
} from '@vis.gl/react-google-maps'
import {
  ArrowRight,
  Crosshair,
  MapPin,
  Plus,
  Search,
  Pencil,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { PageState } from '@/components/layout/page-state'
import { useLocations } from '@/lib/hooks/use-locations'
import { LocationCreateForm } from './location-create-form'
import { LocationEditDialog } from './location-edit-dialog'
import { DEFAULT_LOCATION_COLOR } from '@/lib/constants/location-colors'
import type { LocationWithPhotoCount } from '@/lib/services/locations'

const API_KEY = process.env['NEXT_PUBLIC_GOOGLE_MAPS_API_KEY']
type Point = { lat: number; lng: number }
type MapKind = 'hybrid' | 'terrain'
const DEFAULT_CENTER = { lat: 39.8283, lng: -98.5795 }

function MapCanvas({
  locations,
  selected,
  onSelect,
  creating,
  onPlace,
  mapType,
  fitVersion,
  onDismiss,
}: {
  locations: LocationWithPhotoCount[]
  selected: LocationWithPhotoCount | null
  onSelect: (location: LocationWithPhotoCount) => void
  creating: boolean
  onPlace: (point: Point) => void
  mapType: MapKind
  fitVersion: number
  onDismiss: () => void
}): React.JSX.Element {
  const map = useMap()
  const status = useApiLoadingStatus()
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const fitted = useRef(-1)
  useEffect(() => {
    if (map === null || locations.length === 0 || fitted.current === fitVersion)
      return
    fitted.current = fitVersion
    const bounds = new google.maps.LatLngBounds()
    locations.forEach((location) =>
      bounds.extend({ lat: location.lat, lng: location.lng }),
    )
    if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
      map.setCenter(bounds.getCenter())
      map.setZoom(14)
    } else {
      map.fitBounds(bounds, 60)
      const listener = google.maps.event.addListenerOnce(map, 'idle', () => {
        if ((map.getZoom() ?? 0) > 16) map.setZoom(16)
      })
      return () => google.maps.event.removeListener(listener)
    }
    return undefined
  }, [map, locations, fitVersion])
  useEffect(() => {
    if (map !== null && selected !== null) {
      map.panTo({ lat: selected.lat, lng: selected.lng })
      if ((map.getZoom() ?? 0) < 13) map.setZoom(13)
    }
  }, [map, selected])

  if (
    status === APILoadingStatus.FAILED ||
    status === APILoadingStatus.AUTH_FAILURE
  ) {
    return (
      <div className="flex h-full items-center p-6">
        <PageState
          title="The map is unavailable."
          description="Your saved places are still available in the list. You can also add a location using coordinates."
        />
      </div>
    )
  }
  return (
    <>
      <Map
        defaultCenter={DEFAULT_CENTER}
        defaultZoom={4}
        mapId="locations-map"
        mapTypeId={mapType}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        style={{ width: '100%', height: '100%' }}
        onClick={(event) => {
          if (creating && event.detail.latLng !== null)
            onPlace(event.detail.latLng)
        }}
      >
        {locations.map((location) => {
          const preview =
            !creating && (hoveredId ?? selected?.id) === location.id
          return (
            <AdvancedMarker
              key={location.id}
              position={{ lat: location.lat, lng: location.lng }}
              zIndex={preview ? 10 : 1}
            >
              <div
                className="relative"
                onMouseEnter={() => setHoveredId(location.id)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(location.id)}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget))
                    setHoveredId(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setHoveredId(null)
                    onDismiss()
                  }
                }}
              >
                <button
                  type="button"
                  aria-label={`View ${location.name}`}
                  aria-expanded={preview}
                  onClick={() => {
                    if (!creating) onSelect(location)
                  }}
                  className={`flex size-11 items-center justify-center rounded-full border-2 bg-deep-forest shadow-lg ${selected?.id === location.id ? 'border-parchment ring-4 ring-brass/40' : 'border-parchment/70'}`}
                >
                  <MapPin
                    className="size-6"
                    style={{ color: location.color ?? DEFAULT_LOCATION_COLOR }}
                    aria-hidden="true"
                  />
                </button>
                {preview && (
                  <div className="absolute bottom-full left-1/2 w-60 -translate-x-1/2 pb-3">
                    <div
                      className="relative rounded-xl border border-forest-light bg-deep-forest p-4 font-sans text-parchment shadow-xl"
                      role="region"
                      aria-label={`${location.name} details`}
                    >
                      <button
                        type="button"
                        aria-label="Close location details"
                        onClick={() => {
                          setHoveredId(null)
                          onDismiss()
                        }}
                        className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-md text-weathered hover:text-parchment"
                      >
                        <X className="size-4" />
                      </button>
                      <h3 className="pr-8 font-display text-xl break-words">
                        {location.name}
                      </h3>
                      <p className="mt-2 font-mono text-xs text-brass-light">
                        {location.photo_count} photos
                        {location.direction_compass !== null
                          ? ` · ${location.direction_compass}°`
                          : ''}
                      </p>
                      {location.notes !== null && location.notes !== '' && (
                        <p className="mt-3 max-h-24 overflow-y-auto break-words text-sm leading-6 text-weathered">
                          {location.notes}
                        </p>
                      )}
                      {location.direction_notes !== null &&
                        location.direction_notes !== '' && (
                          <p className="mt-2 break-words text-xs leading-5 text-weathered">
                            Facing: {location.direction_notes}
                          </p>
                        )}
                      <Link
                        href={`/photos?triageView=all&areaName=${encodeURIComponent(location.name)}`}
                        className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-brass-light"
                      >
                        View photos
                        <ArrowRight className="size-4" />
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </AdvancedMarker>
          )
        })}
      </Map>
      {creating && (
        <div className="absolute inset-x-3 top-20 rounded-lg border border-brass/40 bg-deep-forest p-4 shadow-lg sm:left-4 sm:right-auto sm:max-w-xs">
          <p className="text-sm leading-6 text-parchment">
            Move the map to your camera spot, then tap to place a pin.
          </p>
          <Button
            className="mt-3 min-h-11"
            disabled={map === null}
            onClick={() => {
              const center = map?.getCenter()
              if (center !== undefined) onPlace(center.toJSON())
            }}
          >
            Use map center
          </Button>
        </div>
      )}
    </>
  )
}

export function LocationsMap(): React.JSX.Element {
  const { data, isLoading, isError, refetch } = useLocations()
  const locations = useMemo(() => data?.locations ?? [], [data])
  const [query, setQuery] = useState('')
  const [listOpen, setListOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [pin, setPin] = useState<Point | null>(null)
  const [coordinatesOpen, setCoordinatesOpen] = useState(false)
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [coordinateError, setCoordinateError] = useState('')
  const [editing, setEditing] = useState<LocationWithPhotoCount | null>(null)
  const [mapType, setMapType] = useState<MapKind>('hybrid')
  const [fitVersion, setFitVersion] = useState(0)
  const [mapFailed, setMapFailed] = useState(false)
  const mapPanel = useRef<HTMLDivElement>(null)
  const selected =
    locations.find((location) => location.id === selectedId) ?? null
  const filtered = locations.filter((location) =>
    `${location.name} ${location.notes ?? ''}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )
  const mapAvailable = API_KEY !== undefined && API_KEY !== '' && !mapFailed

  function startCreate(): void {
    setSelectedId(null)
    if (!mapAvailable) {
      setCoordinatesOpen(true)
      return
    }
    setCreating(true)
    setListOpen(false)
    mapPanel.current?.scrollIntoView({ block: 'nearest' })
  }
  function cancelCreate(): void {
    setCreating(false)
    setPin(null)
  }
  function selectLocation(location: LocationWithPhotoCount): void {
    setSelectedId(location.id)
    setCreating(false)
  }

  return (
    <div data-map-workspace className="relative flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-forest-light px-4 py-3 lg:px-6">
        <div className="flex items-center gap-3">
          <h1 className="pr-9 font-display text-2xl">Locations</h1>
          <span className="hidden text-xs text-weathered sm:inline">
            Know your ground.
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="min-h-11 md:hidden"
            aria-expanded={listOpen}
            onClick={() => setListOpen((open) => !open)}
          >
            {listOpen ? 'Hide places' : `Places (${locations.length})`}
          </Button>
          <Button
            onClick={startCreate}
            disabled={creating}
            className="min-h-11"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Add location</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 md:grid-cols-[300px_1fr] lg:grid-cols-[320px_1fr]">
        <section
          aria-label="Saved locations"
          className={`${listOpen ? 'flex' : 'hidden'} absolute inset-x-3 bottom-3 top-[76px] z-40 min-h-0 flex-col overflow-y-auto rounded-xl border border-forest-light bg-deep-forest p-4 shadow-xl md:static md:z-auto md:flex md:rounded-none md:border-0 md:border-r md:p-5 md:shadow-none`}
        >
          {isError && (
            <div className="mb-4">
              <PageState
                error
                title="Locations couldn’t load."
                description="Try reconnecting to your saved places."
              >
                <Button
                  onClick={() => {
                    void refetch()
                  }}
                >
                  Try again
                </Button>
              </PageState>
            </div>
          )}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[11px] uppercase tracking-[0.18em] text-weathered">
              Your places
            </h2>
            <span className="font-mono text-xs text-brass-light">
              {isLoading ? '—' : locations.length}
            </span>
          </div>
          <div className="relative mb-4">
            <Search
              className="pointer-events-none absolute left-3 top-4 size-4 text-weathered"
              aria-hidden="true"
            />
            <Input
              aria-label="Search locations"
              placeholder="Find a place…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-12 md:h-12 pl-10"
            />
          </div>
          {isLoading ? (
            <p role="status" className="py-8 text-sm text-weathered">
              Loading your places…
            </p>
          ) : locations.length === 0 && !isError ? (
            <div className="rounded-xl border border-dashed border-forest-light p-6">
              <MapPin className="mb-5 size-6 text-brass" aria-hidden="true" />
              <h3 className="pr-9 font-display text-2xl">
                Make your first mark.
              </h3>
              <p className="mt-3 text-sm leading-7 text-weathered">
                Save a camera spot or a familiar corner of your property. Add
                field notes so you can find it again.
              </p>
              <Button onClick={startCreate} className="mt-5 min-h-11">
                Add your first location
              </Button>
            </div>
          ) : filtered.length === 0 && !isError ? (
            <p className="py-6 text-sm text-weathered">
              No places match “{query}”. Try another name.
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((location) => (
                <li
                  key={location.id}
                  className={`overflow-hidden rounded-lg border ${selectedId === location.id ? 'border-brass/60 bg-forest' : 'border-forest-light/70 bg-forest/20'}`}
                >
                  <button
                    type="button"
                    aria-pressed={selectedId === location.id}
                    onClick={() => selectLocation(location)}
                    className="flex w-full items-start gap-3 p-4 text-left hover:bg-forest/50"
                  >
                    <span
                      className="mt-2 size-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          location.color ?? DEFAULT_LOCATION_COLOR,
                      }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block break-words font-display text-xl text-parchment">
                        {location.name}
                      </span>
                      <span className="mt-2 block font-mono text-[11px] text-weathered">
                        {location.photo_count} photos
                        {location.direction_compass !== null
                          ? ` · ${location.direction_compass}°`
                          : ''}
                      </span>
                    </span>
                  </button>
                  {selectedId === location.id && (
                    <div className="border-t border-forest-light px-4 pb-4 pt-3">
                      {location.notes !== null && location.notes !== '' && (
                        <p className="mb-3 break-words text-sm leading-6 text-weathered">
                          {location.notes}
                        </p>
                      )}
                      {location.direction_notes !== null &&
                        location.direction_notes !== '' && (
                          <p className="mb-3 text-xs leading-6 text-weathered">
                            Facing: {location.direction_notes}
                          </p>
                        )}
                      <p className="mb-3 font-mono text-[10px] text-weathered">
                        {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setEditing(location)}
                          className="min-h-11"
                        >
                          <Pencil className="size-3.5" aria-hidden="true" />
                          Edit
                        </Button>
                        <Button asChild className="min-h-11">
                          <Link
                            href={`/photos?triageView=all&areaName=${encodeURIComponent(location.name)}`}
                          >
                            View photos
                            <ArrowRight
                              className="size-3.5"
                              aria-hidden="true"
                            />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => {
              setCoordinateError('')
              setCoordinatesOpen(true)
            }}
            className="mt-3 inline-flex min-h-11 items-center text-xs text-weathered underline underline-offset-4 hover:text-parchment"
          >
            Add using coordinates
          </button>
        </section>
        <section
          ref={mapPanel}
          aria-label="Property map"
          className="relative flex min-h-0 min-w-0 flex-col overflow-hidden"
        >
          <div className="absolute inset-x-3 top-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-forest-light bg-deep-forest/95 px-2 py-1 shadow-lg sm:left-auto">
            <div className="flex gap-1" aria-label="Map style">
              {(['hybrid', 'terrain'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={mapType === kind}
                  onClick={() => setMapType(kind)}
                  className={`min-h-11 rounded-md px-3 text-xs ${mapType === kind ? 'bg-forest text-brass-light' : 'text-weathered hover:text-parchment'}`}
                >
                  {kind === 'hybrid' ? 'Satellite' : 'Terrain'}
                </button>
              ))}
            </div>
            {creating ? (
              <Button
                variant="ghost"
                onClick={cancelCreate}
                className="min-h-11"
              >
                <X className="size-4" aria-hidden="true" />
                Cancel pin
              </Button>
            ) : (
              <Button
                variant="ghost"
                onClick={() => {
                  setSelectedId(null)
                  setFitVersion((value) => value + 1)
                }}
                disabled={locations.length === 0 || !mapAvailable}
                className="min-h-11 text-xs"
              >
                <Crosshair className="size-4" aria-hidden="true" />
                All locations
              </Button>
            )}
          </div>
          <div className="relative min-h-0 flex-1 bg-forest/20">
            {mapAvailable ? (
              <APIProvider apiKey={API_KEY} onError={() => setMapFailed(true)}>
                <MapCanvas
                  locations={locations}
                  selected={selected}
                  onSelect={selectLocation}
                  creating={creating}
                  onPlace={setPin}
                  mapType={mapType}
                  fitVersion={fitVersion}
                  onDismiss={() => setSelectedId(null)}
                />
              </APIProvider>
            ) : (
              <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-sm">
                  <MapPin
                    className="mb-5 size-8 text-brass"
                    aria-hidden="true"
                  />
                  <h2 className="font-display text-3xl">
                    Your places, still within reach.
                  </h2>
                  <p className="mt-4 text-sm leading-7 text-weathered">
                    The map is unavailable right now. Browse your saved
                    locations or add a new place using coordinates.
                  </p>
                  <Button
                    onClick={() => setCoordinatesOpen(true)}
                    className="mt-5 min-h-11"
                  >
                    Enter coordinates
                  </Button>
                </div>
              </div>
            )}
          </div>
          <p className="pointer-events-none absolute bottom-7 left-3 right-3 hidden max-w-md rounded-md bg-deep-forest/90 px-3 py-2 text-[11px] leading-5 text-weathered sm:block">
            {creating
              ? 'Place a pin to add a name and field notes.'
              : 'Hover over a pin for a preview, or tap to keep its details open. Scroll to zoom. Drag to move, or pinch to zoom on your phone.'}
          </p>
        </section>
      </div>
      <Dialog
        open={pin !== null}
        onOpenChange={(open) => {
          if (!open) cancelCreate()
        }}
      >
        <DialogContent className="bg-deep-forest sm:max-w-lg">
          <DialogHeader className="text-left">
            <DialogTitle className="pr-9 font-display text-2xl">
              Name this place.
            </DialogTitle>
            <DialogDescription>
              Save your camera spot and the details you want to remember.
            </DialogDescription>
          </DialogHeader>
          {pin !== null && (
            <LocationCreateForm
              lat={pin.lat}
              lng={pin.lng}
              onCancel={cancelCreate}
              onSuccess={(locationId) => {
                cancelCreate()
                setSelectedId(locationId)
                setListOpen(false)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={coordinatesOpen} onOpenChange={setCoordinatesOpen}>
        <DialogContent className="bg-deep-forest">
          <DialogHeader className="text-left">
            <DialogTitle className="pr-9 font-display text-2xl">
              Place a location
            </DialogTitle>
            <DialogDescription>
              Enter decimal coordinates from your camera or map.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault()
              const lat = Number(latitude),
                lng = Number(longitude)
              if (
                latitude.trim() === '' ||
                longitude.trim() === '' ||
                !Number.isFinite(lat) ||
                !Number.isFinite(lng) ||
                Math.abs(lat) > 90 ||
                Math.abs(lng) > 180
              ) {
                setCoordinateError(
                  'Enter a latitude from −90 to 90 and a longitude from −180 to 180.',
                )
                return
              }
              setCoordinateError('')
              setCoordinatesOpen(false)
              setPin({ lat, lng })
            }}
          >
            <div>
              <label htmlFor="location-latitude" className="mb-2 block text-sm">
                Latitude
              </label>
              <Input
                id="location-latitude"
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                placeholder="e.g. 30.2672"
                className="h-12 md:h-12"
              />
            </div>
            <div>
              <label
                htmlFor="location-longitude"
                className="mb-2 block text-sm"
              >
                Longitude
              </label>
              <Input
                id="location-longitude"
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                placeholder="e.g. -97.7431"
                className="h-12 md:h-12"
              />
            </div>
            {coordinateError !== '' && (
              <p role="alert" className="text-sm text-destructive">
                {coordinateError}
              </p>
            )}
            <Button type="submit" className="min-h-12 w-full">
              Continue
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      {editing !== null && (
        <LocationEditDialog
          location={editing}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
        />
      )}
    </div>
  )
}
