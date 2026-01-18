# Implementation Plan: 10K Photo Bulk Upload

**Branch**: `012-bulk-upload` | **Date**: 2025-12-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-bulk-upload/spec.md`

## Summary

Enable hunting lease operators to upload 10,000+ photos from SD cards without browser crashes. Uses Web Worker for memory-safe EXIF extraction, chunked file processing (25 files per chunk), parallel uploads (5 concurrent), streaming AI processing via Trigger.dev, and Supabase Realtime for live gallery updates. Includes filename+size deduplication for interrupted upload recovery.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: Next.js 14 (App Router), React 18, TanStack Query, Trigger.dev v3, Sharp (server-side thumbnails), Supabase Realtime
**Storage**: PostgreSQL via Supabase with pgvector, Supabase Storage for images
**Testing**: Playwright (E2E), Vitest (unit)
**Target Platform**: Modern browsers (Chrome, Firefox, Edge, Safari 2023+)
**Project Type**: web (Next.js full-stack)
**Performance Goals**:
- First processed photo visible in <20 seconds
- 10K photo upload in <15 minutes on 100Mbps
- AI processing of 10K photos in <70 minutes
**Constraints**:
- Browser memory <500MB during 10K upload
- Signed URL validity minimum 5 minutes per chunk
- 99%+ upload success rate on stable connections
**Scale/Scope**: 10,000 photos per upload session, typical file size 2-5MB

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Serverless-First | ✅ PASS | Uses Vercel, Supabase, Trigger.dev, Gemini API - no self-managed infrastructure |
| II. Human-in-the-Loop AI | ✅ PASS | AI detects deer and suggests matches; no autonomous catalog changes |
| III. Multi-Tenant Data Isolation | ✅ PASS | RLS on photos table; dedup check scoped to user's account |
| IV. Role-Based Access Control | ✅ PASS | Upload requires Owner role (existing enforcement) |
| V. Integration Testing Over Unit Testing | ✅ PASS | E2E tests for upload flow, contract tests for signed URL API |
| VI. Phased Delivery | ✅ PASS | User stories prioritized P1-P3; P1 delivers working bulk upload |
| VII. Design System Compliance | ✅ PASS | Upload UI uses TineSight palette; dark mode default |

**Gate Result**: PASS - No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/012-bulk-upload/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── upload-api.yaml  # Upload endpoints OpenAPI spec
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
app/
├── (dashboard)/upload/
│   └── page.tsx           # Enhanced bulk upload UI
├── api/photos/
│   ├── signed-urls/       # Batch signed URL generation
│   │   └── route.ts
│   └── check-duplicates/  # Filename+size dedup check
│       └── route.ts

components/
├── upload/
│   ├── BulkUploader.tsx       # Main upload orchestrator
│   ├── UploadProgress.tsx     # Dual progress bars (upload/processing)
│   ├── FileProcessor.worker.ts # Web Worker for EXIF extraction
│   └── UploadQueue.tsx        # Chunk queue visualization

lib/
├── services/
│   └── photos.ts              # Enhanced with bulk operations
├── upload/
│   ├── chunker.ts             # File chunking logic
│   ├── uploader.ts            # Parallel upload manager
│   └── dedup.ts               # Duplicate detection client
└── hooks/
    └── useRealtimePhotos.ts   # Supabase Realtime subscription

trigger/
└── jobs/
    ├── process-photo.ts       # Existing - enhanced for streaming
    └── batch-process.ts       # Chunk trigger job

tests/
├── e2e/
│   └── bulk-upload.spec.ts    # E2E upload flow
└── integration/
    └── upload-api.test.ts     # API contract tests
```

**Structure Decision**: Web application structure using Next.js App Router. Client-side upload orchestration with Web Worker isolation. Server-side processing via Trigger.dev jobs. Real-time updates via Supabase Realtime WebSocket.

## Complexity Tracking

> No violations - table not needed.


---

## Execution Strategy

**MANDATORY: Use multi-agent parallel execution**

1. Analyze dependencies - identify independent vs dependent tasks
2. Group into parallel batches - cluster independent tasks
3. Execute with up to 5 agents in parallel via Task tool
4. Serialize only when dependencies require it

See CLAUDE.md "Execution Preferences" for parallelization rules.
