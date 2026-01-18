# Data Model: 10K Photo Bulk Upload

**Feature**: 012-bulk-upload | **Date**: 2025-12-26

## Overview

This feature extends the existing TineSight data model to support bulk uploads of 10,000+ photos with progress tracking, duplicate detection, and streaming processing. The core `images` table already exists with Realtime enabled; this feature adds deduplication support and enhances upload session tracking.

## Existing Entities (No Changes)

### images (table)
*Already exists with Realtime enabled via migration 031*

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK to profiles.id |
| camera_id | UUID | FK to cameras.id (nullable) |
| file_path | TEXT | Storage path |
| file_size_bytes | BIGINT | File size for dedup |
| captured_at | TIMESTAMPTZ | From EXIF |
| imported_at | TIMESTAMPTZ | Upload timestamp |
| detection_status | TEXT | pending/processing/completed/failed |
| exif_data | JSONB | Full EXIF metadata |
| ... | ... | (other existing columns) |

**Indexes**: idx_images_user_id, idx_images_detection_status, idx_images_captured_at

**Realtime**: Enabled (migration 031) with REPLICA IDENTITY FULL

### upload_sessions (table)
*Already exists via migration 025*

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK to profiles.id |
| total_batches | INT | Number of processing batches |
| total_images | INT | Total images in session |
| status | TEXT | uploading/processing/completed/partial_error/failed |
| created_at | TIMESTAMPTZ | Session start |
| completed_at | TIMESTAMPTZ | Session end (nullable) |

### processing_batches (table)
*Already exists with upload_session_id FK*

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| upload_session_id | UUID | FK to upload_sessions.id |
| user_id | UUID | FK to profiles.id |
| total_images | INT | Images in this batch |
| status | TEXT | pending/uploading/processing/completed/failed/partial_error |
| ... | ... | (other existing columns) |

---

## New/Enhanced Entities

### images (enhancement for deduplication)

**New Column**:

| Column | Type | Description | Default |
|--------|------|-------------|---------|
| original_filename | TEXT | Original filename from upload | NULL |

**New Index**:

```sql
CREATE INDEX idx_images_dedup
ON images(user_id, original_filename, file_size_bytes);
```

**Migration**: Required to add `original_filename` column for filename+size deduplication.

### upload_sessions (enhancement for bulk progress)

**New Columns**:

| Column | Type | Description | Default |
|--------|------|-------------|---------|
| uploaded_count | INT | Files successfully uploaded | 0 |
| processed_count | INT | Files with AI analysis complete | 0 |
| failed_count | INT | Files that failed upload/processing | 0 |
| skipped_count | INT | Files skipped (duplicates) | 0 |

**Migration**: Required to add progress tracking columns.

---

## Entity Relationship Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                               Bulk Upload Flow                                │
└──────────────────────────────────────────────────────────────────────────────┘

┌───────────────────┐
│    profiles       │
│    (existing)     │
├───────────────────┤
│ id (PK)           │
│ email             │
│ ...               │
└─────────┬─────────┘
          │
          │ 1:N
          ▼
┌───────────────────┐       1:N       ┌───────────────────┐
│  upload_sessions  │◄────────────────│ processing_batches│
│    (existing +    │                 │    (existing)     │
│    new columns)   │                 ├───────────────────┤
├───────────────────┤                 │ id (PK)           │
│ id (PK)           │                 │ upload_session_id │
│ user_id (FK)      │                 │ user_id (FK)      │
│ total_batches     │                 │ total_images      │
│ total_images      │                 │ status            │
│ uploaded_count    │◄── NEW          │ ...               │
│ processed_count   │◄── NEW          └───────────────────┘
│ failed_count      │◄── NEW
│ skipped_count     │◄── NEW
│ status            │
│ created_at        │
│ completed_at      │
└─────────┬─────────┘
          │
          │ (via user_id)
          ▼
┌───────────────────┐       1:N       ┌───────────────────┐
│     images        │────────────────►│   detections      │
│  (existing +      │                 │    (existing)     │
│   new column)     │                 └───────────────────┘
├───────────────────┤
│ id (PK)           │
│ user_id (FK)      │
│ file_path         │
│ file_size_bytes   │
│ original_filename │◄── NEW (for dedup)
│ detection_status  │ ◄── Realtime subscription
│ exif_data         │
│ ...               │
└───────────────────┘
```

---

## Validation Rules

### images.original_filename
- **Type**: TEXT, nullable
- **Validation**: Sanitized filename (no path separators)
- **Max Length**: 255 characters
- **Usage**: Combined with `file_size_bytes` for duplicate detection

### upload_sessions progress counters
- **Constraint**: All counts >= 0
- **Invariant**: `uploaded_count + failed_count <= total_images`
- **Invariant**: `processed_count <= uploaded_count`
- **Invariant**: `skipped_count <= total_images`

---

## State Transitions

### upload_sessions.status

```
                ┌─────────────┐
                │  uploading  │ (initial)
                └──────┬──────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
         ▼             ▼             ▼
┌─────────────┐ ┌───────────┐ ┌─────────────┐
│  processing │ │   failed  │ │ completed   │
│             │ │(all fail) │ │(0 uploads)  │
└──────┬──────┘ └───────────┘ └─────────────┘
       │
       ├─────────────┬─────────────┐
       │             │             │
       ▼             ▼             ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  completed  │ │partial_error│ │   failed    │
│(all success)│ │(some failed)│ │(all failed) │
└─────────────┘ └─────────────┘ └─────────────┘
```

### images.detection_status

```
┌─────────┐     upload      ┌────────────┐    Trigger.dev    ┌───────────┐
│ pending │────complete────►│ processing │───────job────────►│ completed │
└────┬────┘                 └─────┬──────┘                   └───────────┘
     │                            │
     │        upload              │         job
     │        failure             │        failure
     ▼                            ▼
┌─────────┐                 ┌─────────┐
│ (retry) │                 │ failed  │
└─────────┘                 └─────────┘
```

---

## Migration Requirements

### Migration: 036_bulk_upload_support.sql

```sql
-- Add original_filename for deduplication
ALTER TABLE images ADD COLUMN original_filename TEXT;

-- Create deduplication index
CREATE INDEX idx_images_dedup
ON images(user_id, original_filename, file_size_bytes)
WHERE original_filename IS NOT NULL;

-- Add progress tracking to upload_sessions
ALTER TABLE upload_sessions ADD COLUMN uploaded_count INT NOT NULL DEFAULT 0;
ALTER TABLE upload_sessions ADD COLUMN processed_count INT NOT NULL DEFAULT 0;
ALTER TABLE upload_sessions ADD COLUMN failed_count INT NOT NULL DEFAULT 0;
ALTER TABLE upload_sessions ADD COLUMN skipped_count INT NOT NULL DEFAULT 0;

-- Add check constraints
ALTER TABLE upload_sessions ADD CONSTRAINT chk_uploaded_count
CHECK (uploaded_count >= 0);
ALTER TABLE upload_sessions ADD CONSTRAINT chk_processed_count
CHECK (processed_count >= 0);
ALTER TABLE upload_sessions ADD CONSTRAINT chk_failed_count
CHECK (failed_count >= 0);
ALTER TABLE upload_sessions ADD CONSTRAINT chk_skipped_count
CHECK (skipped_count >= 0);
```

---

## RLS Considerations

### Deduplication Query
The duplicate check API must filter by user_id (handled by existing RLS policies on images table):

```sql
-- Check for existing files (RLS enforced)
SELECT original_filename
FROM images
WHERE user_id = auth.uid()
  AND original_filename = ANY($1)
  AND file_size_bytes = ANY($2);
```

### Realtime Subscription Filter
Client subscription must include account_id filter (handled by application code):

```typescript
.on('postgres_changes', {
  event: 'UPDATE',
  schema: 'public',
  table: 'images',
  filter: `user_id=eq.${userId}`
}, handleUpdate)
```

---

## Scale Assumptions

| Metric | Value | Notes |
|--------|-------|-------|
| Max files per upload session | 10,000 | From spec |
| Typical file size | 2-5 MB | Trail camera photos |
| Total session data | ~30 GB | 10K x 3MB average |
| Concurrent users uploading | 10-50 | MVP scale |
| Images per user (total) | 50,000+ | Power users |

### Index Performance

The `idx_images_dedup` index supports the deduplication query:
- Selectivity: High (user_id + filename + size is nearly unique)
- Query time: <10ms for checking 10,000 filenames
- Size: ~50MB per 100K images

---

## Related Documents

- [Spec](./spec.md) - FR-017 (deduplication requirement)
- [Research](./research.md) - Deduplication patterns
- [Contracts](./contracts/upload-api.yaml) - API endpoints
