# Research: Photo Pipeline

**Feature**: 002-photo-pipeline
**Date**: 2025-12-02
**Status**: Complete

## Research Summary

This document captures research findings for technical decisions in the photo pipeline implementation.

---

## 1. MegaDetector Deployment to Replicate

### Decision
Deploy MegaDetector v5 as a custom Cog model to Replicate.

### Rationale
- MegaDetector is the industry-standard for wildlife camera trap image classification
- Trained specifically on camera trap imagery (not generic object detection)
- High accuracy for deer detection with bounding boxes
- Open-source (MIT license) and well-documented
- Replicate supports custom Cog model deployment

### Alternatives Considered
| Alternative | Why Rejected |
|------------|--------------|
| YOLO-World on Replicate | Generic object detection, not optimized for wildlife/camera traps |
| Grounding-DINO | Similar issue - not wildlife-specific |
| Self-hosted inference | Violates Serverless-First principle |

### Implementation Notes
- Model: `microsoft/megadetector-v5`
- Output: Bounding boxes with class (animal, person, vehicle) and confidence
- Post-processing: Filter for "animal" class, store as detections

---

## 2. Deer Re-Identification Embedding Model

### Decision
Use MegaDescriptor or CLIP-based embedding model deployed to Replicate for generating 512-dimensional vectors.

### Rationale
- MegaDescriptor is specifically designed for wildlife re-identification
- Part of the WildlifeDatasets toolkit with proven accuracy
- 512-dimensional vectors balance accuracy vs storage
- Cosine similarity works well for re-ID matching

### Alternatives Considered
| Alternative | Why Rejected |
|------------|--------------|
| Generic CLIP embeddings | Not optimized for wildlife, lower accuracy |
| Custom trained model | Requires labeled data we don't have yet |
| No embeddings (manual only) | Defeats core value proposition |

### Implementation Notes
- If MegaDescriptor unavailable, fall back to CLIP with fine-tuning planned
- Embeddings stored in pgvector with IVFFlat index
- Similarity threshold of 0.7 for "confident" matches

---

## 3. Trigger.dev Job Architecture

### Decision
Four jobs with fan-out pattern: `batch-process` → `detect-animals` → `generate-embedding` → `find-matches`

### Rationale
- Separation of concerns for each ML stage
- Fan-out allows parallel processing of images
- Independent retry logic per stage
- Clean status tracking per image

### Job Specifications

| Job | Trigger | Retry | Concurrency |
|-----|---------|-------|-------------|
| `batch-process` | API call after upload | 3x exponential | 5 per user |
| `detect-animals` | Per image from batch | 3x exponential | 20 global |
| `generate-embedding` | Per deer detection | 3x exponential | 20 global |
| `find-matches` | After embedding stored | 3x exponential | 50 global |

### Implementation Notes
- Use `batchTriggerAndWait` for coordinated processing
- Rate limit Replicate calls to avoid quota issues
- Store job status in `images.detection_status`

---

## 4. Supabase Storage Configuration

### Decision
Single `photos` bucket with folder-based RLS using pattern `{user_id}/{batch_id}/{filename}`.

### Rationale
- User isolation at storage level (defense-in-depth)
- Batch grouping allows easy cleanup
- Simple path structure for signed URL generation

### RLS Policies
```sql
-- Users can upload to their own folder
CREATE POLICY "Users upload to own folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can view their own photos
CREATE POLICY "Users view own photos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

---

## 5. Orphaned Embeddings Strategy

### Decision
Modify `deer_embeddings.deer_id` to be nullable, allowing embeddings to exist before deer profile assignment.

### Rationale
- Matches spec requirement FR-013: "store embeddings orphaned until assigned"
- Human-in-the-loop: embeddings exist, user confirms match to create/assign deer
- Simpler than creating placeholder deer records

### Migration
```sql
ALTER TABLE deer_embeddings
ALTER COLUMN deer_id DROP NOT NULL;
```

### Implementation Notes
- Background job creates embedding with `deer_id = NULL`
- User confirms match → UPDATE embedding with deer_id
- Query for orphaned: `WHERE deer_id IS NULL`

---

## 6. Similarity Search Function

### Decision
PostgreSQL function using pgvector `<=>` operator for cosine distance.

### Rationale
- Leverages existing IVFFlat index on `deer_embeddings`
- Returns top-N matches with similarity scores
- User-scoped to prevent cross-tenant matching

### Function Signature
```sql
CREATE FUNCTION find_similar_deer(
  query_embedding VECTOR(512),
  query_user_id UUID,
  match_count INT DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.7
) RETURNS TABLE (
  deer_id UUID,
  deer_name TEXT,
  similarity FLOAT,
  detection_id UUID,
  image_id UUID
)
```

---

## 7. Status Polling vs Real-Time

### Decision
Use TanStack Query polling (2-second interval) initially, upgrade to Supabase Realtime if needed.

### Rationale
- Simpler implementation
- Architecture doc recommends polling first
- 2-second refresh is acceptable UX for processing status
- Avoids WebSocket connection management

### Implementation Notes
```typescript
const { data } = useQuery({
  queryKey: ['photos', { status: 'processing' }],
  refetchInterval: (query) =>
    query.state.data?.some(p => p.detection_status === 'processing')
      ? 2000
      : false,
});
```

---

## 8. Client-Side Thumbnail Generation

### Decision
Generate 300px thumbnails client-side before upload using Canvas API.

### Rationale
- Faster grid loading (thumbnails are small)
- Reduces server-side processing
- Immediate preview while upload in progress

### Implementation Notes
- Use `canvas.toBlob()` for JPEG compression
- Upload original + thumbnail to separate paths
- Thumbnail path: `{user_id}/{batch_id}/thumbs/{filename}`

---

## Dependencies Resolved

All technical unknowns from spec have been addressed:

| Unknown | Resolution |
|---------|-----------|
| MegaDetector availability | Deploy as Cog model to Replicate |
| Re-ID embedding model | MegaDescriptor or CLIP fallback |
| Orphaned embedding storage | Make deer_id nullable |
| Batch tracking | New `processing_batches` table |
| Match candidates storage | New `match_candidates` table |
| Similarity search | PostgreSQL function with pgvector |
