# Data Model: ROI Selection & Quality Filtering

**Feature**: 003-roi-quality-filter
**Date**: 2025-12-02

> **Note**: This feature uses MegaDescriptor L/14 (via Replicate API) which produces 1536-dimensional embeddings (updated from the original 512-dim placeholder model).

## Entity Relationship Diagram

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   images    │────<│  detections  │────<│ deer_embeddings │
└─────────────┘     └──────────────┘     └─────────────────┘
                           │
                           │ 1:1
                           ▼
                    ┌──────────────┐
                    │detection_rois│
                    └──────────────┘
                           │
                           │ 1:N
                           ▼
                    ┌──────────────┐
                    │ roi_feedback │
                    └──────────────┘
```

## New Tables

### detection_rois

User-defined region of interest for a detection. Stores the head + antlers area the user selects.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Primary key |
| detection_id | UUID | FK → detections(id), UNIQUE, NOT NULL, ON DELETE CASCADE | Link to parent detection |
| roi_x | INTEGER | NOT NULL | X coordinate of ROI top-left (0-10000 normalized) |
| roi_y | INTEGER | NOT NULL | Y coordinate of ROI top-left (0-10000 normalized) |
| roi_width | INTEGER | NOT NULL | Width of ROI (0-10000 normalized) |
| roi_height | INTEGER | NOT NULL | Height of ROI (0-10000 normalized) |
| is_reference | BOOLEAN | NOT NULL, DEFAULT FALSE | Whether this ROI is a "gold standard" reference |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | When ROI was created |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | When ROI was last updated |
| created_by | UUID | FK → profiles(id) | User who created the ROI |

**Indexes**:
- `detection_rois_detection_id_key` (UNIQUE on detection_id)
- `detection_rois_is_reference_idx` (WHERE is_reference = TRUE)

**RLS Policies**:
```sql
-- Users can view ROIs for detections on their images
CREATE POLICY "Users can view ROIs for accessible detections"
ON detection_rois FOR SELECT
USING (EXISTS (
  SELECT 1 FROM detections d
  JOIN images i ON d.image_id = i.id
  WHERE d.id = detection_rois.detection_id
  AND i.user_id = auth.uid()
));

-- Users can create/update/delete ROIs for their detections
CREATE POLICY "Users can manage ROIs for their detections"
ON detection_rois FOR ALL
USING (EXISTS (
  SELECT 1 FROM detections d
  JOIN images i ON d.image_id = i.id
  WHERE d.id = detection_rois.detection_id
  AND i.user_id = auth.uid()
));
```

---

### roi_feedback

Quality feedback when user rejects a match. Captures why a photo/detection was rejected.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Primary key |
| detection_id | UUID | FK → detections(id), NOT NULL, ON DELETE CASCADE | Detection feedback is about |
| feedback_type | TEXT | NOT NULL, CHECK constraint | Categorized rejection reason |
| notes | TEXT | NULLABLE | Optional freeform notes |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | When feedback was submitted |
| created_by | UUID | FK → profiles(id) | User who submitted feedback |

**feedback_type CHECK values**:
- `distant` - Deer too far away
- `partial_view` - Only part of deer visible
- `no_antlers` - Cannot see antlers clearly
- `obstructed` - View blocked by vegetation/objects
- `wrong_angle` - Poor angle for identification
- `blurry` - Image quality too poor
- `other` - Specify in notes

**Indexes**:
- `roi_feedback_detection_id_idx` (for lookup by detection)
- `roi_feedback_feedback_type_idx` (for aggregation queries)

**RLS Policies**:
```sql
-- Users can view feedback for their detections
CREATE POLICY "Users can view feedback for accessible detections"
ON roi_feedback FOR SELECT
USING (EXISTS (
  SELECT 1 FROM detections d
  JOIN images i ON d.image_id = i.id
  WHERE d.id = roi_feedback.detection_id
  AND i.user_id = auth.uid()
));

-- Users can create feedback for their detections
CREATE POLICY "Users can create feedback"
ON roi_feedback FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM detections d
  JOIN images i ON d.image_id = i.id
  WHERE d.id = roi_feedback.detection_id
  AND i.user_id = auth.uid()
));
```

---

## Modified Tables

### detections

Add quality status and score fields.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| quality_status | TEXT | DEFAULT 'pending', CHECK constraint | Quality classification |
| quality_score | DECIMAL(4,3) | NULLABLE | Similarity score to reference ROIs (0.000-1.000) |

**quality_status CHECK values**:
- `pending` - Not yet scored (default, no references exist)
- `high_quality` - Score >= 0.7, auto-process
- `manual_review` - Score 0.4-0.7, needs review
- `low_quality` - Score < 0.4, skip processing

**Migration**:
```sql
ALTER TABLE detections
ADD COLUMN quality_status TEXT DEFAULT 'pending'
  CHECK (quality_status IN ('pending', 'high_quality', 'low_quality', 'manual_review'));

ALTER TABLE detections
ADD COLUMN quality_score DECIMAL(4,3);

CREATE INDEX detections_quality_status_idx ON detections(quality_status);
```

---

## New Database Functions

### compute_quality_score

Computes similarity between a detection's embedding and reference ROI embeddings.

```sql
CREATE OR REPLACE FUNCTION compute_quality_score(
  target_detection_id UUID,
  query_user_id UUID
) RETURNS DECIMAL(4,3) AS $$
DECLARE
  target_embedding vector(1536);  -- MegaDescriptor L/14 (Replicate)
  max_similarity DECIMAL(4,3) := 0;
  ref_count INTEGER;
BEGIN
  -- Check if user has minimum 3 references
  SELECT COUNT(*) INTO ref_count
  FROM detection_rois dr
  JOIN detections d ON d.id = dr.detection_id
  JOIN images i ON i.id = d.image_id
  WHERE dr.is_reference = TRUE
    AND i.user_id = query_user_id;

  IF ref_count < 3 THEN
    RETURN NULL;  -- Not enough references for scoring
  END IF;

  -- Get target detection's embedding
  SELECT embedding INTO target_embedding
  FROM deer_embeddings
  WHERE detection_id = target_detection_id;

  IF target_embedding IS NULL THEN
    RETURN NULL;  -- No embedding yet
  END IF;

  -- Find max similarity to any reference ROI embedding
  SELECT COALESCE(MAX(1 - (de.embedding <=> target_embedding)), 0)
  INTO max_similarity
  FROM deer_embeddings de
  JOIN detection_rois dr ON dr.detection_id = de.detection_id
  JOIN detections d ON d.id = dr.detection_id
  JOIN images i ON i.id = d.image_id
  WHERE dr.is_reference = TRUE
    AND i.user_id = query_user_id;

  RETURN max_similarity;
END;
$$ LANGUAGE plpgsql STABLE;
```

### count_reference_rois

Counts the number of reference ROIs for a user.

```sql
CREATE OR REPLACE FUNCTION count_reference_rois(
  query_user_id UUID
) RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM detection_rois dr
    JOIN detections d ON d.id = dr.detection_id
    JOIN images i ON i.id = d.image_id
    WHERE dr.is_reference = TRUE
      AND i.user_id = query_user_id
  );
END;
$$ LANGUAGE plpgsql STABLE;
```

---

## TypeScript Types

### New Types (types/database.ts)

```typescript
// Detection ROI
export type DetectionROI = {
  id: string
  detection_id: string
  roi_x: number
  roi_y: number
  roi_width: number
  roi_height: number
  is_reference: boolean
  created_at: string
  updated_at: string
  created_by: string | null
}

export type DetectionROIInsert = Omit<DetectionROI, 'id' | 'created_at' | 'updated_at'>
export type DetectionROIUpdate = Partial<Omit<DetectionROIInsert, 'detection_id'>>

// ROI Feedback
export type ROIFeedback = {
  id: string
  detection_id: string
  feedback_type: FeedbackType
  notes: string | null
  created_at: string
  created_by: string | null
}

export type FeedbackType =
  | 'distant'
  | 'partial_view'
  | 'no_antlers'
  | 'obstructed'
  | 'wrong_angle'
  | 'blurry'
  | 'other'

export type ROIFeedbackInsert = Omit<ROIFeedback, 'id' | 'created_at'>

// Quality Status
export type QualityStatus = 'pending' | 'high_quality' | 'low_quality' | 'manual_review'
```

---

## Data Validation Rules

### ROI Coordinates

- All coordinates must be in range 0-10000 (normalized)
- `roi_x + roi_width <= 10000`
- `roi_y + roi_height <= 10000`
- Minimum size: warn if width < 100 or height < 100 (1% of image)

### Quality Thresholds

| Threshold | Score | Status |
|-----------|-------|--------|
| High | >= 0.7 | high_quality |
| Medium | 0.4 - 0.7 | manual_review |
| Low | < 0.4 | low_quality |

### Reference Requirements

- Minimum 3 reference ROIs required before auto-filtering activates
- If < 3 references, all detections get `quality_status = 'pending'`

---

## Migration File

**File**: `supabase/migrations/005_roi_selection.sql`

```sql
-- ROI Selection & Quality Filtering Migration
-- Feature: 003-roi-quality-filter

-- 1. Create detection_rois table
CREATE TABLE detection_rois (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_id UUID NOT NULL REFERENCES detections(id) ON DELETE CASCADE,
  roi_x INTEGER NOT NULL,
  roi_y INTEGER NOT NULL,
  roi_width INTEGER NOT NULL,
  roi_height INTEGER NOT NULL,
  is_reference BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  UNIQUE(detection_id)
);

-- 2. Create roi_feedback table
CREATE TABLE roi_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_id UUID NOT NULL REFERENCES detections(id) ON DELETE CASCADE,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN (
    'distant', 'partial_view', 'no_antlers', 'obstructed',
    'wrong_angle', 'blurry', 'other'
  )),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

-- 3. Add quality fields to detections
ALTER TABLE detections
ADD COLUMN quality_status TEXT DEFAULT 'pending'
  CHECK (quality_status IN ('pending', 'high_quality', 'low_quality', 'manual_review'));

ALTER TABLE detections
ADD COLUMN quality_score DECIMAL(4,3);

-- 4. Create indexes
CREATE INDEX detection_rois_is_reference_idx ON detection_rois(is_reference) WHERE is_reference = TRUE;
CREATE INDEX roi_feedback_detection_id_idx ON roi_feedback(detection_id);
CREATE INDEX roi_feedback_feedback_type_idx ON roi_feedback(feedback_type);
CREATE INDEX detections_quality_status_idx ON detections(quality_status);

-- 5. Enable RLS
ALTER TABLE detection_rois ENABLE ROW LEVEL SECURITY;
ALTER TABLE roi_feedback ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for detection_rois
CREATE POLICY "Users can view ROIs for accessible detections"
ON detection_rois FOR SELECT
USING (EXISTS (
  SELECT 1 FROM detections d
  JOIN images i ON d.image_id = i.id
  WHERE d.id = detection_rois.detection_id
  AND i.user_id = auth.uid()
));

CREATE POLICY "Users can insert ROIs for their detections"
ON detection_rois FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM detections d
  JOIN images i ON d.image_id = i.id
  WHERE d.id = detection_rois.detection_id
  AND i.user_id = auth.uid()
));

CREATE POLICY "Users can update ROIs for their detections"
ON detection_rois FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM detections d
  JOIN images i ON d.image_id = i.id
  WHERE d.id = detection_rois.detection_id
  AND i.user_id = auth.uid()
));

CREATE POLICY "Users can delete ROIs for their detections"
ON detection_rois FOR DELETE
USING (EXISTS (
  SELECT 1 FROM detections d
  JOIN images i ON d.image_id = i.id
  WHERE d.id = detection_rois.detection_id
  AND i.user_id = auth.uid()
));

-- 7. RLS Policies for roi_feedback
CREATE POLICY "Users can view feedback for accessible detections"
ON roi_feedback FOR SELECT
USING (EXISTS (
  SELECT 1 FROM detections d
  JOIN images i ON d.image_id = i.id
  WHERE d.id = roi_feedback.detection_id
  AND i.user_id = auth.uid()
));

CREATE POLICY "Users can create feedback"
ON roi_feedback FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM detections d
  JOIN images i ON d.image_id = i.id
  WHERE d.id = roi_feedback.detection_id
  AND i.user_id = auth.uid()
));

-- 8. Database functions
CREATE OR REPLACE FUNCTION compute_quality_score(
  target_detection_id UUID,
  query_user_id UUID
) RETURNS DECIMAL(4,3) AS $$
DECLARE
  target_embedding vector(1536);  -- MegaDescriptor L/14 (Replicate)
  max_similarity DECIMAL(4,3) := 0;
  ref_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO ref_count
  FROM detection_rois dr
  JOIN detections d ON d.id = dr.detection_id
  JOIN images i ON i.id = d.image_id
  WHERE dr.is_reference = TRUE
    AND i.user_id = query_user_id;

  IF ref_count < 3 THEN
    RETURN NULL;
  END IF;

  SELECT embedding INTO target_embedding
  FROM deer_embeddings
  WHERE detection_id = target_detection_id;

  IF target_embedding IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(MAX(1 - (de.embedding <=> target_embedding)), 0)
  INTO max_similarity
  FROM deer_embeddings de
  JOIN detection_rois dr ON dr.detection_id = de.detection_id
  JOIN detections d ON d.id = dr.detection_id
  JOIN images i ON i.id = d.image_id
  WHERE dr.is_reference = TRUE
    AND i.user_id = query_user_id;

  RETURN max_similarity;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION count_reference_rois(
  query_user_id UUID
) RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM detection_rois dr
    JOIN detections d ON d.id = dr.detection_id
    JOIN images i ON i.id = d.image_id
    WHERE dr.is_reference = TRUE
      AND i.user_id = query_user_id
  );
END;
$$ LANGUAGE plpgsql STABLE;
```
