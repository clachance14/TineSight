# Plan: Replace Gemini with OpenAI GPT-4.1-nano Pipeline

## Overview

Replace the current two-stage pipeline (YOLO-World + Gemini) with a single-stage OpenAI GPT-4.1-nano pipeline for deer detection and classification.

## Current vs New Architecture

```
CURRENT (Complex):
Image → Vast.ai GPU (YOLO-World) → Bounding Boxes → Gemini → Classification
        ↓                                            ↓
   ~20-30s, GPU cost                            ~5-10s per crop

NEW (Simple):
Image → OpenAI GPT-4.1-nano → Detections + Classification (one call)
                ↓
           ~6s, $0.0005/image
```

## Benefits

| Metric | Current | New |
|--------|---------|-----|
| API calls | 2+ (YOLO + Gemini per deer) | 1 |
| Time | 30-60s | ~6s |
| Cost | Vast.ai GPU + Gemini | ~$0.0005/image |
| Infrastructure | GPU worker required | None |
| Concurrency | 10 (GPU limited) | 50+ |

## Files to Create

### 1. `lib/openai/client.ts`
OpenAI client with `analyzePhoto()` function:
- Initialize OpenAI SDK
- Send image + prompt
- Parse JSON response
- Normalize coordinates to 0-10000 scale
- Return detection array matching existing schema

### 2. `lib/openai/prompts.ts`
Optimized prompt for deer detection:
```
Analyze this trail camera image for deer.

For each deer, return JSON with:
- box_2d: [ymin, xmin, ymax, xmax] normalized 0-1000
- sex: "buck", "doe", "fawn", or "unknown"
- antler_points: total count for bucks (null otherwise)
- antler_description: rack description for bucks
- age_class: "young", "mature", "old", "unknown"
- confidence: 0-100

Return JSON array only.
```

### 3. `lib/openai/types.ts`
Zod schemas for response validation (reuse existing detection schema)

### 4. `trigger/jobs/analyze-photo-openai.ts`
New trigger job:
- Fetch image from Supabase storage
- Call OpenAI analyzePhoto()
- Insert detections with `analysis_source: 'openai'`
- Update image status
- Higher concurrency limit (50)

### 5. `lib/config/feature-flags.ts`
Add new flag:
```typescript
export function isOpenAIPipelineEnabled(): boolean {
  return process.env['OPENAI_PIPELINE_ENABLED'] === 'true'
}
```

## Files to Modify

### 1. `trigger/jobs/batch-process.ts`
Add OpenAI pipeline option:
```typescript
if (isOpenAIPipelineEnabled()) {
  await analyzePhotoOpenai.batchTriggerAndWait(...)
} else if (isSam2PipelineEnabled()) {
  await analyzePhotoSam2.batchTriggerAndWait(...)
} else {
  await analyzePhoto.batchTriggerAndWait(...)
}
```

### 2. `supabase/migrations/013_openai_pipeline.sql`
Add 'openai' to analysis_source constraint:
```sql
ALTER TABLE detections DROP CONSTRAINT IF EXISTS chk_analysis_source;
ALTER TABLE detections ADD CONSTRAINT chk_analysis_source
  CHECK (analysis_source IS NULL OR analysis_source IN ('gemini', 'sam2', 'sam3', 'openai'));
```

### 3. `.env.example`
Add new environment variables:
```
OPENAI_API_KEY="sk-..."
OPENAI_PIPELINE_ENABLED="false"
```

## Detection Schema Compatibility

Output must match existing `detections` table:
```typescript
{
  image_id: string,
  bbox_x: number,      // center X (0-10000)
  bbox_y: number,      // center Y (0-10000)
  bbox_width: number,  // width (0-10000)
  bbox_height: number, // height (0-10000)
  sex: 'buck' | 'doe' | 'fawn' | 'unknown',
  antler_points: number | null,
  antler_description: string | null,
  age_class: string | null,
  confidence: number,
  analysis_source: 'openai',
  class: 'deer',
  species: 'whitetail',
}
```

## Coordinate Transformation

OpenAI returns `[ymin, xmin, ymax, xmax]` in 0-1000 scale.
Convert to center-based 0-10000 scale:
```typescript
const bbox_x = ((xmin + xmax) / 2) * 10;  // center X
const bbox_y = ((ymin + ymax) / 2) * 10;  // center Y
const bbox_width = (xmax - xmin) * 10;
const bbox_height = (ymax - ymin) * 10;
```

## Implementation Order

1. Add `OPENAI_API_KEY` to `.env.local`
2. Create migration `013_openai_pipeline.sql`
3. Push migration: `npx supabase db push`
4. Create `lib/openai/client.ts`
5. Create `lib/openai/prompts.ts`
6. Create `trigger/jobs/analyze-photo-openai.ts`
7. Update `lib/config/feature-flags.ts`
8. Update `trigger/jobs/batch-process.ts`
9. Update `.env.example`
10. Set `OPENAI_PIPELINE_ENABLED=true`
11. Test with single image
12. Process remaining pending images

## Rollback Plan

Keep existing Gemini/SAM3 code intact. Switch back by setting:
```
OPENAI_PIPELINE_ENABLED=false
SAM2_PIPELINE_ENABLED=true  # or false for Gemini-only
```

## Testing

1. Single image test via reprocess script
2. Verify detections in database
3. Check bounding box accuracy in UI
4. Run batch of 10 images
5. Full batch processing

## Cost Estimate

| Images | Cost |
|--------|------|
| 1 | $0.0005 |
| 100 | $0.05 |
| 400 | $0.20 |
| 1000 | $0.50 |
