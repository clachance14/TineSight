# Data Model: Detection Editing Side Panel

**Branch**: `006-detection-edit-panel` | **Date**: 2025-12-10

## Entity: Detection (Modified)

The `detections` table stores AI-detected deer instances within photos. This feature adds soft-delete capability and clarifies editable fields.

### Schema Changes

```sql
-- Migration: 009_detection_soft_delete.sql
ALTER TABLE detections
ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Index for filtering soft-deleted records
CREATE INDEX idx_detections_not_deleted ON detections (image_id)
WHERE deleted_at IS NULL;

-- Comment for clarity
COMMENT ON COLUMN detections.deleted_at IS 'Soft delete timestamp. Non-null means detection is hidden from views.';
```

### Full Schema (Post-Migration)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| image_id | uuid | NO | - | FK to images.id |
| deer_id | uuid | YES | NULL | FK to deer.id (if matched) |
| bbox_x | integer | YES | NULL | Bounding box center X (0-10000 normalized) |
| bbox_y | integer | YES | NULL | Bounding box center Y (0-10000 normalized) |
| bbox_width | integer | YES | NULL | Bounding box width (0-10000 normalized) |
| bbox_height | integer | YES | NULL | Bounding box height (0-10000 normalized) |
| class | varchar | YES | NULL | Legacy classification (always 'deer' for Gemini) |
| confidence | numeric | YES | NULL | Legacy confidence (0-1) |
| gemini_confidence | integer | YES | NULL | Gemini confidence (0-100) |
| **sex** | varchar | YES | NULL | 'buck', 'doe', 'fawn', 'unknown' |
| **antler_points** | integer | YES | NULL | Number of antler points (0-30) |
| **age_class** | varchar | YES | NULL | 'young', 'mature', 'old', 'unknown' |
| **species** | varchar | YES | NULL | 'whitetail', 'mule_deer', 'elk', 'unknown' |
| **distinguishing_features** | text | YES | NULL | Free-text description |
| head_bbox | jsonb | YES | NULL | Head region for re-ID |
| quality_score | numeric | YES | NULL | Quality score (0-1) |
| quality_status | varchar | YES | NULL | 'pending', 'high_quality', 'low_quality', 'manual_review' |
| is_reference | boolean | YES | false | Whether this is a quality reference |
| created_at | timestamptz | NO | now() | Record creation timestamp |
| **deleted_at** | timestamptz | YES | NULL | **NEW**: Soft delete timestamp |

**Editable Fields** (bold): `sex`, `antler_points`, `age_class`, `species`, `distinguishing_features`

### Validation Rules

```typescript
// Zod schema for detection update
const detectionUpdateSchema = z.object({
  sex: z.enum(['buck', 'doe', 'fawn', 'unknown']).nullable().optional(),
  antler_points: z.number().int().min(0).max(30).nullable().optional(),
  age_class: z.enum(['young', 'mature', 'old', 'unknown']).nullable().optional(),
  species: z.enum(['whitetail', 'mule_deer', 'elk', 'unknown']).nullable().optional(),
  distinguishing_features: z.string().max(500).nullable().optional(),
})

// Validation for delete confirmation (optional notes)
const deleteRequestSchema = z.object({
  confirmDelete: z.literal(true),
})
```

### State Transitions

```
Detection Lifecycle:
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   [Created]  ────→  [Edited]  ────→  [Soft Deleted]          │
│       │                │                    │                │
│       │                │                    │                │
│       ↓                ↓                    ↓                │
│   visible=true     visible=true        deleted_at!=NULL      │
│                                        (hidden from views)   │
│                                                              │
└──────────────────────────────────────────────────────────────┘

- Created: AI generates detection during photo analysis
- Edited: User modifies classification fields via edit panel
- Soft Deleted: User marks as false positive, deleted_at set
```

## Entity: Images (Query Filter)

No schema changes. Update queries to filter out soft-deleted detections.

```typescript
// Before: Returns all detections
.from('detections')
.select('*')
.eq('image_id', imageId)

// After: Excludes soft-deleted
.from('detections')
.select('*')
.eq('image_id', imageId)
.is('deleted_at', null)  // Filter soft-deleted
```

## TypeScript Types

### Update Types (lib/services/detections.ts)

```typescript
/**
 * Fields that can be updated via the edit panel
 */
export interface DetectionEditableFields {
  sex?: 'buck' | 'doe' | 'fawn' | 'unknown' | null
  antler_points?: number | null
  age_class?: 'young' | 'mature' | 'old' | 'unknown' | null
  species?: 'whitetail' | 'mule_deer' | 'elk' | 'unknown' | null
  distinguishing_features?: string | null
}

/**
 * Result of soft-deleting a detection
 */
export interface SoftDeleteResult {
  success: boolean
  deletedAt: string
}
```

### API Response Types (app/api/detections/[id]/route.ts)

```typescript
/**
 * GET /api/detections/[id] response
 */
interface DetectionResponse {
  id: string
  imageId: string
  imageUrl: string  // Signed URL for the image
  cropUrl: string | null  // Cropped detection thumbnail URL
  bboxX: number | null
  bboxY: number | null
  bboxWidth: number | null
  bboxHeight: number | null
  sex: string | null
  antlerPoints: number | null
  ageClass: string | null
  species: string | null
  distinguishingFeatures: string | null
  confidence: number | null
  geminiConfidence: number | null
  deerId: string | null
  createdAt: string
}

/**
 * PATCH /api/detections/[id] request body
 */
interface UpdateDetectionRequest {
  sex?: string | null
  antlerPoints?: number | null
  ageClass?: string | null
  species?: string | null
  distinguishingFeatures?: string | null
}

/**
 * DELETE /api/detections/[id] response
 */
interface DeleteDetectionResponse {
  success: true
  deletedAt: string
}
```

## RLS Policy Updates

Add filter to existing RLS policies to exclude soft-deleted records:

```sql
-- Update existing SELECT policy to filter soft-deleted
DROP POLICY IF EXISTS "Users can view their own detections" ON detections;

CREATE POLICY "Users can view their own detections"
  ON detections FOR SELECT
  USING (
    deleted_at IS NULL  -- NEW: filter soft-deleted
    AND EXISTS (
      SELECT 1 FROM images
      WHERE images.id = detections.image_id
      AND images.user_id = auth.uid()
    )
  );

-- Soft-deleted records can still be viewed by owner for admin purposes
-- (future restore feature)
CREATE POLICY "Users can view their own soft-deleted detections"
  ON detections FOR SELECT
  USING (
    deleted_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM images
      WHERE images.id = detections.image_id
      AND images.user_id = auth.uid()
    )
  );
```

## Indexes

```sql
-- Existing indexes remain
-- Add index for soft-delete filter optimization

CREATE INDEX idx_detections_not_deleted ON detections (image_id)
WHERE deleted_at IS NULL;

-- This partial index speeds up the common query:
-- SELECT * FROM detections WHERE image_id = ? AND deleted_at IS NULL
```

## Relationships

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   images    │────<│  detections │>────│    deer     │
│             │ 1:N │             │ N:1 │             │
│ user_id     │     │ image_id    │     │ id          │
│ file_path   │     │ deer_id     │     │ name        │
│             │     │ deleted_at  │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           │ 1:1
                           ▼
                    ┌─────────────┐
                    │detection_rois│
                    │             │
                    │ detection_id│
                    │ roi_x, roi_y│
                    └─────────────┘
```

Note: When a detection is soft-deleted, its relationships remain intact:
- `detection_rois` record still exists but won't be visible
- `deer` profile may still reference this detection (considered historical)
- `deer_embeddings` linked to this detection remain for potential restore
