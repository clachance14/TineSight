# Research: Photo Location Feature

**Feature**: 010-photo-location
**Date**: 2025-12-19

## 1. Mapbox Integration with Next.js 14

### Decision
Use `react-map-gl` v7+ with `mapbox-gl` for the interactive map component.

### Rationale
- react-map-gl is the de facto React wrapper for Mapbox GL JS
- v7+ has cleaner import paths and better TypeScript support
- Well-documented integration patterns for Next.js App Router
- Supports both satellite and outdoors (topo) map styles out of the box

### Alternatives Considered
| Alternative | Rejected Because |
|-------------|------------------|
| MapLibre | Requires different tile sources; Mapbox tiles preferred for satellite imagery quality |
| Leaflet | Less performant for satellite tiles; older API patterns |
| Google Maps | Additional API cost; overkill for pin placement use case |

### Implementation Pattern

```typescript
'use client'

import Map, { Marker, NavigationControl } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'

// Token from environment
const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN

// Map click for pin placement
const handleMapClick = (event: { lngLat: { lng: number; lat: number } }) => {
  setPinLocation({ lat: event.lngLat.lat, lng: event.lngLat.lng })
}
```

### Key Requirements
- `'use client'` directive required (Mapbox needs browser APIs)
- CSS import required: `mapbox-gl/dist/mapbox-gl.css`
- Token must use `NEXT_PUBLIC_` prefix for client access
- Use `anchor="bottom"` on Marker for correct pin placement

---

## 2. Database Schema Extension

### Decision
Add 5 nullable columns to existing `processing_batches` table.

### Rationale
- Location belongs at batch level per spec (cameras can move between uploads)
- Nullable columns allow uploads without location (skip flow)
- DECIMAL(9,6) provides ~11cm precision for coordinates
- Partial index on area_name optimizes filtering without indexing nulls

### Schema

```sql
ALTER TABLE processing_batches
ADD COLUMN location_lat DECIMAL(9,6),
ADD COLUMN location_lng DECIMAL(9,6),
ADD COLUMN area_name TEXT,
ADD COLUMN direction_compass INT CHECK (direction_compass IS NULL OR (direction_compass >= 0 AND direction_compass <= 360)),
ADD COLUMN direction_notes TEXT;

CREATE INDEX idx_processing_batches_area_name
ON processing_batches(area_name) WHERE area_name IS NOT NULL;
```

### Alternatives Considered
| Alternative | Rejected Because |
|-------------|------------------|
| Separate locations table | Over-engineering; location is 1:1 with batch |
| PostGIS POINT type | Additional extension; simple lat/lng sufficient for filtering |
| Location on images table | Spec explicitly requires batch-level location |

---

## 3. Area Name Autocomplete

### Decision
Client-side filtering of existing area names fetched via TanStack Query.

### Rationale
- Area names per user are typically <50; full list fits in memory
- Eliminates server roundtrips while typing
- TanStack Query provides caching (5 min stale time)
- Simple input with datalist or custom dropdown

### Implementation Pattern

```typescript
// Hook: lib/hooks/use-areas.ts
export function useAreas() {
  return useQuery({
    queryKey: ['areas'],
    queryFn: () => fetch('/api/photos/areas').then(r => r.json()),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// API: SELECT DISTINCT area_name FROM processing_batches WHERE user_id = $1
```

### Alternatives Considered
| Alternative | Rejected Because |
|-------------|------------------|
| Server-side search-as-you-type | Latency overhead; unnecessary for small datasets |
| No autocomplete | Clarification session confirmed autocomplete is desired (FR-015) |

---

## 4. Map Styles

### Decision
Offer two styles: Satellite Streets and Outdoors (Topo).

### Rationale
- Satellite: Primary use case - users identify landmarks on their property
- Outdoors/Topo: Helpful for terrain features, elevation context
- Both are built-in Mapbox styles (no custom style hosting needed)

### Style URLs

```typescript
const MAP_STYLES = {
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  outdoors: 'mapbox://styles/mapbox/outdoors-v12',
}
```

---

## 5. Compass Direction Storage

### Decision
Store as integer degrees (0-360), map from 8-point UI selection.

### Rationale
- Integer storage is more efficient than string
- 0-360 degrees is standard compass representation
- UI shows 8 cardinal/intercardinal points for simplicity
- Database constraint ensures valid range

### Mapping

```typescript
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
```

---

## 6. Area Filter Implementation

### Decision
Filter via batch join - get batch IDs with matching area_name, then filter images.

### Rationale
- Images reference batches via `batch_id` foreign key
- Two-step query (get batch IDs → filter images) is simple and efficient
- Supports "No Area Assigned" by filtering for NULL area_name
- Existing photos service pattern extended, not replaced

### Query Pattern

```sql
-- Step 1: Get batch IDs with matching area
SELECT id FROM processing_batches
WHERE user_id = $1 AND area_name = $2;

-- Step 2: Filter images by batch IDs
SELECT * FROM images
WHERE user_id = $1 AND batch_id = ANY($2);
```

---

## 7. Dependencies

### Decision
Add react-map-gl and mapbox-gl to dependencies.

### Packages

```json
{
  "dependencies": {
    "react-map-gl": "^7.1.7",
    "mapbox-gl": "^3.8.0"
  },
  "devDependencies": {
    "@types/mapbox-gl": "^3.4.1"
  }
}
```

### Environment Variable

```bash
# .env.example addition
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_mapbox_token_here
```

---

## Summary

All technical unknowns resolved. Key decisions:
1. react-map-gl v7+ for map component
2. Extend processing_batches with 5 location columns
3. Client-side area autocomplete via TanStack Query
4. Two map styles: satellite and topo
5. Compass direction as integer degrees (0-360)
6. Two-step batch-join query for area filtering
