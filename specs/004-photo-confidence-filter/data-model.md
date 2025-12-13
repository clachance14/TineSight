# Data Model: Photo Confidence Filter

**Feature**: 004-photo-confidence-filter
**Date**: 2025-12-07

## Overview

This feature extends the existing photo filtering system. No new database tables or columns are required - the feature uses existing `images` and `detections` tables.

## Existing Entities (Reference Only)

### images (existing table)

| Field | Type | Notes |
|-------|------|-------|
| id | uuid | Primary key |
| user_id | uuid | FK to auth.users |
| detection_status | text | 'pending', 'processing', 'completed', 'failed' |
| classification | text | 'has_deer', 'empty', null |
| confidence | numeric | Image-level confidence (unused for this feature) |

### detections (existing table)

| Field | Type | Notes |
|-------|------|-------|
| id | uuid | Primary key |
| image_id | uuid | FK to images |
| confidence | numeric | **Key field**: 0-1 scale from MegaDetector |
| class | text | Detection class ('animal', etc.) |
| quality_status | text | Quality classification |

## New Client-Side Types

### PhotoFilters (extended)

**File**: `components/photos/photo-filters.tsx` + `lib/services/photos.ts`

```typescript
export interface PhotoFilters {
  // Existing fields
  status?: 'all' | 'processing' | 'completed' | 'failed' | undefined
  hasDeer?: boolean | null | undefined
  batchId?: string | undefined
  qualityStatus?: 'all' | 'high_quality' | 'low_quality' | 'manual_review' | 'pending' | undefined

  // New field
  minConfidence?: number | undefined  // 0-100 integer, undefined = filter disabled
}
```

**Validation Rules**:
- `minConfidence` must be integer 0-100 when defined
- `minConfidence` increments by 5 (UI constraint, not enforced at type level)
- `undefined` means confidence filtering is disabled

### FilterState (internal component state)

**File**: `app/(dashboard)/photos/page.tsx`

```typescript
interface FilterState extends PhotoFilters {
  // Tracks last used confidence for toggle restoration
  _lastConfidence?: number  // Internal state, not sent to API
}
```

## Query Logic

### Confidence Filtering SQL

```sql
-- Get image IDs where ANY detection meets threshold
SELECT DISTINCT image_id
FROM detections
WHERE confidence >= :threshold  -- threshold is 0-1 (minConfidence/100)

-- Then filter images
SELECT * FROM images
WHERE id IN (:image_ids)
  AND user_id = :user_id
  -- Apply other filters...
```

### Combined Filter Logic

When multiple filters are active:

```
Final Result = images WHERE
  user_id = auth.uid()
  AND (status filter OR status = 'all')
  AND (hasDeer filter OR hasDeer = null)
  AND (qualityStatus filter OR qualityStatus = 'all')
  AND (minConfidence filter OR minConfidence = undefined)
```

**"Any detection" logic**: A photo passes the confidence filter if at least one of its detections has `confidence >= threshold`.

## URL State Schema

For shareable filter links:

| Parameter | Type | Example | Notes |
|-----------|------|---------|-------|
| status | string | `?status=completed` | Optional |
| hasDeer | boolean | `?hasDeer=true` | Optional |
| qualityStatus | string | `?qualityStatus=high_quality` | Optional |
| minConfidence | integer | `?minConfidence=50` | 0-100, optional |

**Example**: `/photos?hasDeer=true&minConfidence=75`

## State Transitions

### Filter Toggle States

```
[OFF] ←→ [ON at X%]
  ↓
[Clear All] → [Default: hasDeer=true, minConfidence=50]
```

### URL vs Session State Priority

```
1. URL params present? → Use URL params (shared link)
2. No URL params? → Use session state
3. No session state? → Use defaults (hasDeer=true, minConfidence=50)
```

## No Database Changes Required

This feature operates entirely on existing data:
- ✅ `detections.confidence` already populated by MegaDetector
- ✅ `images.classification` already set by detection pipeline
- ✅ No new indexes needed (confidence queries use existing image_id FK index)
