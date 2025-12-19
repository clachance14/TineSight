# Data Model: Photo Location

**Feature**: 010-photo-location
**Date**: 2025-12-19

## Entity Changes

### ProcessingBatch (Extended)

The existing `processing_batches` table is extended with location fields. No new tables required.

#### New Fields

| Field | Type | Nullable | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `location_lat` | DECIMAL(9,6) | Yes | -90 to 90 | Latitude coordinate (6 decimal places ≈ 11cm precision) |
| `location_lng` | DECIMAL(9,6) | Yes | -180 to 180 | Longitude coordinate |
| `area_name` | TEXT | Yes | None | User-defined location name (e.g., "North Ridge") |
| `direction_compass` | INT | Yes | 0-360 | Camera facing direction in degrees (0 = North) |
| `direction_notes` | TEXT | Yes | None | Free-text description of camera orientation |

#### Validation Rules

1. **Coordinates**: If `location_lat` is set, `location_lng` must also be set (and vice versa)
2. **Area name**: Required when confirming location; stored as-is (case-sensitive for matching)
3. **Direction compass**: Optional; must be 0-360 when provided
4. **Direction notes**: Optional; no length limit

#### State Transitions

```
Batch Created → Location Set (lat, lng, area_name populated)
                     ↓
              Location Skipped (all location fields remain NULL)
```

Location is immutable after batch creation - changing location requires new upload.

## Relationships

```
┌─────────────────────┐
│  processing_batches │
├─────────────────────┤
│  id (PK)            │
│  user_id (FK)       │──────────┐
│  status             │          │
│  total_images       │          │
│  ...existing...     │          │
│  ─────────────────  │          │
│  location_lat (NEW) │          │
│  location_lng (NEW) │          │
│  area_name (NEW)    │          │
│  direction_compass  │          │
│  direction_notes    │          │
└─────────────────────┘          │
         │                       │
         │ 1:N                   │
         ▼                       │
┌─────────────────────┐          │
│      images         │          │
├─────────────────────┤          │
│  id (PK)            │          │
│  batch_id (FK)      │──────────┤
│  user_id (FK)       │──────────┘
│  ...existing...     │
└─────────────────────┘
```

**Key relationship**: Images inherit location from their batch via `batch_id`. No location fields on images table.

## Indexes

| Index | Columns | Type | Purpose |
|-------|---------|------|---------|
| `idx_processing_batches_area_name` | `area_name` | B-tree (partial) | Filter photos by area; excludes NULL values |

```sql
CREATE INDEX idx_processing_batches_area_name
ON processing_batches(area_name)
WHERE area_name IS NOT NULL;
```

## TypeScript Types

### LocationData (Client State)

```typescript
// lib/stores/upload.ts
export interface LocationData {
  lat: number
  lng: number
  areaName: string
  directionCompass?: number  // 0-360
  directionNotes?: string
}
```

### ProcessingBatch (Database Type)

```typescript
// Generated in types/database.ts after migration
interface ProcessingBatch {
  id: string
  user_id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  total_images: number
  // ... existing fields ...

  // New location fields
  location_lat: number | null
  location_lng: number | null
  area_name: string | null
  direction_compass: number | null
  direction_notes: string | null
}
```

### PhotoFilters (Extended)

```typescript
// lib/services/photos.ts
export interface PhotoFilters {
  // ... existing filters ...
  areaName?: string  // NEW: Filter by batch area name
}
```

## Migration

```sql
-- supabase/migrations/025_batch_location.sql

-- Add location fields to processing_batches table
ALTER TABLE processing_batches
ADD COLUMN location_lat DECIMAL(9,6),
ADD COLUMN location_lng DECIMAL(9,6),
ADD COLUMN area_name TEXT,
ADD COLUMN direction_compass INT CHECK (direction_compass IS NULL OR (direction_compass >= 0 AND direction_compass <= 360)),
ADD COLUMN direction_notes TEXT;

-- Index for filtering by area name (partial - excludes nulls)
CREATE INDEX idx_processing_batches_area_name
ON processing_batches(area_name)
WHERE area_name IS NOT NULL;

-- Documentation comments
COMMENT ON COLUMN processing_batches.location_lat IS 'Latitude coordinate where photos were taken';
COMMENT ON COLUMN processing_batches.location_lng IS 'Longitude coordinate where photos were taken';
COMMENT ON COLUMN processing_batches.area_name IS 'User-defined name for the location (e.g., North Ridge, Creek Bottom)';
COMMENT ON COLUMN processing_batches.direction_compass IS 'Camera facing direction in degrees (0-360, 0=North)';
COMMENT ON COLUMN processing_batches.direction_notes IS 'Free-text description of camera direction (e.g., Facing food plot)';
```

## RLS Considerations

No new RLS policies required. The `processing_batches` table already has RLS enabled with user_id-based policies. Location fields are protected by existing policies:

- SELECT: User can only see their own batches
- INSERT: User can only create batches with their own user_id
- UPDATE: User can only update their own batches

## Query Patterns

### Get Distinct Area Names (for autocomplete/filter dropdown)

```sql
SELECT DISTINCT area_name
FROM processing_batches
WHERE user_id = $1
  AND area_name IS NOT NULL
ORDER BY area_name;
```

### Filter Photos by Area Name

```sql
-- Two-step approach for clarity
-- Step 1: Get batch IDs
SELECT id FROM processing_batches
WHERE user_id = $1 AND area_name = $2;

-- Step 2: Get images from those batches
SELECT * FROM images
WHERE user_id = $1 AND batch_id = ANY($batch_ids)
ORDER BY created_at DESC;
```

### Filter Photos with No Area Assigned

```sql
SELECT i.* FROM images i
JOIN processing_batches b ON i.batch_id = b.id
WHERE i.user_id = $1
  AND b.area_name IS NULL
ORDER BY i.created_at DESC;
```
