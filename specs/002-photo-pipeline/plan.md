# Implementation Plan: Photo Pipeline

**Branch**: `002-photo-pipeline` | **Date**: 2025-12-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-photo-pipeline/spec.md`

## Summary

Implement the complete photo processing pipeline for TineSight: bulk photo upload with drag-drop, AI-powered deer detection (Stage 1), embedding generation for re-identification (Stage 2), and match discovery with human-in-the-loop confirmation. This feature delivers the foundation for the North Star metric: **First Buck Re-Identified**.

## Technical Context

**Language/Version**: TypeScript 5.x on Next.js 14 (App Router)
**Primary Dependencies**:
- TanStack Query (data fetching)
- Zustand (client state)
- shadcn/ui (components)
- Trigger.dev (background jobs)
- Replicate SDK (ML inference)
**Storage**:
- Supabase PostgreSQL (database with pgvector)
- Supabase Storage (image files)
**Testing**: Playwright (E2E), Vitest (unit)
**Target Platform**: Web (Vercel serverless)
**Project Type**: Web application (Next.js full-stack)
**Performance Goals**:
- 100 photo upload in <60s
- Detection <5s/photo
- Embedding <10s/detection
- Grid load <2s (50 thumbnails)
**Constraints**:
- Serverless functions (no long-running processes)
- RLS on all tables
- Human confirmation required for matches
**Scale/Scope**: 1000s of photos per user per month, 10+ deer per catalog

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Serverless-First | ✅ PASS | Trigger.dev (serverless jobs), Replicate (API-based ML), Supabase Storage (managed) |
| II. Human-in-the-Loop | ✅ PASS | Match candidates require user confirmation (FR-016) |
| III. Multi-Tenant Isolation | ✅ PASS | RLS on images, detections, deer_embeddings; Storage bucket with user folder RLS |
| IV. Role-Based Access | ✅ PASS | Owners upload, viewers can view and confirm matches |
| V. Integration Testing | ✅ PASS | E2E tests for upload→detect→match flow planned |
| VI. Phased Delivery | ✅ PASS | 7 independent user stories with P1/P2/P3 priorities |
| VII. Design System | ✅ PASS | Uses shadcn/ui with TineSight theme, dark mode default |

**Gate Result**: PASS - No violations

## Project Structure

### Documentation (this feature)

```text
specs/002-photo-pipeline/
├── plan.md              # This file
├── research.md          # Phase 0 research findings
├── data-model.md        # Schema additions (processing_batches, match_candidates)
├── quickstart.md        # Trigger.dev, Replicate, Storage setup
├── contracts/           # API contracts
│   ├── photos-api.yaml  # Photo upload and management endpoints
│   └── matching-api.yaml # Match discovery and confirmation endpoints
├── checklists/
│   └── requirements.md  # Spec validation checklist
└── tasks.md             # Implementation tasks (from /speckit.tasks)
```

### Source Code (repository root)

```text
app/
├── (dashboard)/
│   └── photos/
│       ├── page.tsx              # Photo grid with upload
│       └── [id]/
│           └── page.tsx          # Photo detail with detections
├── api/
│   ├── photos/
│   │   ├── upload/route.ts       # Initiate upload
│   │   └── [id]/
│   │       ├── route.ts          # Photo CRUD
│   │       └── retry/route.ts    # Retry failed processing
│   ├── detections/
│   │   └── [id]/
│   │       └── confirm/route.ts  # Confirm/reject match
│   └── trigger/route.ts          # Trigger.dev webhook

components/
├── photos/
│   ├── photo-uploader.tsx        # Drag-drop upload zone
│   ├── upload-progress-panel.tsx # Progress tracking
│   ├── photo-grid.tsx            # Masonry grid
│   ├── photo-card.tsx            # Individual photo
│   ├── photo-viewer.tsx          # Full-size modal
│   ├── photo-filters.tsx         # Status filters
│   └── detection-overlay.tsx     # Bounding box display
└── deer/
    └── match-confirmation.tsx    # Side-by-side match UI

lib/
├── services/
│   ├── photos.ts                 # Photo upload, fetch, status
│   ├── detections.ts             # Detection CRUD
│   └── matching.ts               # Similarity search, confirmation
├── stores/
│   └── upload.ts                 # Upload queue state
└── replicate/
    └── client.ts                 # Replicate API wrapper

trigger/
├── client.ts                     # Trigger.dev configuration
└── jobs/
    ├── batch-process.ts          # Fan-out coordinator
    ├── detect-animals.ts         # MegaDetector Stage 1
    ├── generate-embedding.ts     # Re-ID Stage 2
    └── find-matches.ts           # Similarity search

supabase/
└── migrations/
    └── 002_photo_pipeline.sql    # New tables + functions

tests/
├── e2e/
│   ├── photo-upload.spec.ts      # Upload flow test
│   └── match-confirmation.spec.ts # Match flow test
└── integration/
    └── photo-pipeline.test.ts    # Service layer tests
```

**Structure Decision**: Next.js App Router with colocated API routes. Trigger.dev jobs in dedicated `/trigger` directory. Service layer pattern established in 001-saas-foundation is extended.

## Complexity Tracking

> No constitution violations to justify

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |

## Schema Changes Required

The existing schema from 001-saas-foundation has a constraint issue:

**Problem**: `deer_embeddings.deer_id` is `NOT NULL`, but spec requires "orphaned embeddings" (FR-013) that exist before a deer profile is created/matched.

**Solution Options**:
1. **Make deer_id nullable** - Simplest, allows orphaned embeddings
2. **Create placeholder deer records** - More complex, forces unnecessary deer creation

**Decision**: Option 1 - Alter `deer_embeddings.deer_id` to be nullable. Migration in `002_photo_pipeline.sql`.

## External Dependencies

| Service | Setup Required | Configuration |
|---------|---------------|---------------|
| **Trigger.dev** | Create project, get API key | `TRIGGER_API_KEY`, `TRIGGER_API_URL` |
| **Replicate** | Account + API token | `REPLICATE_API_TOKEN` |
| **Supabase Storage** | Create `photos` bucket | Bucket RLS policies |
| **MegaDetector** | Deploy to Replicate | Custom Cog model |

## Implementation Phases

### Phase 1: Upload Infrastructure
- Supabase Storage bucket with RLS
- PhotoUploader component (drag-drop)
- Upload progress panel
- `lib/services/photos.ts`
- `lib/stores/upload.ts`

### Phase 2: Photo Display
- PhotoGrid with filtering
- PhotoCard with status badges
- PhotoViewer modal
- TanStack Query integration

### Phase 3: Detection Pipeline
- Trigger.dev setup
- `detect-animals` job
- Detection status updates
- DetectionOverlay component

### Phase 4: Embedding & Matching
- `generate-embedding` job
- `find-matches` job
- MatchConfirmation UI
- Confirmation flow

### Phase 5: Polish
- Retry failed photos
- Error messaging
- Keyboard navigation
