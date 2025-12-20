# Photo Location Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add location data to photo uploads, allowing users to specify where photos were taken on a Mapbox map before upload begins.

**Architecture:** Location data is stored at the batch level (`processing_batches` table), not on individual photos or cameras. When users drop files onto the uploader, a modal appears with a Mapbox map for pin placement. Users name the area, optionally set camera direction, then confirm or skip. All photos in the batch inherit the batch's location. Photos can then be filtered by area name.

**Tech Stack:** Next.js 14, React 18, react-map-gl, mapbox-gl, Zustand, Supabase PostgreSQL, TailwindCSS, shadcn/ui

---

## Prerequisites

Before starting, ensure you have:
1. A Mapbox account with an access token (public scopes: STYLES:TILES, STYLES:READ, FONTS:READ, DATASETS:READ, VISION:READ)
2. Supabase CLI linked to the project

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/025_batch_location.sql`

**Step 1: Write the migration file**

```sql
-- Add location fields to processing_batches table
-- Location is tied to batch (not camera) because cameras can move between uploads

ALTER TABLE processing_batches
ADD COLUMN location_lat DECIMAL(9,6),
ADD COLUMN location_lng DECIMAL(9,6),
ADD COLUMN area_name TEXT,
ADD COLUMN direction_compass INT CHECK (direction_compass IS NULL OR (direction_compass >= 0 AND direction_compass <= 360)),
ADD COLUMN direction_notes TEXT;

-- Index for filtering by area name
CREATE INDEX idx_processing_batches_area_name ON processing_batches(area_name) WHERE area_name IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN processing_batches.location_lat IS 'Latitude coordinate where photos were taken';
COMMENT ON COLUMN processing_batches.location_lng IS 'Longitude coordinate where photos were taken';
COMMENT ON COLUMN processing_batches.area_name IS 'User-defined name for the location (e.g., North Ridge, Creek Bottom)';
COMMENT ON COLUMN processing_batches.direction_compass IS 'Camera facing direction in degrees (0-360, 0=North)';
COMMENT ON COLUMN processing_batches.direction_notes IS 'Free-text description of camera direction (e.g., Facing food plot)';
```

**Step 2: Run the migration**

Run: `npx supabase db push`

Expected: Migration applies successfully

**Step 3: Regenerate TypeScript types**

Run: `npx supabase gen types typescript --linked > types/database.ts`

Expected: `types/database.ts` updated with new columns in `ProcessingBatch` type

**Step 4: Commit**

```bash
git add supabase/migrations/025_batch_location.sql types/database.ts
git commit -m "feat: add location fields to processing_batches table"
```

---

## Task 2: Install Dependencies and Environment Setup

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `.env.local` (manually)

**Step 1: Install Mapbox dependencies**

Run: `npm install react-map-gl mapbox-gl`

Expected: Packages added to package.json

**Step 2: Install TypeScript types**

Run: `npm install -D @types/mapbox-gl`

Expected: Types added to devDependencies

**Step 3: Add environment variable to .env.example**

Open `.env.example` and add at the end:

```bash
# Mapbox (for location picker map)
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_mapbox_token_here
```

**Step 4: Add your actual token to .env.local**

Open `.env.local` and add:

```bash
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.eyJ1Ijoi...your_actual_token
```

**Step 5: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "feat: add react-map-gl and mapbox-gl dependencies"
```

---

## Task 3: Create Location Data Types

**Files:**
- Modify: `lib/stores/upload.ts`

**Step 1: Add LocationData interface to upload store**

Add this interface near the top of `lib/stores/upload.ts` (after the existing interfaces around line 35):

```typescript
export interface LocationData {
  lat: number
  lng: number
  areaName: string
  directionCompass?: number  // 0-360 degrees, optional
  directionNotes?: string    // Free text, optional
}
```

**Step 2: Add location state to UploadState interface**

Add these fields to the `UploadState` interface (around line 37-58):

```typescript
interface UploadState {
  // State
  uploadQueue: UploadFile[]
  currentBatchId: string | null
  isPreparing: boolean
  isUploading: boolean
  overallProgress: number
  completedCount: number
  failedCount: number
  totalCount: number
  // NEW: Location state
  pendingLocation: LocationData | null
  showLocationPicker: boolean

  // Actions
  addFiles: (files: FileWithMetadata[]) => void
  removeFile: (id: string) => void
  clearQueue: () => void
  setIsPreparing: (isPreparing: boolean) => void
  startUpload: (batchId: string, uploadData: UploadInitData[]) => void
  updateFileProgress: (id: string, progress: number) => void
  markFileCompleted: (id: string) => void
  markFileFailed: (id: string, error: string) => void
  reset: () => void
  // NEW: Location actions
  setPendingLocation: (location: LocationData | null) => void
  setShowLocationPicker: (show: boolean) => void
}
```

**Step 3: Add location to initial state**

Update the `initialState` object (around line 60):

```typescript
const initialState = {
  uploadQueue: [],
  currentBatchId: null,
  isPreparing: false,
  isUploading: false,
  overallProgress: 0,
  completedCount: 0,
  failedCount: 0,
  totalCount: 0,
  // NEW
  pendingLocation: null,
  showLocationPicker: false,
}
```

**Step 4: Add location actions to store**

Add these actions inside the `create<UploadState>` function (after `reset: () => set(initialState),` around line 227):

```typescript
  setPendingLocation: (location) => set({ pendingLocation: location }),
  setShowLocationPicker: (show) => set({ showLocationPicker: show }),
```

**Step 5: Verify no TypeScript errors**

Run: `npm run type-check`

Expected: No errors

**Step 6: Commit**

```bash
git add lib/stores/upload.ts
git commit -m "feat: add location state to upload store"
```

---

## Task 4: Create Location Picker Modal Component

**Files:**
- Create: `components/photos/location-picker-modal.tsx`

**Step 1: Create the location picker modal component**

Create file `components/photos/location-picker-modal.tsx`:

```tsx
'use client'

import { useState, useCallback } from 'react'
import Map, { Marker, NavigationControl } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MapPin, Compass, Mountain, Satellite } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { LocationData } from '@/lib/stores/upload'

// Mapbox style URLs
const MAP_STYLES = {
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  outdoors: 'mapbox://styles/mapbox/outdoors-v12',
} as const

type MapStyleKey = keyof typeof MAP_STYLES

// Compass directions
const COMPASS_DIRECTIONS = [
  { label: 'N', degrees: 0 },
  { label: 'NE', degrees: 45 },
  { label: 'E', degrees: 90 },
  { label: 'SE', degrees: 135 },
  { label: 'S', degrees: 180 },
  { label: 'SW', degrees: 225 },
  { label: 'W', degrees: 270 },
  { label: 'NW', degrees: 315 },
] as const

interface LocationPickerModalProps {
  open: boolean
  onSkip: () => void
  onConfirm: (location: LocationData) => void
  photoCount: number
}

export function LocationPickerModal({
  open,
  onSkip,
  onConfirm,
  photoCount,
}: LocationPickerModalProps) {
  // Map state
  const [mapStyle, setMapStyle] = useState<MapStyleKey>('satellite')
  const [viewState, setViewState] = useState({
    longitude: -98.5795, // Center of US (Texas)
    latitude: 39.8283,
    zoom: 4,
  })

  // Pin state
  const [pinLocation, setPinLocation] = useState<{ lat: number; lng: number } | null>(null)

  // Form state
  const [areaName, setAreaName] = useState('')
  const [directionCompass, setDirectionCompass] = useState<number | null>(null)
  const [directionNotes, setDirectionNotes] = useState('')

  // Handle map click to place/move pin
  const handleMapClick = useCallback((event: { lngLat: { lng: number; lat: number } }) => {
    setPinLocation({
      lat: event.lngLat.lat,
      lng: event.lngLat.lng,
    })
  }, [])

  // Handle confirm
  const handleConfirm = () => {
    if (!pinLocation || !areaName.trim()) return

    onConfirm({
      lat: pinLocation.lat,
      lng: pinLocation.lng,
      areaName: areaName.trim(),
      directionCompass: directionCompass ?? undefined,
      directionNotes: directionNotes.trim() || undefined,
    })

    // Reset state for next use
    resetState()
  }

  // Handle skip
  const handleSkip = () => {
    onSkip()
    resetState()
  }

  // Reset form state
  const resetState = () => {
    setPinLocation(null)
    setAreaName('')
    setDirectionCompass(null)
    setDirectionNotes('')
  }

  const canConfirm = pinLocation !== null && areaName.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleSkip()}>
      <DialogContent
        className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0"
        showCloseButton={false}
      >
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Set Photo Location</DialogTitle>
          <DialogDescription>
            Click on the map to set the location for {photoCount} photo{photoCount !== 1 ? 's' : ''}.
            This helps track where deer are spotted on your property.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex gap-4 px-6 min-h-0">
          {/* Map */}
          <div className="flex-1 relative rounded-lg overflow-hidden border border-slate">
            <Map
              {...viewState}
              onMove={(evt) => setViewState(evt.viewState)}
              onClick={handleMapClick}
              mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}
              mapStyle={MAP_STYLES[mapStyle]}
              style={{ width: '100%', height: '100%' }}
              cursor={pinLocation ? 'default' : 'crosshair'}
            >
              <NavigationControl position="top-right" />

              {/* Pin marker */}
              {pinLocation && (
                <Marker
                  longitude={pinLocation.lng}
                  latitude={pinLocation.lat}
                  anchor="bottom"
                >
                  <MapPin className="h-8 w-8 text-copper fill-copper/30 drop-shadow-lg" />
                </Marker>
              )}
            </Map>

            {/* Style toggle */}
            <div className="absolute top-3 left-3 flex gap-1 bg-slate-deep/90 rounded-lg p-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMapStyle('satellite')}
                className={cn(
                  'h-8 px-3 gap-1.5',
                  mapStyle === 'satellite' && 'bg-copper text-white hover:bg-copper hover:text-white'
                )}
              >
                <Satellite className="h-4 w-4" />
                Satellite
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMapStyle('outdoors')}
                className={cn(
                  'h-8 px-3 gap-1.5',
                  mapStyle === 'outdoors' && 'bg-copper text-white hover:bg-copper hover:text-white'
                )}
              >
                <Mountain className="h-4 w-4" />
                Topo
              </Button>
            </div>

            {/* Instructions overlay when no pin */}
            {!pinLocation && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-slate-deep/80 text-cream px-4 py-2 rounded-lg text-sm">
                  Click anywhere on the map to place a pin
                </div>
              </div>
            )}
          </div>

          {/* Form sidebar */}
          <div className="w-72 flex flex-col gap-4 overflow-y-auto">
            {/* Area Name */}
            <div className="space-y-2">
              <Label htmlFor="area-name">
                Area Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="area-name"
                placeholder="e.g., North Ridge, Creek Bottom"
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
              />
              <p className="text-xs text-cream-dark">
                Give this location a name you&apos;ll recognize
              </p>
            </div>

            {/* Compass Direction */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Compass className="h-4 w-4" />
                Camera Direction
                <span className="text-xs text-cream-dark">(optional)</span>
              </Label>
              <div className="grid grid-cols-4 gap-1">
                {COMPASS_DIRECTIONS.map((dir) => (
                  <Button
                    key={dir.label}
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDirectionCompass(directionCompass === dir.degrees ? null : dir.degrees)
                    }
                    className={cn(
                      'h-9',
                      directionCompass === dir.degrees &&
                        'bg-copper text-white border-copper hover:bg-copper hover:text-white'
                    )}
                  >
                    {dir.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Direction Notes */}
            <div className="space-y-2">
              <Label htmlFor="direction-notes">
                Direction Notes
                <span className="text-xs text-cream-dark ml-2">(optional)</span>
              </Label>
              <Textarea
                id="direction-notes"
                placeholder="e.g., Facing the food plot"
                value={directionNotes}
                onChange={(e) => setDirectionNotes(e.target.value)}
                rows={2}
              />
            </div>

            {/* Coordinates display */}
            {pinLocation && (
              <div className="p-3 rounded-lg bg-slate/50 text-xs">
                <p className="text-cream-dark mb-1">Selected Coordinates:</p>
                <p className="font-mono text-cream">
                  {pinLocation.lat.toFixed(6)}, {pinLocation.lng.toFixed(6)}
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-slate">
          <Button variant="ghost" onClick={handleSkip}>
            Skip - Upload without location
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="bg-copper hover:bg-copper-light text-slate-deep"
          >
            Confirm Location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: Verify no TypeScript errors**

Run: `npm run type-check`

Expected: No errors

**Step 3: Commit**

```bash
git add components/photos/location-picker-modal.tsx
git commit -m "feat: create location picker modal component with Mapbox"
```

---

## Task 5: Integrate Location Modal into Upload Page

**Files:**
- Modify: `app/(dashboard)/upload/page.tsx`
- Modify: `components/photos/photo-uploader.tsx`

**Step 1: Update photo-uploader.tsx to trigger location picker**

In `components/photos/photo-uploader.tsx`, update the `onDrop` callback to trigger location picker after processing files.

First, add the import and update the props interface (around line 22):

```typescript
interface PhotoUploaderProps {
  onStartUpload?: () => void
  onFilesReady?: () => void  // NEW: Called after files are processed, before upload
  className?: string
}
```

Update the component function signature:

```typescript
export function PhotoUploader({ onStartUpload, onFilesReady, className }: PhotoUploaderProps) {
```

At the end of the `onDrop` callback (around line 181, after `addFiles(processedFiles)`), add:

```typescript
        // Add files with metadata to upload queue
        addFiles(processedFiles)
        setIsProcessing(false)
        setProcessingProgress({ current: 0, total: 0 })

        // NEW: Notify parent that files are ready (triggers location picker)
        if (onFilesReady) {
          onFilesReady()
        }
      }
    },
    [addFiles, generateThumbnail, onFilesReady]  // Add onFilesReady to deps
  )
```

**Step 2: Update upload page to show location modal**

In `app/(dashboard)/upload/page.tsx`, add location modal integration.

Update imports at the top:

```typescript
'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { PhotoUploader } from '@/components/photos/photo-uploader'
import { UploadProgressPanel } from '@/components/photos/upload-progress-panel'
import { LocationPickerModal } from '@/components/photos/location-picker-modal'  // NEW
import { useUploadStore } from '@/lib/stores/upload'
import type { LocationData } from '@/lib/stores/upload'  // NEW
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Image } from 'lucide-react'
```

Update the store destructuring (around line 25):

```typescript
  const {
    uploadQueue,
    setIsPreparing,
    startUpload,
    updateFileProgress,
    markFileCompleted,
    markFileFailed,
    // NEW: Location state
    pendingLocation,
    showLocationPicker,
    setPendingLocation,
    setShowLocationPicker,
  } = useUploadStore()
```

Add location handlers after the `handleStartUpload` callback (around line 152):

```typescript
  // NEW: Handle files ready - show location picker
  const handleFilesReady = useCallback(() => {
    setShowLocationPicker(true)
  }, [setShowLocationPicker])

  // NEW: Handle location skip - proceed without location
  const handleLocationSkip = useCallback(() => {
    setShowLocationPicker(false)
    setPendingLocation(null)
  }, [setShowLocationPicker, setPendingLocation])

  // NEW: Handle location confirm - store location and close modal
  const handleLocationConfirm = useCallback((location: LocationData) => {
    setPendingLocation(location)
    setShowLocationPicker(false)
  }, [setPendingLocation, setShowLocationPicker])
```

Update the `handleStartUpload` function to include location data in the API call (around line 47):

```typescript
        // Step 1: Initialize batch and get signed URLs for this chunk
        const response = await fetch('/api/photos/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: chunk.map((f) => ({
              id: f.id,
              filename: f.filename,
              contentType: f.file.type,
              size: f.file.size,
              capturedAt: f.capturedAt?.toISOString(),
              make: f.make,
              model: f.model,
              deviceIdentifier: f.deviceIdentifier,
              exifSignature: f.exifSignature,
              exifData: f.exifData,
            })),
            // NEW: Include location data
            locationLat: pendingLocation?.lat,
            locationLng: pendingLocation?.lng,
            areaName: pendingLocation?.areaName,
            directionCompass: pendingLocation?.directionCompass,
            directionNotes: pendingLocation?.directionNotes,
          }),
        })
```

Add `pendingLocation` to the useCallback dependencies:

```typescript
  }, [uploadQueue, setIsPreparing, startUpload, updateFileProgress, markFileCompleted, markFileFailed, queryClient, pendingLocation])
```

Update the PhotoUploader component in JSX to pass the new prop:

```typescript
          <PhotoUploader
            onStartUpload={handleStartUpload}
            onFilesReady={handleFilesReady}  // NEW
          />
```

Add the LocationPickerModal at the end of the component, before the closing `</div>`:

```typescript
      {/* Progress Panel */}
      <UploadProgressPanel />

      {/* NEW: Location Picker Modal */}
      <LocationPickerModal
        open={showLocationPicker}
        onSkip={handleLocationSkip}
        onConfirm={handleLocationConfirm}
        photoCount={uploadQueue.filter(f => f.status === 'pending').length}
      />
    </div>
  )
}
```

**Step 3: Verify no TypeScript errors**

Run: `npm run type-check`

Expected: No errors

**Step 4: Commit**

```bash
git add app/\(dashboard\)/upload/page.tsx components/photos/photo-uploader.tsx
git commit -m "feat: integrate location picker modal into upload flow"
```

---

## Task 6: Update Upload API to Save Location

**Files:**
- Modify: `app/api/photos/upload/route.ts`
- Modify: `lib/services/batches.ts`

**Step 1: Update batches service to accept location**

In `lib/services/batches.ts`, update the `createBatch` function signature and implementation.

Update the function (replace the existing `createBatch` function around line 24-46):

```typescript
/**
 * Create a new processing batch
 */
export async function createBatch(
  userId: string,
  totalImages: number,
  locationData?: {
    locationLat?: number
    locationLng?: number
    areaName?: string
    directionCompass?: number
    directionNotes?: string
  }
): Promise<{
  data: ProcessingBatch | null
  error: Error | null
}> {
  const supabase = await createClient()

  const insertData: ProcessingBatchInsert = {
    user_id: userId,
    total_images: totalImages,
    status: 'pending',
    // Location fields (optional)
    location_lat: locationData?.locationLat ?? null,
    location_lng: locationData?.locationLng ?? null,
    area_name: locationData?.areaName ?? null,
    direction_compass: locationData?.directionCompass ?? null,
    direction_notes: locationData?.directionNotes ?? null,
  }

  const { data, error } = await supabase
    .from('processing_batches')
    .insert(insertData as never)
    .select()
    .single()

  return { data: data as ProcessingBatch | null, error }
}
```

**Step 2: Update upload API route to accept and pass location**

In `app/api/photos/upload/route.ts`, update the request interface and batch creation.

Update `UploadInitiationRequest` interface (around line 33):

```typescript
interface UploadInitiationRequest {
  files: UploadFileRequest[]
  // Location fields (optional)
  locationLat?: number
  locationLng?: number
  areaName?: string
  directionCompass?: number
  directionNotes?: string
}
```

Update the `createBatch` call (around line 113) to pass location data:

```typescript
    // Create processing batch with optional location data
    const { data: batch, error: batchError } = await createBatch(
      user.id,
      body.files.length,
      {
        locationLat: body.locationLat,
        locationLng: body.locationLng,
        areaName: body.areaName,
        directionCompass: body.directionCompass,
        directionNotes: body.directionNotes,
      }
    )
```

**Step 3: Verify no TypeScript errors**

Run: `npm run type-check`

Expected: No errors

**Step 4: Commit**

```bash
git add app/api/photos/upload/route.ts lib/services/batches.ts
git commit -m "feat: save location data to processing batch on upload"
```

---

## Task 7: Add Area Name Filter to Photo Service

**Files:**
- Modify: `lib/services/photos.ts`

**Step 1: Add areaName to PhotoFilters interface**

In `lib/services/photos.ts`, update the `PhotoFilters` interface (around line 5-24):

```typescript
// Filter types for querying photos
export interface PhotoFilters {
  status?: string
  hasDeer?: boolean
  hasDetections?: boolean  // true = with detections, false = without, undefined = all
  batchId?: string
  cameraId?: string
  isArchived?: boolean
  qualityStatus?: string
  minConfidence?: number  // 0-100 integer
  sex?: string  // 'buck' | 'doe' | 'fawn' | 'unknown'
  minPoints?: number
  maxPoints?: number
  sizeClass?: string  // 'trophy' | 'standard' | 'basket' | 'spike' | 'unknown'
  dateFrom?: string  // ISO date string
  dateTo?: string  // ISO date string
  deerId?: string  // Filter by named deer
  areaName?: string  // NEW: Filter by batch area name
  limit?: number
  offset?: number
  cursor?: string  // Photo ID to start after (for cursor-based pagination)
}
```

**Step 2: Add area name filter logic to getPhotos function**

In the `getPhotos` function, add area name filtering. This requires joining with `processing_batches`.

Add a check for area name filter near the top of the function (around line 65, after the detection filter checks):

```typescript
  const needsAreaFilter = filters?.areaName !== undefined
```

For the area filter, we need to first get image IDs from batches with matching area_name. Add this block before the detection filters logic (around line 74):

```typescript
  // If filtering by area name, get image IDs from matching batches first
  let areaFilteredImageIds: string[] | null = null
  if (needsAreaFilter) {
    // Handle special case for "No Area Assigned"
    if (filters!.areaName === '__no_area__') {
      // Get batch IDs with null area_name
      const { data: batchesWithNoArea } = await supabase
        .from('processing_batches')
        .select('id')
        .is('area_name', null)

      const batchIds = (batchesWithNoArea ?? []).map(b => b.id)

      if (batchIds.length === 0) {
        // No batches without area - return empty if this is the only filter
        areaFilteredImageIds = []
      } else {
        // Get images from these batches
        const { data: imagesInBatches } = await supabase
          .from('images')
          .select('id')
          .eq('user_id', userId)
          .in('batch_id', batchIds)

        areaFilteredImageIds = (imagesInBatches ?? []).map(i => i.id)
      }
    } else {
      // Get batch IDs with matching area_name
      const { data: matchingBatches } = await supabase
        .from('processing_batches')
        .select('id')
        .eq('area_name', filters!.areaName!)

      const batchIds = (matchingBatches ?? []).map(b => b.id)

      if (batchIds.length === 0) {
        areaFilteredImageIds = []
      } else {
        // Get images from these batches
        const { data: imagesInBatches } = await supabase
          .from('images')
          .select('id')
          .eq('user_id', userId)
          .in('batch_id', batchIds)

        areaFilteredImageIds = (imagesInBatches ?? []).map(i => i.id)
      }
    }

    // If no images match area filter, return empty early
    if (areaFilteredImageIds !== null && areaFilteredImageIds.length === 0) {
      return { data: [], error: null, count: 0 }
    }
  }
```

In both the detection-filtered query path AND the standard query path, add the area filter.

For the detection-filtered path (inside the `if (needsQualityFilter || needsConfidenceFilter || ...)` block), add after building the query:

```typescript
    // Apply area filter if needed
    if (areaFilteredImageIds !== null) {
      query = query.in('id', areaFilteredImageIds)
    }
```

For the standard query path (the else block starting around line 237), add the same filter:

```typescript
  // Standard query without detection-based filters
  let query = supabase
    .from('images')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })

  // Apply area filter if needed
  if (areaFilteredImageIds !== null) {
    query = query.in('id', areaFilteredImageIds)
  }

  // Apply filters
  // ... rest of existing filters
```

**Step 3: Verify no TypeScript errors**

Run: `npm run type-check`

Expected: No errors

**Step 4: Commit**

```bash
git add lib/services/photos.ts
git commit -m "feat: add area name filter support to photos service"
```

---

## Task 8: Add Distinct Area Names Function to Batches Service

**Files:**
- Modify: `lib/services/batches.ts`

**Step 1: Add getDistinctAreaNames function**

Add this function at the end of `lib/services/batches.ts`:

```typescript
/**
 * Get all distinct area names from batches for a user
 * Used to populate the area filter dropdown
 */
export async function getDistinctAreaNames(
  userId: string
): Promise<{
  data: string[]
  error: Error | null
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('processing_batches')
    .select('area_name')
    .eq('user_id', userId)
    .not('area_name', 'is', null)
    .order('area_name')

  if (error) {
    return { data: [], error }
  }

  // Extract unique area names
  const uniqueNames = [...new Set((data ?? []).map(b => b.area_name).filter(Boolean))] as string[]

  return { data: uniqueNames, error: null }
}
```

**Step 2: Create API route for fetching area names**

Create file `app/api/photos/areas/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDistinctAreaNames } from '@/lib/services/batches'

/**
 * GET /api/photos/areas
 * Get distinct area names for the current user's batches
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError !== null || user === null) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: areaNames, error } = await getDistinctAreaNames(user.id)

    if (error) {
      console.error('Failed to get area names:', error)
      return NextResponse.json({ error: 'Failed to get area names' }, { status: 500 })
    }

    return NextResponse.json({ areas: areaNames })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

**Step 3: Verify no TypeScript errors**

Run: `npm run type-check`

Expected: No errors

**Step 4: Commit**

```bash
git add lib/services/batches.ts app/api/photos/areas/route.ts
git commit -m "feat: add API for fetching distinct area names"
```

---

## Task 9: Add Area Filter to Photos Filter UI

**Files:**
- Modify: `components/photos/photo-filters.tsx`
- Modify: `lib/hooks/use-photos.ts` (if it exists, for fetching areas)

**Step 1: Create hook for fetching area names**

Create file `lib/hooks/use-areas.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'

interface AreasResponse {
  areas: string[]
}

async function fetchAreas(): Promise<AreasResponse> {
  const response = await fetch('/api/photos/areas')
  if (!response.ok) {
    throw new Error('Failed to fetch areas')
  }
  return response.json()
}

export function useAreas() {
  return useQuery({
    queryKey: ['areas'],
    queryFn: fetchAreas,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
```

**Step 2: Update PhotoFilters interface in filter component**

In `components/photos/photo-filters.tsx`, update the `PhotoFilters` interface (around line 9):

```typescript
export interface PhotoFilters {
  status?: 'all' | 'processing' | 'completed' | 'failed'
  hasDeer?: boolean | null
  hasDetections?: boolean | null
  batchId?: string
  qualityStatus?: 'all' | 'high_quality' | 'low_quality' | 'manual_review' | 'pending'
  minConfidence?: number
  sex?: 'buck' | 'doe' | 'fawn' | 'unknown' | 'all'
  minPoints?: number
  maxPoints?: number
  dateFrom?: string
  dateTo?: string
  datePreset?: 'today' | 'last7days' | 'last30days' | 'custom'
  cameraId?: string
  sizeClass?: 'trophy' | 'standard' | 'basket' | 'spike' | 'unknown' | 'all'
  deerId?: string
  areaName?: string  // NEW
}
```

**Step 3: Update PhotoFiltersProps interface**

Update the props interface (around line 32):

```typescript
interface PhotoFiltersProps {
  filters: PhotoFilters
  onFiltersChange: (filters: PhotoFilters) => void
  onOpenDrawer: () => void
  deerList?: DeerOption[]
  areaList?: string[]  // NEW
}
```

**Step 4: Update component to accept and render area filter**

Update the function signature and add the area dropdown. Update around line 51:

```typescript
export function PhotoFilters({ filters, onFiltersChange, onOpenDrawer, deerList = [], areaList = [] }: PhotoFiltersProps) {
```

Update `hasActiveFilters` check to include areaName (around line 53):

```typescript
  const hasActiveFilters =
    (filters.status && filters.status !== 'all') ||
    filters.hasDeer !== null ||
    filters.hasDetections !== null ||
    filters.batchId ||
    (filters.qualityStatus && filters.qualityStatus !== 'all') ||
    filters.minConfidence !== undefined ||
    (filters.sex && filters.sex !== 'all') ||
    filters.minPoints !== undefined ||
    filters.maxPoints !== undefined ||
    (filters.sizeClass && filters.sizeClass !== 'all') ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.datePreset ||
    filters.cameraId ||
    filters.deerId ||
    filters.areaName  // NEW
```

Update `copyFilterUrl` to include areaName (around line 182):

```typescript
    if (filters.areaName) params.set('areaName', filters.areaName)
```

Add the Area dropdown in the JSX, after the Named Deer dropdown (around line 330):

```typescript
        {/* Area/Location Dropdown */}
        {areaList.length > 0 && (
          <Select
            value={filters.areaName ?? "all"}
            onValueChange={(value) => {
              if (value === "all") {
                onFiltersChange(omitProperties(filters, 'areaName'))
              } else {
                onFiltersChange({ ...filters, areaName: value })
              }
            }}
          >
            <SelectTrigger size="sm" className={cn(
              "h-8 text-xs min-w-[120px]",
              filters.areaName && "bg-copper text-white border-copper"
            )}>
              <SelectValue placeholder="Area" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Areas</SelectItem>
              <SelectItem value="__no_area__">No Area Assigned</SelectItem>
              {areaList.map((area) => (
                <SelectItem key={area} value={area}>
                  {area}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
```

**Step 5: Update photos page to fetch and pass areas**

In `app/(dashboard)/photos/page.tsx`, fetch areas and pass to PhotoFilters.

Add import:

```typescript
import { useAreas } from '@/lib/hooks/use-areas'
```

Add the hook call in the component:

```typescript
const { data: areasData } = useAreas()
```

Pass areas to PhotoFilters component:

```typescript
<PhotoFilters
  filters={filters}
  onFiltersChange={setFilters}
  onOpenDrawer={() => setDrawerOpen(true)}
  deerList={deerData?.deer ?? []}
  areaList={areasData?.areas ?? []}  // NEW
/>
```

**Step 6: Verify no TypeScript errors**

Run: `npm run type-check`

Expected: No errors

**Step 7: Commit**

```bash
git add lib/hooks/use-areas.ts components/photos/photo-filters.tsx app/\(dashboard\)/photos/page.tsx
git commit -m "feat: add area name filter dropdown to photos page"
```

---

## Task 10: Test the Complete Flow

**Step 1: Start development server**

Run: `npm run dev`

Expected: Server starts at localhost:3000

**Step 2: Test upload with location**

1. Navigate to `/upload`
2. Drag and drop some test photos
3. Verify location picker modal appears
4. Click on the map to place a pin
5. Enter an area name (e.g., "North Ridge")
6. Optionally select compass direction
7. Click "Confirm Location"
8. Click "Start Upload"
9. Verify upload completes

**Step 3: Test upload without location (skip)**

1. Navigate to `/upload`
2. Drag and drop some test photos
3. In location picker modal, click "Skip"
4. Click "Start Upload"
5. Verify upload completes with null location

**Step 4: Test area filter**

1. Navigate to `/photos`
2. Look for "Area" dropdown in filters
3. Select "North Ridge" (or whatever you named it)
4. Verify only photos from that area are shown
5. Select "No Area Assigned"
6. Verify photos without location are shown
7. Select "All Areas"
8. Verify all photos are shown

**Step 5: Verify database**

Run: `npx supabase studio` or check Supabase dashboard

Check `processing_batches` table:
- Batches with location should have `location_lat`, `location_lng`, `area_name` populated
- Batches without location should have null values

---

## Summary

This implementation adds:

1. **Database**: 5 new columns on `processing_batches` for location data
2. **UI**: Location picker modal with Mapbox satellite/topo toggle
3. **Upload flow**: Modal appears after file selection, before upload
4. **API**: Upload endpoint accepts and saves location data
5. **Filtering**: Area name dropdown in photo filters

The location is tied to batches (not cameras) because cameras can move between uploads. Photos inherit location from their batch via the `batch_id` foreign key.
