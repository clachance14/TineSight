# Data Model: Photo Pipeline

**Feature**: 002-photo-pipeline
**Date**: 2025-12-02
**Base Schema**: `001_initial_schema.sql`

## Overview

This document describes database schema additions for the photo pipeline feature. The base schema from `001-saas-foundation` already includes `images`, `detections`, `deer`, and `deer_embeddings` tables.

## Schema Changes

### 1. Alter `deer_embeddings` - Make `deer_id` Nullable

**Reason**: Support "orphaned" embeddings that exist before user confirms a match.

```sql
ALTER TABLE deer_embeddings
ALTER COLUMN deer_id DROP NOT NULL;

-- Update RLS policies to handle orphaned embeddings
-- Orphaned embeddings are accessible via detection→image→user chain
DROP POLICY IF EXISTS "Users can view embeddings for accessible deer" ON deer_embeddings;
DROP POLICY IF EXISTS "Users can insert embeddings for own deer" ON deer_embeddings;
DROP POLICY IF EXISTS "Users can update embeddings for own deer" ON deer_embeddings;
DROP POLICY IF EXISTS "Users can delete embeddings for own deer" ON deer_embeddings;

-- New policies that handle both orphaned (deer_id IS NULL) and assigned embeddings
CREATE POLICY "Users can view accessible embeddings"
ON deer_embeddings FOR SELECT
USING (
  -- Assigned embeddings: via deer relationship
  (deer_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM deer WHERE deer.id = deer_embeddings.deer_id
    AND has_account_access(deer.user_id)
  ))
  OR
  -- Orphaned embeddings: via detection→image relationship
  (deer_id IS NULL AND EXISTS (
    SELECT 1 FROM detections d
    JOIN images i ON d.image_id = i.id
    WHERE d.id = deer_embeddings.detection_id
    AND has_account_access(i.user_id)
  ))
);

CREATE POLICY "Users can insert own embeddings"
ON deer_embeddings FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM detections d
    JOIN images i ON d.image_id = i.id
    WHERE d.id = deer_embeddings.detection_id
    AND auth.uid() = i.user_id
  )
);

CREATE POLICY "Users can update own embeddings"
ON deer_embeddings FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM detections d
    JOIN images i ON d.image_id = i.id
    WHERE d.id = deer_embeddings.detection_id
    AND auth.uid() = i.user_id
  )
);

CREATE POLICY "Users can delete own embeddings"
ON deer_embeddings FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM detections d
    JOIN images i ON d.image_id = i.id
    WHERE d.id = deer_embeddings.detection_id
    AND auth.uid() = i.user_id
  )
);
```

---

### 2. New Table: `processing_batches`

**Purpose**: Track batch upload progress and status.

```sql
CREATE TABLE processing_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'uploading', 'processing', 'completed', 'partial_error', 'failed')),
  total_images INT NOT NULL DEFAULT 0,
  uploaded_images INT NOT NULL DEFAULT 0,
  processed_images INT NOT NULL DEFAULT 0,
  successful_images INT NOT NULL DEFAULT 0,
  failed_images INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Index for user queries
CREATE INDEX idx_processing_batches_user_id ON processing_batches(user_id);
CREATE INDEX idx_processing_batches_status ON processing_batches(status);

-- Enable RLS
ALTER TABLE processing_batches ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own batches"
ON processing_batches FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own batches"
ON processing_batches FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own batches"
ON processing_batches FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own batches"
ON processing_batches FOR DELETE
USING (auth.uid() = user_id);
```

**Entity: Processing Batch**

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Owner (FK to profiles) |
| status | TEXT | Upload/processing status |
| total_images | INT | Total images in batch |
| uploaded_images | INT | Successfully uploaded count |
| processed_images | INT | AI processing completed count |
| successful_images | INT | Successfully processed count |
| failed_images | INT | Failed processing count |
| error_message | TEXT | Batch-level error if failed |
| created_at | TIMESTAMPTZ | When batch was created |
| completed_at | TIMESTAMPTZ | When processing finished |

---

### 3. Add `batch_id` to `images`

**Purpose**: Link images to their upload batch for progress tracking.

```sql
ALTER TABLE images
ADD COLUMN batch_id UUID REFERENCES processing_batches(id) ON DELETE SET NULL;

CREATE INDEX idx_images_batch_id ON images(batch_id);
```

---

### 4. New Table: `match_candidates`

**Purpose**: Store potential matches for human review (human-in-the-loop).

```sql
CREATE TABLE match_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_id UUID NOT NULL REFERENCES detections(id) ON DELETE CASCADE,
  candidate_deer_id UUID NOT NULL REFERENCES deer(id) ON DELETE CASCADE,
  similarity_score DECIMAL(5,4) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected')),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(detection_id, candidate_deer_id)
);

-- Indexes
CREATE INDEX idx_match_candidates_detection_id ON match_candidates(detection_id);
CREATE INDEX idx_match_candidates_candidate_deer_id ON match_candidates(candidate_deer_id);
CREATE INDEX idx_match_candidates_status ON match_candidates(status);

-- Enable RLS
ALTER TABLE match_candidates ENABLE ROW LEVEL SECURITY;

-- Policies: access via detection→image→user chain
CREATE POLICY "Users can view accessible match candidates"
ON match_candidates FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM detections d
    JOIN images i ON d.image_id = i.id
    WHERE d.id = match_candidates.detection_id
    AND has_account_access(i.user_id)
  )
);

CREATE POLICY "Users can insert match candidates for own images"
ON match_candidates FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM detections d
    JOIN images i ON d.image_id = i.id
    WHERE d.id = match_candidates.detection_id
    AND auth.uid() = i.user_id
  )
);

CREATE POLICY "Users can update match candidates for own images"
ON match_candidates FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM detections d
    JOIN images i ON d.image_id = i.id
    WHERE d.id = match_candidates.detection_id
    AND auth.uid() = i.user_id
  )
);

CREATE POLICY "Users can delete match candidates for own images"
ON match_candidates FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM detections d
    JOIN images i ON d.image_id = i.id
    WHERE d.id = match_candidates.detection_id
    AND auth.uid() = i.user_id
  )
);
```

**Entity: Match Candidate**

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| detection_id | UUID | Detection being matched (FK) |
| candidate_deer_id | UUID | Potential deer match (FK) |
| similarity_score | DECIMAL(5,4) | Cosine similarity (0.0000-1.0000) |
| status | TEXT | pending/confirmed/rejected |
| reviewed_at | TIMESTAMPTZ | When user reviewed |
| created_at | TIMESTAMPTZ | When candidate was found |

---

### 5. Similarity Search Function

**Purpose**: Find similar deer embeddings for matching.

```sql
CREATE OR REPLACE FUNCTION find_similar_deer(
  query_embedding VECTOR(512),
  query_user_id UUID,
  match_count INT DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  deer_id UUID,
  deer_name TEXT,
  similarity FLOAT,
  detection_id UUID,
  image_id UUID,
  image_path TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id AS deer_id,
    d.name AS deer_name,
    (1 - (de.embedding <=> query_embedding))::FLOAT AS similarity,
    de.detection_id,
    det.image_id,
    i.file_path AS image_path
  FROM deer_embeddings de
  JOIN deer d ON de.deer_id = d.id
  JOIN detections det ON de.detection_id = det.id
  JOIN images i ON det.image_id = i.id
  WHERE d.user_id = query_user_id
    AND de.deer_id IS NOT NULL  -- Only match against confirmed deer profiles
    AND (1 - (de.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY de.embedding <=> query_embedding ASC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION find_similar_deer IS 'Find deer profiles with similar embeddings for re-identification matching';
```

---

## Entity Relationship Diagram

```
┌─────────────────┐
│    profiles     │
│  (from 001)     │
└────────┬────────┘
         │
         │ 1:N
         ▼
┌─────────────────┐     1:N      ┌─────────────────┐
│processing_batch │◄────────────│     images      │
│  (NEW)          │              │   (from 001)    │
└─────────────────┘              │ + batch_id (NEW)│
                                 └────────┬────────┘
                                          │
                                          │ 1:N
                                          ▼
                                 ┌─────────────────┐
                                 │   detections    │
                                 │   (from 001)    │
                                 └───┬─────────┬───┘
                                     │         │
                              1:N    │         │ 1:N
                                     ▼         ▼
                          ┌──────────────┐  ┌─────────────────┐
                          │deer_embeddings│  │ match_candidates│
                          │ (modified)   │  │     (NEW)       │
                          │ deer_id NULL │  └────────┬────────┘
                          └──────┬───────┘           │
                                 │                   │ N:1
                                 │ N:1 (optional)    ▼
                                 ▼            ┌─────────────────┐
                          ┌─────────────────┐ │      deer       │
                          │      deer       │◄┤   (from 001)    │
                          │   (from 001)    │ └─────────────────┘
                          └─────────────────┘
```

---

## Migration File

All changes above should be combined into:
`supabase/migrations/002_photo_pipeline.sql`

```sql
-- ============================================================================
-- TineSight Photo Pipeline Schema Migration
-- ============================================================================
-- This migration adds tables and functions for the photo processing pipeline:
-- - processing_batches: Track batch upload progress
-- - match_candidates: Human-in-the-loop match confirmation
-- - Modifies deer_embeddings: Allow orphaned embeddings (deer_id nullable)
-- - Adds find_similar_deer function for similarity search
-- ============================================================================

-- [All SQL from sections above combined here]
```

---

## Supabase Storage Configuration

### Bucket: `photos`

```sql
-- Create photos bucket (run via Supabase dashboard or API)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('photos', 'photos', false, 52428800);  -- 50MB limit

-- RLS Policies
CREATE POLICY "Users upload to own folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users view own photos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users delete own photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

### Storage Path Convention

```
photos/
└── {user_id}/
    └── {batch_id}/
        ├── original/
        │   ├── IMG_0001.jpg
        │   └── IMG_0002.jpg
        └── thumbs/
            ├── IMG_0001.jpg
            └── IMG_0002.jpg
```
