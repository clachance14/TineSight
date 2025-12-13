# Research: Gemini Deer Analysis Pipeline

**Date**: 2025-12-09
**Feature**: 005-gemini-deer-pipeline

## Research Summary

This document captures technical decisions and research findings for implementing the Gemini-based deer analysis pipeline.

---

## 1. Gemini API for Vision Analysis

### Decision
Use **Gemini 2.5 Flash** (`gemini-2.5-flash`) with structured JSON output for deer photo analysis.

### Rationale
- **Cost-effective**: Gemini Flash is optimized for high-volume, low-latency tasks (~$0.10-0.40 per million tokens)
- **Structured output support**: Native JSON schema enforcement guarantees parseable responses
- **Vision capabilities**: Supports bounding box detection with normalized coordinates (0-1000 scale)
- **Multimodal**: Accepts images in PNG, JPEG, WEBP, HEIC, HEIF formats

### Alternatives Considered
| Alternative | Reason Rejected |
|------------|-----------------|
| Gemini 2.5 Pro | Higher cost, unnecessary for this task |
| GPT-4 Vision | More expensive, no structured output guarantee |
| Continue with Replicate MegaDetector | Single-purpose (detection only), no species/sex/points analysis |

### Implementation Pattern
```typescript
// Use @google/genai SDK with Zod schema validation
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const analysisSchema = z.object({
  deer_present: z.boolean(),
  detections: z.array(z.object({
    box_2d: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    species: z.enum(["whitetail", "mule_deer", "elk", "unknown"]),
    sex: z.enum(["buck", "doe", "fawn", "unknown"]),
    antler_points: z.number().nullable(),
    age_class: z.enum(["young", "mature", "old", "unknown"]),
    distinguishing_features: z.string().nullable(),
    confidence: z.number()
  })),
  image_quality_score: z.number(),
  analysis_notes: z.string()
});

const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [image, prompt],
  config: {
    responseMimeType: "application/json",
    responseJsonSchema: zodToJsonSchema(analysisSchema)
  }
});
```

### Key Details
- Bounding box format: `[ymin, xmin, ymax, xmax]` normalized to 0-1000
- Must descale coordinates back to original image dimensions
- Set `thinking_budget: 0` for better object detection results

---

## 2. Gemini API for Deer Comparison (Re-ID)

### Decision
Use **Gemini 2.5 Flash** with multi-image prompting for deer re-identification comparisons.

### Rationale
- Gemini supports multiple images in a single request (uploaded files or inline base64)
- Can provide detailed reasoning for match confidence
- No need for embedding vectors - direct visual comparison
- Cost-effective for on-demand comparisons (~$0.065 for 15 comparisons)

### Implementation Pattern
```typescript
// Compare detection against catalog deer
const comparisonSchema = z.object({
  best_match: z.object({
    deer_id: z.string(),
    deer_name: z.string(),
    confidence: z.number(),
    reasoning: z.string()
  }).nullable(),
  other_possibilities: z.array(z.object({
    deer_id: z.string(),
    deer_name: z.string(),
    confidence: z.number()
  })),
  is_likely_new_deer: z.boolean()
});

// Send detection image + all catalog reference images
const response = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [
    "Compare this deer detection to the catalog deer below...",
    detectionImage,
    ...catalogImages.map(img => img.referencePhoto)
  ],
  config: {
    responseMimeType: "application/json",
    responseJsonSchema: zodToJsonSchema(comparisonSchema)
  }
});
```

### Key Details
- Upload large/reusable images via File API for efficiency
- Use inline base64 for one-time images
- Include deer names in prompt for meaningful response

---

## 3. JavaScript/TypeScript SDK Choice

### Decision
Use **@google/genai** (Google Gen AI SDK for JavaScript/TypeScript)

### Rationale
- Official Google SDK with active maintenance
- Native TypeScript support
- Works with Zod via `zod-to-json-schema` for schema definition
- Supports both Gemini Developer API and Vertex AI

### Dependencies
```json
{
  "@google/genai": "^0.x.x",
  "zod": "^3.x.x",
  "zod-to-json-schema": "^3.x.x"
}
```

---

## 4. Trigger.dev Job Architecture

### Decision
Create two new Trigger.dev jobs to replace the existing pipeline:
1. `analyze-photo.ts` - Bulk photo analysis (replaces detect-animals + generate-embedding)
2. `compare-deer.ts` - On-demand matching (replaces find-matches)

### Rationale
- Simplifies pipeline from 3 jobs to 2 jobs
- Removes embedding storage complexity (no pgvector needed for new pipeline)
- Aligns with user workflow (automatic analysis → on-demand matching)

### Job Configuration
```typescript
// analyze-photo.ts
export const analyzePhotoTask = task({
  id: "analyze-photo",
  maxAttempts: 3,
  queue: { concurrencyLimit: 15 },
  // ...
});

// compare-deer.ts
export const compareDeerTask = task({
  id: "compare-deer",
  maxAttempts: 2,
  queue: { concurrencyLimit: 5 },
  // ...
});
```

---

## 5. Database Schema Changes

### Decision
Extend existing tables with Gemini-specific columns rather than creating new tables.

### Rationale
- Maintains compatibility with existing UI components
- Simpler migration path
- Reuses established patterns (detections, match_candidates)

### Schema Changes
```sql
-- Images table additions
ALTER TABLE images ADD COLUMN has_deer BOOLEAN;
ALTER TABLE images ADD COLUMN deer_count INTEGER DEFAULT 0;
ALTER TABLE images ADD COLUMN analysis_notes TEXT;
ALTER TABLE images ADD COLUMN analyzed_at TIMESTAMPTZ;

-- Detections table additions
ALTER TABLE detections ADD COLUMN species TEXT;
ALTER TABLE detections ADD COLUMN sex TEXT;
ALTER TABLE detections ADD COLUMN antler_points INTEGER;
ALTER TABLE detections ADD COLUMN age_class TEXT;
ALTER TABLE detections ADD COLUMN distinguishing_features TEXT;
ALTER TABLE detections ADD COLUMN gemini_confidence INTEGER;
ALTER TABLE detections ADD COLUMN head_bbox JSONB;
ALTER TABLE detections ADD COLUMN is_reference BOOLEAN DEFAULT FALSE;

-- Deer table additions
ALTER TABLE deer ADD COLUMN reference_detection_id UUID REFERENCES detections(id);

-- Match candidates additions
ALTER TABLE match_candidates ADD COLUMN gemini_reasoning TEXT;
ALTER TABLE match_candidates ADD COLUMN gemini_confidence INTEGER;
```

---

## 6. Embedding Storage Decision

### Decision
**Remove pgvector embedding storage** - Gemini performs direct visual comparison without embeddings.

### Rationale
- Gemini's vision model compares images directly, no pre-computed embeddings needed
- Simplifies architecture (no embedding generation job, no vector similarity search)
- Reduces storage costs (no 1536-dimensional vectors per detection)
- On-demand comparison is fast enough for the use case

### Impact
- Delete `deer_embeddings` table data (per Fresh Start migration)
- Remove `find_similar_deer` PostgreSQL function usage
- Remove `generate-embedding.ts` Trigger.dev job

---

## 7. Migration Strategy

### Decision
**Replace In-Place + Fresh Start** (user confirmed)

### Files to Delete
| File | Purpose |
|------|---------|
| `trigger/jobs/detect-animals.ts` | MegaDetector detection |
| `trigger/jobs/generate-embedding.ts` | Embedding generation |
| `trigger/jobs/find-matches.ts` | pgvector similarity search |
| `trigger/jobs/compute-quality.ts` | ROI quality scoring |
| `trigger/jobs/regenerate-embedding.ts` | ROI re-embedding |
| `lib/replicate/client.ts` | Replicate API client |

### Data Migration
```sql
-- Clear existing detection data
TRUNCATE TABLE match_candidates CASCADE;
TRUNCATE TABLE deer_embeddings CASCADE;
TRUNCATE TABLE detection_rois CASCADE;
TRUNCATE TABLE detections CASCADE;
-- Keep deer table for catalog structure (users can rebuild)
```

---

## 8. Environment Variables

### New Variables Required
```env
GEMINI_API_KEY=your-gemini-api-key
```

### Variables to Remove (after migration)
```env
REPLICATE_API_TOKEN=...
EMBEDDING_MODEL_VERSION=...
```

---

## 9. Rate Limiting & Error Handling

### Decision
Implement exponential backoff with Trigger.dev's built-in retry mechanism.

### Configuration
- Max attempts: 3 for analysis, 2 for comparison
- Concurrency limit: 15 for analysis (parallel batch processing)
- Concurrency limit: 5 for comparison (lighter load, higher cost per call)

### Error Handling
- Individual photo failures don't stop batch processing
- Failed photos marked with error message for retry
- Gemini API errors logged with full response for debugging

---

## Sources

- [Gemini API Structured Outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini Vision API Guide](https://ai.google.dev/gemini-api/docs/image-understanding)
- [Google Gen AI SDK for JavaScript](https://googleapis.github.io/js-genai/release_docs)
- [Gemini 2.5 Flash Model](https://deepmind.google/models/gemini/flash/)
