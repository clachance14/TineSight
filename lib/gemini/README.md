# Gemini Client Module

Google Gemini API client for TineSight's deer analysis and re-identification pipeline.

## Overview

This module provides type-safe wrappers around the Google Gemini API for:
- **Photo Analysis**: Detect and classify deer in trail camera photos
- **Deer Comparison**: Match deer detections against a catalog using visual comparison

## Files

- `client.ts` - Main API client with retry logic
- `types.ts` - Zod schemas and TypeScript types
- `prompts.ts` - System prompts for Gemini
- `index.ts` - Public exports

## Usage

### Setup

Ensure `GEMINI_API_KEY` is set in your environment:

```bash
GEMINI_API_KEY="your-gemini-api-key"
```

### Analyze Photo

```typescript
import { analyzePhoto } from "@/lib/gemini";

const result = await analyzePhoto(imageBase64, "image/jpeg");

console.log(result.deer_present); // boolean
console.log(result.detections); // Array of deer detections
console.log(result.image_quality_score); // 0-100
```

**Response Structure** (`AnalysisResult`):
```typescript
{
  deer_present: boolean;
  detections: Array<{
    box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
    head_bbox?: { ymin, xmin, ymax, xmax };
    species: 'whitetail' | 'mule_deer' | 'elk' | 'unknown';
    sex: 'buck' | 'doe' | 'fawn' | 'unknown';
    antler_points: number | null;
    age_class: 'young' | 'mature' | 'old' | 'unknown';
    distinguishing_features: string | null;
    confidence: number; // 0-100
  }>;
  image_quality_score: number; // 0-100
  analysis_notes: string;
}
```

### Compare Deer

```typescript
import { compareDeers } from "@/lib/gemini";

const catalogDeer = [
  {
    id: "deer-123",
    name: "Big 12",
    referenceImageBase64: "...",
    referenceImageMimeType: "image/jpeg"
  },
  // ... more catalog deer
];

const result = await compareDeers(
  detectionImageBase64,
  "image/jpeg",
  catalogDeer
);

console.log(result.best_match); // { deer_id, deer_name, confidence, reasoning }
console.log(result.is_likely_new_deer); // boolean
```

**Response Structure** (`ComparisonResult`):
```typescript
{
  best_match: {
    deer_id: string;
    deer_name: string;
    confidence: number; // 0-100
    reasoning: string;
  } | null;
  other_possibilities: Array<{
    deer_id: string;
    deer_name: string;
    confidence: number;
  }>;
  is_likely_new_deer: boolean;
}
```

### Validate Client

```typescript
import { validateGeminiClient } from "@/lib/gemini";

try {
  await validateGeminiClient();
  console.log("Gemini API is configured correctly");
} catch (error) {
  console.error("Gemini API validation failed:", error);
}
```

## Features

### Retry Logic

Automatically retries on transient errors:
- Rate limits (HTTP 429)
- Timeouts
- Network errors (HTTP 503)

**Configuration**:
- Max attempts: 3
- Initial delay: 1000ms
- Backoff multiplier: 2x

### Structured Output

Uses Zod schemas to enforce JSON response format, ensuring type-safe, parseable responses.

### Multi-Image Support

The `compareDeers` function sends multiple images in a single request for efficient visual comparison.

## Model

Uses **Gemini 2.5 Flash** (`gemini-2.5-flash`):
- Cost-effective (~$0.10-0.40 per million tokens)
- Fast inference
- Supports vision + structured JSON output
- Optimized for object detection with `thinkingBudget: 0`

## Error Handling

All functions throw descriptive errors on failure:

```typescript
try {
  const result = await analyzePhoto(imageBase64, "image/jpeg");
} catch (error) {
  if (error instanceof Error) {
    console.error("Analysis failed:", error.message);
    // Error messages: "Gemini photo analysis failed: <reason>"
  }
}
```

## Development

Type check:
```bash
npx tsc --noEmit lib/gemini/*.ts
```

## References

- [Gemini API Structured Outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini Vision API](https://ai.google.dev/gemini-api/docs/image-understanding)
- [Google Gen AI SDK](https://googleapis.github.io/js-genai/release_docs)
