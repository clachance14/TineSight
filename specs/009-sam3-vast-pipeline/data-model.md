# Data Model: SAM3 Vast Pipeline

**Feature Branch**: `009-sam3-vast-pipeline`
**Date**: 2025-12-12

## Overview

This document defines the database schema changes required to support the SAM3 detection pipeline alongside the existing Gemini pipeline.

---

## Schema Changes

### Table: `detections`

**New Columns**:

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `analysis_source` | TEXT | YES | NULL | Detection pipeline identifier: 'gemini' or 'sam3' |
| `antler_bbox` | JSONB | YES | NULL | Antler region bounding box `{x, y, width, height}` (0-10000 scale) |
| `sam3_deer_score` | DECIMAL(4,3) | YES | NULL | SAM3 deer detection confidence (0.000-1.000) |
| `sam3_antler_score` | DECIMAL(4,3) | YES | NULL | SAM3 antler detection confidence (0.000-1.000) |

**New Indexes**:

| Index Name | Columns | Type | Condition |
|------------|---------|------|-----------|
| `idx_detections_analysis_source` | `analysis_source` | B-tree | WHERE analysis_source IS NOT NULL |
| `idx_detections_sam3_source` | `image_id, analysis_source` | B-tree | WHERE analysis_source = 'sam3' |

---

## Entity Definitions

### Detection (Updated)

```typescript
interface Detection {
  // Existing fields
  id: string;                          // UUID primary key
  image_id: string;                    // FK to images
  deer_id: string | null;              // FK to deer (linked after matching)
  bbox_x: number;                      // Center X (0-10000)
  bbox_y: number;                      // Center Y (0-10000)
  bbox_width: number;                  // Width (0-10000)
  bbox_height: number;                 // Height (0-10000)
  confidence: number;                  // Legacy confidence (0-1)
  class: string | null;                // Detection class label
  species: string | null;              // 'whitetail_deer', 'mule_deer', etc.
  sex: string | null;                  // 'buck', 'doe', 'fawn', 'unknown'
  antler_points: number | null;        // Number of points (bucks only)
  age_class: string | null;            // Age classification
  head_bbox: object | null;            // Head region (Gemini)
  gemini_confidence: number | null;    // Gemini confidence (0-100)
  is_reference: boolean;               // Reference detection flag
  quality_status: string | null;       // Quality classification
  quality_score: number | null;        // ROI similarity score
  deleted_at: string | null;           // Soft delete timestamp
  antler_description: string | null;   // Gemini antler description
  created_at: string;                  // Creation timestamp

  // NEW FIELDS (SAM3 Pipeline)
  analysis_source: 'gemini' | 'sam3' | null;  // Pipeline identifier
  antler_bbox: AntlerBbox | null;             // SAM3 antler bounding box
  sam3_deer_score: number | null;             // SAM3 deer confidence
  sam3_antler_score: number | null;           // SAM3 antler confidence
}

interface AntlerBbox {
  x: number;       // Center X (0-10000)
  y: number;       // Center Y (0-10000)
  width: number;   // Width (0-10000)
  height: number;  // Height (0-10000)
}
```

### Worker Status (New - Application State)

```typescript
// Not persisted to database - runtime state only
interface WorkerStatus {
  status: 'cold' | 'warming' | 'ready' | 'error';
  model_loaded: boolean;
  last_heartbeat: string;              // ISO timestamp
  error_message: string | null;
  warm_since: string | null;           // When worker became ready
}
```

---

## Migration SQL

```sql
-- Migration: 011_sam3_detection_fields.sql

-- Add new columns for SAM3 pipeline support
ALTER TABLE detections
ADD COLUMN IF NOT EXISTS analysis_source TEXT,
ADD COLUMN IF NOT EXISTS antler_bbox JSONB,
ADD COLUMN IF NOT EXISTS sam3_deer_score DECIMAL(4,3),
ADD COLUMN IF NOT EXISTS sam3_antler_score DECIMAL(4,3);

-- Add comment for documentation
COMMENT ON COLUMN detections.analysis_source IS 'Detection pipeline: gemini or sam3';
COMMENT ON COLUMN detections.antler_bbox IS 'SAM3 antler bounding box {x,y,width,height} 0-10000 scale';
COMMENT ON COLUMN detections.sam3_deer_score IS 'SAM3 deer detection confidence 0-1';
COMMENT ON COLUMN detections.sam3_antler_score IS 'SAM3 antler detection confidence 0-1';

-- Backfill existing records to indicate Gemini source
UPDATE detections
SET analysis_source = 'gemini'
WHERE analysis_source IS NULL
  AND gemini_confidence IS NOT NULL;

-- Index for filtering by analysis source
CREATE INDEX IF NOT EXISTS idx_detections_analysis_source
ON detections (analysis_source)
WHERE analysis_source IS NOT NULL;

-- Composite index for SAM3-specific queries
CREATE INDEX IF NOT EXISTS idx_detections_sam3_source
ON detections (image_id, analysis_source)
WHERE analysis_source = 'sam3';

-- Add check constraint for valid analysis sources
ALTER TABLE detections
ADD CONSTRAINT chk_analysis_source
CHECK (analysis_source IS NULL OR analysis_source IN ('gemini', 'sam3'));
```

---

## Coordinate System

All bounding box coordinates use the same system as existing Gemini detections:

| Property | Range | Description |
|----------|-------|-------------|
| `x`, `y` | 0-10000 | Center point of bounding box |
| `width`, `height` | 0-10000 | Dimensions of bounding box |

**Conversion from SAM3 output (0-1000 scale)**:
```typescript
// SAM3 returns [ymin, xmin, ymax, xmax] on 0-1000 scale
// Convert to center + dimensions on 0-10000 scale
const x = Math.round(((xmin + xmax) / 2) * 10);
const y = Math.round(((ymin + ymax) / 2) * 10);
const width = Math.round((xmax - xmin) * 10);
const height = Math.round((ymax - ymin) * 10);
```

---

## Relationships

```
images (1) ──────< (N) detections
                       │
                       ├── analysis_source = 'gemini' (existing)
                       └── analysis_source = 'sam3' (new)

detections (1) ──────< (N) deer_embeddings
detections (1) ──────< (N) match_candidates
detections (1) ──────< (1) detection_rois
```

---

## RLS Policies

No changes required. Existing RLS policies on `detections` table apply to new columns automatically since they check ownership via the parent `images` relationship:

```sql
-- Existing policy (unchanged)
CREATE POLICY "Users can view detections for accessible images"
ON detections FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM images
    WHERE images.id = detections.image_id
    AND has_account_access(images.user_id)
  )
);
```

---

## TypeScript Types Update

Add to `types/database.ts`:

```typescript
// Update Detection type
export interface Detection {
  // ... existing fields ...

  analysis_source: 'gemini' | 'sam3' | null;
  antler_bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  sam3_deer_score: number | null;
  sam3_antler_score: number | null;
}

// New type for SAM3 detection creation
export interface CreateSam3DetectionData {
  bbox_x: number;
  bbox_y: number;
  bbox_width: number;
  bbox_height: number;
  sam3_deer_score: number;
  antler_bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  sam3_antler_score?: number | null;
}
```

---

## Query Patterns

### Get SAM3 detections for an image

```sql
SELECT * FROM detections
WHERE image_id = $1
  AND analysis_source = 'sam3'
  AND deleted_at IS NULL
ORDER BY sam3_deer_score DESC;
```

### Get detections with antler data

```sql
SELECT
  id,
  bbox_x, bbox_y, bbox_width, bbox_height,
  antler_bbox,
  sam3_deer_score,
  sam3_antler_score
FROM detections
WHERE image_id = $1
  AND analysis_source = 'sam3'
  AND antler_bbox IS NOT NULL
  AND deleted_at IS NULL;
```

### Filter by confidence threshold (UI display)

```sql
SELECT * FROM detections
WHERE image_id = $1
  AND analysis_source = 'sam3'
  AND sam3_deer_score >= 0.3  -- Display threshold from clarification
  AND deleted_at IS NULL;
```
