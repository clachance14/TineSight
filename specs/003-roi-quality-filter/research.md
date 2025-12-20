# Research: ROI Selection & Quality Filtering

**Feature**: 003-roi-quality-filter
**Date**: 2025-12-02

## Research Topics

### 1. Canvas-Based ROI Drawing in React

**Decision**: Use native HTML5 Canvas API with React refs for ROI drawing

**Rationale**:
- Native Canvas provides precise mouse/touch coordinate handling
- No additional dependencies required
- Works well with responsive images
- Pattern already proven in many annotation tools

**Alternatives Considered**:
- **react-canvas-draw**: Library overhead not justified for simple rectangle drawing
- **Fabric.js**: Too heavy for single rectangle selection use case
- **SVG overlay**: Less performant for real-time drawing feedback

**Implementation Approach**:
```typescript
// Key pattern for coordinate normalization
const normalizeCoordinates = (
  clientX: number,
  clientY: number,
  containerRect: DOMRect
) => ({
  x: (clientX - containerRect.left) / containerRect.width,  // 0-1
  y: (clientY - containerRect.top) / containerRect.height   // 0-1
})

// Store as integers (scaled by 10000) matching existing detection pattern
const toStorageFormat = (normalized: number) => Math.round(normalized * 10000)
```

---

### 2. Server-Side Image Cropping with Sharp

**Decision**: Use Sharp library in Trigger.dev jobs for image cropping

**Rationale**:
- Sharp is the fastest Node.js image processing library
- Already works in serverless environments (Vercel, Trigger.dev)
- Supports fetching from URL, cropping, and outputting to buffer
- Can upload cropped image to Supabase Storage for embedding model

**Alternatives Considered**:
- **Jimp**: Slower, larger bundle size
- **ImageMagick/GraphicsMagick**: Requires native binaries, harder in serverless
- **Client-side cropping**: Increases payload size, not suitable for background jobs

**Implementation Approach**:
```typescript
import sharp from 'sharp'

async function cropImageToROI(
  imageBuffer: Buffer,
  roi: { x: number, y: number, width: number, height: number },
  imageWidth: number,
  imageHeight: number
): Promise<Buffer> {
  // Convert normalized coords (0-10000) to pixels
  const left = Math.round((roi.x / 10000) * imageWidth)
  const top = Math.round((roi.y / 10000) * imageHeight)
  const width = Math.round((roi.width / 10000) * imageWidth)
  const height = Math.round((roi.height / 10000) * imageHeight)

  return sharp(imageBuffer)
    .extract({ left, top, width, height })
    .jpeg({ quality: 90 })
    .toBuffer()
}
```

**Dependencies**: Add `sharp` to package.json

---

### 3. Quality Scoring via Embedding Similarity

**Decision**: Use cosine similarity between detection embedding and reference ROI embeddings

**Rationale**:
- Reuses existing pgvector infrastructure and `find_similar_deer` RPC pattern
- Embeddings from good ROI selections serve as "positive examples"
- Quality score = max similarity to any reference embedding
- Consistent with existing matching logic

**Alternatives Considered**:
- **Separate quality classifier model**: Additional ML model complexity, not justified for MVP
- **Heuristic-based scoring (bbox size, confidence)**: Less accurate, doesn't capture "good deer photo" concept
- **User-labeled training data**: Requires labeled dataset we don't have

**Implementation Approach**:
```sql
-- New RPC function for quality scoring
CREATE OR REPLACE FUNCTION compute_quality_score(
  target_detection_id UUID,
  query_user_id UUID
) RETURNS DECIMAL(4,3) AS $$
DECLARE
  target_embedding vector(512);
  max_similarity DECIMAL(4,3) := 0;
BEGIN
  -- Get target detection's embedding
  SELECT embedding INTO target_embedding
  FROM deer_embeddings
  WHERE detection_id = target_detection_id;

  IF target_embedding IS NULL THEN
    RETURN NULL;
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

**Thresholds** (configurable):
- High quality: score >= 0.7 → Auto-process embedding
- Manual review: 0.4 <= score < 0.7 → Flag for user review
- Low quality: score < 0.4 → Skip embedding generation

---

### 4. ROI Storage Schema Design

**Decision**: New `detection_rois` table with 1:1 relationship to detections

**Rationale**:
- Separates user-defined ROI from AI-detected bounding box
- Supports reference flagging per ROI
- Follows existing coordinate normalization pattern (0-10000 integers)
- RLS through detection→image→user chain

**Alternatives Considered**:
- **Add ROI columns to detections table**: Mixes AI data with user data, harder to track provenance
- **Separate `rois` table with many-to-one**: Overcomplicates for 1:1 use case

**Schema**:
```sql
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
  UNIQUE(detection_id)  -- One ROI per detection
);
```

---

### 5. Quality Feedback Schema

**Decision**: New `roi_feedback` table for rejection reasons

**Rationale**:
- Enables future learning from user feedback
- Categorized reasons allow aggregation and analysis
- Optional notes field for edge cases

**Schema**:
```sql
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
```

---

### 6. Pipeline Integration Points

**Decision**: Insert quality gate between detect-animals and generate-embedding jobs

**Rationale**:
- Quality scoring requires embedding to compare against references
- For initial detection, need to generate embedding first, then score
- For subsequent uploads (with references), can score before embedding

**Workflow**:
```
[New photo upload - no references yet]
detect-animals → generate-embedding → find-matches
                                    ↓
                              (user confirms matches, draws ROIs, marks references)

[Future uploads - references exist]
detect-animals → generate-embedding → compute-quality → find-matches (if high quality)
                                                     ↓
                                              (skip if low quality)
```

**Key Insight**: Quality scoring needs the detection's embedding to compute similarity. This means:
1. First-time detections always get embeddings (no references to compare against)
2. Once references exist, we still generate embeddings but skip expensive match-finding for low-quality
3. Alternative: Use MegaDetector bbox + heuristics for pre-embedding filtering (deferred to future optimization)

---

### 5.5. MegaDescriptor L/14 for Wildlife Re-Identification

**Decision**: Use MegaDescriptor-L/14 model (via Replicate API) for generating ROI embeddings

**Rationale**:
- **Wildlife-Trained Architecture**: MegaDescriptor is specifically trained on large-scale wildlife datasets, making it ideal for hunting/wildlife applications
- **ViT-L/14 Backbone**: Vision Transformer Large with 14x14 patch size provides excellent feature extraction for fine-grained animal characteristics (antler shape, color patterns, body markings)
- **1536-Dimensional Embeddings**: High-dimensional vectors capture subtle visual differences critical for re-identifying individual bucks
- **Production-Ready**: Already integrated via Replicate API in existing photo pipeline (proven reliability with MegaDetector)
- **pgvector Compatibility**: Existing Supabase pgvector infrastructure and `find_similar_deer` RPC pattern directly applicable

**Technical Specifications**:
- Input: Cropped ROI image (from detection bounding box)
- Output: 1536-dimensional embedding vector
- L2-normalized for cosine similarity matching
- Inference time: ~200-300ms via Replicate (acceptable for async Trigger.dev job)

**Alternatives Considered**:
- **DinoV2 ViT-B/14**: Smaller embeddings (768-dim), less specialized for wildlife
- **CLIP ViT-L/14**: General-purpose vision-language model, not optimized for wildlife re-identification
- **Fine-tuned ResNet50**: Older architecture, less effective than ViT models
- **Generic object detectors (YOLOv8) embeddings**: Not designed for similarity matching

**Implementation Pattern**:
```typescript
// Called from regenerate-embedding job after ROI cropping
async function generateROIEmbedding(
  croppedImageBuffer: Buffer,
  roiId: string
): Promise<number[]> {
  // Upload cropped image to temporary Supabase Storage location
  const tempUrl = await uploadToTempStorage(croppedImageBuffer, roiId)

  // Call Replicate MegaDescriptor endpoint
  const output = await replicate.run(
    'chg/megadescriptor-l14:e29bbb4b6ca5b6a60e3db78f5de12cfad20a32c3', // MegaDescriptor-L/14
    {
      inputs: {
        image: tempUrl,
      }
    }
  )

  // Returns embedding array [1536 floats]
  return output as number[]
}

// Store in deer_embeddings table
const { error } = await supabase
  .from('deer_embeddings')
  .update({
    embedding: output,  // pgvector auto-converts number[]
    model: 'megadescriptor-l14',
    model_version: '1.0',
    updated_at: new Date().toISOString()
  })
  .eq('detection_id', detectionId)
```

**Integration with Existing Pipeline**:
- Replaces previous embedding model for ROI-focused detections
- Uses existing `regenerate-embedding` job
- Quality scoring (Section 3) directly uses these embeddings via cosine similarity
- Maintains backward compatibility with existing `find_similar_deer` RPC

---

### 7. Touch Input Support

**Decision**: Use pointer events for unified mouse/touch handling

**Rationale**:
- Pointer Events API handles mouse, touch, and pen input uniformly
- Avoids separate mouse/touch event handlers
- Modern browser support is excellent

**Implementation**:
```typescript
// Use onPointerDown, onPointerMove, onPointerUp instead of mouse events
<div
  onPointerDown={handlePointerDown}
  onPointerMove={handlePointerMove}
  onPointerUp={handlePointerUp}
  onPointerLeave={handlePointerUp}
  style={{ touchAction: 'none' }}  // Prevent scroll during draw
/>
```

---

## Dependencies Summary

| Dependency | Version | Purpose |
|------------|---------|---------|
| sharp | ^0.33.x | Server-side image cropping in Trigger.dev jobs |

**Note**: All other required packages (Next.js, React, Supabase, Trigger.dev) are already in the project.

## Open Questions (Resolved)

1. ~~Should ROI be per-user or global?~~ → Per-user (clarified in spec)
2. ~~Minimum references before auto-filtering?~~ → 3 (clarified in spec)
3. ~~Replace or keep old embedding on regeneration?~~ → Replace (clarified in spec)
