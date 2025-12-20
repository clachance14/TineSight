# Data Model: Gemini Deer Analysis Pipeline

**Feature**: 005-gemini-deer-pipeline
**Date**: 2025-12-09

## Entity Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ENTITY RELATIONSHIPS                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Account (1) ─────────< Image (*)                                   │
│      │                     │                                         │
│      │                     └───────< Detection (*)                  │
│      │                                   │                           │
│      │                                   ├──< MatchCandidate (*)    │
│      │                                   │                           │
│      └─────────< Deer (*)  <────────────┘                           │
│                    │         (deer_id)                               │
│                    │                                                 │
│                    └── reference_detection_id ──> Detection         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Entities

### Image

Represents a trail camera photo uploaded by the user.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| account_id | UUID | FK → accounts, NOT NULL | Owner account |
| storage_path | TEXT | NOT NULL | Supabase Storage path |
| thumbnail_path | TEXT | | Thumbnail storage path |
| filename | TEXT | NOT NULL | Original filename |
| batch_id | UUID | FK → processing_batches | Upload batch reference |
| **has_deer** | BOOLEAN | | Whether deer detected in image |
| **deer_count** | INTEGER | DEFAULT 0 | Number of deer detected |
| **analysis_notes** | TEXT | | AI analysis notes/quality issues |
| **analyzed_at** | TIMESTAMPTZ | | When Gemini analysis completed |
| detection_status | ENUM | DEFAULT 'pending' | 'pending', 'processing', 'completed', 'failed' |
| error_message | TEXT | | Error details if failed |
| created_at | TIMESTAMPTZ | DEFAULT now() | Upload timestamp |

**New fields in bold**

**Validation Rules**:
- `deer_count` must be >= 0
- `analyzed_at` set when `detection_status` becomes 'completed'
- `has_deer` = true if `deer_count` > 0

---

### Detection

Represents a single deer detected within an image.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| image_id | UUID | FK → images, NOT NULL | Parent image |
| deer_id | UUID | FK → deer, NULLABLE | Assigned deer profile (after match confirmation) |
| bbox_x | INTEGER | NOT NULL | Bounding box X (0-10000 normalized) |
| bbox_y | INTEGER | NOT NULL | Bounding box Y (0-10000 normalized) |
| bbox_width | INTEGER | NOT NULL | Bounding box width (0-10000 normalized) |
| bbox_height | INTEGER | NOT NULL | Bounding box height (0-10000 normalized) |
| **head_bbox** | JSONB | | Head-specific bbox {x, y, width, height} for cropping |
| class | TEXT | | Detection class (legacy: 'animal') |
| confidence | DECIMAL(5,4) | | Detection confidence 0-1 (legacy) |
| **species** | TEXT | | 'whitetail', 'mule_deer', 'elk', 'unknown' |
| **sex** | TEXT | | 'buck', 'doe', 'fawn', 'unknown' |
| **antler_points** | INTEGER | | Number of antler points (null for does/fawns) |
| **age_class** | TEXT | | 'young', 'mature', 'old', 'unknown' |
| **distinguishing_features** | TEXT | | AI-generated description of unique features |
| **gemini_confidence** | INTEGER | | Gemini confidence score 0-100 |
| **is_reference** | BOOLEAN | DEFAULT FALSE | True if this is the reference detection for a deer profile |
| created_at | TIMESTAMPTZ | DEFAULT now() | Detection timestamp |

**New fields in bold**

**Validation Rules**:
- `bbox_*` values must be 0-10000
- `antler_points` only valid when `sex` = 'buck'
- `gemini_confidence` must be 0-100
- Only one detection per deer can have `is_reference` = true

**State Transitions**:
```
[Created] → deer_id=null (unassigned)
         ↓
[Matched] → deer_id set (assigned to catalog deer)
         ↓
[Reference] → is_reference=true (if set as deer's reference photo)
```

---

### Deer

Represents a named deer profile in the user's catalog.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| account_id | UUID | FK → accounts, NOT NULL | Owner account |
| name | TEXT | NOT NULL | User-assigned name (e.g., "Big 12") |
| notes | TEXT | | User notes about the deer |
| **reference_detection_id** | UUID | FK → detections | Detection used as profile thumbnail |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT now() | Last update timestamp |

**New fields in bold**

**Validation Rules**:
- `name` must be unique per account
- `reference_detection_id` must belong to a detection with `is_reference` = true

---

### MatchCandidate

Represents an AI-suggested match between a detection and a catalog deer, pending user review.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| detection_id | UUID | FK → detections, NOT NULL | Detection being matched |
| candidate_deer_id | UUID | FK → deer, NOT NULL | Suggested deer match |
| similarity_score | DECIMAL(5,4) | | Similarity score 0-1 (legacy) |
| **gemini_confidence** | INTEGER | | Gemini confidence 0-100 |
| **gemini_reasoning** | TEXT | | AI explanation for the match |
| status | ENUM | DEFAULT 'pending' | 'pending', 'confirmed', 'rejected' |
| reviewed_at | TIMESTAMPTZ | | When user reviewed this candidate |
| created_at | TIMESTAMPTZ | DEFAULT now() | Creation timestamp |

**New fields in bold**

**Validation Rules**:
- `gemini_confidence` must be 0-100
- `reviewed_at` set when `status` changes from 'pending'
- One detection can have multiple candidates (ranked by confidence)

**State Transitions**:
```
[Created] → status='pending'
         ↓
[Confirmed] → status='confirmed', detection.deer_id set
         ↓ (or)
[Rejected] → status='rejected'
```

---

## Removed/Deprecated Entities

### DeerEmbedding (REMOVED)

Previously stored 1536-dimensional vector embeddings for similarity search. No longer needed with Gemini's direct visual comparison.

**Migration**: TRUNCATE table, remove from active queries.

### DetectionROI (DEPRECATED)

User-defined region of interest for embedding regeneration. May be repurposed for manual head bbox override.

**Migration**: TRUNCATE table, evaluate future use.

---

## Database Migration SQL

```sql
-- Migration: 008_gemini_analysis.sql
-- Feature: 005-gemini-deer-pipeline

-- Step 1: Clear legacy data (Fresh Start)
TRUNCATE TABLE match_candidates CASCADE;
TRUNCATE TABLE deer_embeddings CASCADE;
TRUNCATE TABLE detection_rois CASCADE;
TRUNCATE TABLE detections CASCADE;

-- Step 2: Add new columns to images
ALTER TABLE images ADD COLUMN IF NOT EXISTS has_deer BOOLEAN;
ALTER TABLE images ADD COLUMN IF NOT EXISTS deer_count INTEGER DEFAULT 0;
ALTER TABLE images ADD COLUMN IF NOT EXISTS analysis_notes TEXT;
ALTER TABLE images ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;

-- Step 3: Add new columns to detections
ALTER TABLE detections ADD COLUMN IF NOT EXISTS species TEXT;
ALTER TABLE detections ADD COLUMN IF NOT EXISTS sex TEXT;
ALTER TABLE detections ADD COLUMN IF NOT EXISTS antler_points INTEGER;
ALTER TABLE detections ADD COLUMN IF NOT EXISTS age_class TEXT;
ALTER TABLE detections ADD COLUMN IF NOT EXISTS distinguishing_features TEXT;
ALTER TABLE detections ADD COLUMN IF NOT EXISTS gemini_confidence INTEGER;
ALTER TABLE detections ADD COLUMN IF NOT EXISTS head_bbox JSONB;
ALTER TABLE detections ADD COLUMN IF NOT EXISTS is_reference BOOLEAN DEFAULT FALSE;

-- Step 4: Add reference detection to deer
ALTER TABLE deer ADD COLUMN IF NOT EXISTS reference_detection_id UUID REFERENCES detections(id);

-- Step 5: Add Gemini fields to match_candidates
ALTER TABLE match_candidates ADD COLUMN IF NOT EXISTS gemini_reasoning TEXT;
ALTER TABLE match_candidates ADD COLUMN IF NOT EXISTS gemini_confidence INTEGER;

-- Step 6: Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_detections_sex ON detections(sex);
CREATE INDEX IF NOT EXISTS idx_detections_antler_points ON detections(antler_points);
CREATE INDEX IF NOT EXISTS idx_detections_is_reference ON detections(is_reference) WHERE is_reference = true;
CREATE INDEX IF NOT EXISTS idx_images_has_deer ON images(has_deer);
CREATE INDEX IF NOT EXISTS idx_match_candidates_status ON match_candidates(status);

-- Step 6b: Add validation constraints
ALTER TABLE detections ADD CONSTRAINT chk_antler_points_for_bucks
  CHECK (sex != 'buck' OR antler_points IS NOT NULL);
ALTER TABLE detections ADD CONSTRAINT chk_gemini_confidence_range
  CHECK (gemini_confidence IS NULL OR (gemini_confidence >= 0 AND gemini_confidence <= 100));

-- Step 7: Add constraint for reference detection uniqueness per deer
CREATE UNIQUE INDEX IF NOT EXISTS idx_deer_reference_detection
ON deer(reference_detection_id)
WHERE reference_detection_id IS NOT NULL;
```

---

## TypeScript Types

```typescript
// types/gemini.ts

export interface PhotoAnalysis {
  deer_present: boolean;
  detections: DeerDetection[];
  image_quality_score: number;
  analysis_notes: string;
}

export interface DeerDetection {
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
  species: 'whitetail' | 'mule_deer' | 'elk' | 'unknown';
  sex: 'buck' | 'doe' | 'fawn' | 'unknown';
  antler_points: number | null;
  age_class: 'young' | 'mature' | 'old' | 'unknown';
  distinguishing_features: string | null;
  confidence: number; // 0-100
}

export interface MatchComparison {
  best_match: {
    deer_id: string;
    deer_name: string;
    confidence: number;
    reasoning: string;
  } | null;
  other_possibilities: {
    deer_id: string;
    deer_name: string;
    confidence: number;
  }[];
  is_likely_new_deer: boolean;
}

// Updated database types (extend existing)
export interface Detection {
  id: string;
  image_id: string;
  deer_id: string | null;
  bbox_x: number;
  bbox_y: number;
  bbox_width: number;
  bbox_height: number;
  head_bbox: { x: number; y: number; width: number; height: number } | null;
  class: string | null;
  confidence: number | null;
  species: string | null;
  sex: string | null;
  antler_points: number | null;
  age_class: string | null;
  distinguishing_features: string | null;
  gemini_confidence: number | null;
  is_reference: boolean;
  created_at: string;
}

export interface MatchCandidate {
  id: string;
  detection_id: string;
  candidate_deer_id: string;
  similarity_score: number | null;
  gemini_confidence: number | null;
  gemini_reasoning: string | null;
  status: 'pending' | 'confirmed' | 'rejected';
  reviewed_at: string | null;
  created_at: string;
}
```

---

## RLS Policy Updates

All new columns inherit existing RLS policies on their parent tables. No new policies required.

Existing policies ensure:
- Users can only access images/detections/deer belonging to their account
- Team members with Viewer role can read but not modify
- Service role required for background job operations
