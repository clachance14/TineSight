# Implementation Plan: ROI Selection & Quality Filtering

**Branch**: `003-roi-quality-filter` | **Date**: 2025-12-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-roi-quality-filter/spec.md`

## Summary

Add user-defined Region of Interest (ROI) selection to improve deer re-identification quality. Users draw a box around the head and antlers area, which serves as:
1. **Embedding source** - Generate re-ID embeddings from selected region (not full body)
2. **Quality filter** - Compare new detections against "gold standard" ROI selections
3. **Learning system** - Track rejection feedback for future filtering improvements

Technical approach: Extend existing detection pipeline with ROI storage, add canvas-based drawing UI to photo detail page, modify embedding generation to crop images, implement quality scoring via embedding similarity comparison.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: Next.js 14 (App Router), React 18, TanStack Query, Trigger.dev, Sharp (image processing)
**Storage**: PostgreSQL via Supabase with pgvector extension, Supabase Storage for images
**Testing**: Playwright (E2E), Vitest (unit)
**Target Platform**: Web (Vercel serverless), responsive desktop + mobile
**Project Type**: Web application (Next.js full-stack)
**Performance Goals**: ROI save < 500ms, embedding regeneration < 60s, quality scoring < 2s per detection
**Constraints**: Must integrate with existing detection/embedding pipeline, serverless execution limits
**Scale/Scope**: Development/training phase, single user initially

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Serverless-First | ✅ PASS | Uses Vercel functions, Trigger.dev jobs, Supabase - no self-managed infra |
| II. Human-in-the-Loop AI | ✅ PASS | ROI selection is manual user action; quality scores are suggestions requiring review |
| III. Multi-Tenant Data Isolation | ✅ PASS | ROI table will have RLS via detection→image→user chain; per-user reference scope |
| IV. Role-Based Access Control | ⚠️ N/A | Development phase with single user; RBAC not applicable yet |
| V. Integration Testing | ✅ PASS | Will include E2E tests for ROI selection and embedding regeneration flows |
| VI. Phased Delivery | ✅ PASS | 5 user stories with clear P1/P2/P3 priorities; P1 independently testable |
| VII. Design System Compliance | ✅ PASS | Will use TineSight palette (copper for ROI), shadcn/ui components |

**Gate Result**: PASS - All applicable principles satisfied

## Project Structure

### Documentation (this feature)

```text
specs/003-roi-quality-filter/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── roi-api.yaml     # ROI endpoints OpenAPI spec
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
# Next.js App Router structure (existing)
app/
├── (dashboard)/
│   └── photos/
│       └── [id]/
│           └── page.tsx          # MODIFY: Add ROI selection UI
└── api/
    └── detections/
        └── [id]/
            ├── roi/
            │   └── route.ts      # NEW: ROI CRUD endpoint
            ├── roi/
            │   └── reference/
            │       └── route.ts  # NEW: Toggle reference status
            ├── regenerate-embedding/
            │   └── route.ts      # NEW: Trigger ROI-based embedding
            └── feedback/
                └── route.ts      # NEW: Submit quality feedback

components/
└── photos/
    ├── roi-selector.tsx          # NEW: Canvas-based ROI drawing
    ├── roi-control-panel.tsx     # NEW: ROI controls sidebar
    ├── quality-feedback-dialog.tsx # NEW: Rejection reason modal
    └── detection-overlay.tsx     # MODIFY: Show ROI alongside detection bbox

lib/
├── services/
│   ├── roi.ts                    # NEW: ROI CRUD operations
│   └── quality.ts                # NEW: Quality scoring logic
├── image/
│   └── crop.ts                   # NEW: Server-side image cropping
└── hooks/
    └── use-roi.ts                # NEW: TanStack Query hooks for ROI

trigger/
└── jobs/
    ├── generate-embedding.ts     # MODIFY: Support ROI-based cropping
    ├── regenerate-embedding.ts   # NEW: Delete old + regenerate from ROI
    └── compute-quality.ts        # NEW: Quality scoring job

supabase/
└── migrations/
    └── 005_megadescriptor_roi.sql  # NEW: ROI tables, quality fields, 1536-dim embeddings

types/
└── database.ts                   # MODIFY: Add ROI and feedback types
```

**Structure Decision**: Follows existing TineSight patterns - service layer for data access, Trigger.dev for background processing, API routes for client actions, components for UI.

## Complexity Tracking

> No violations - all complexity justified by feature requirements.

| Item | Justification |
|------|---------------|
| Sharp dependency | Required for server-side image cropping before embedding generation |
| Canvas-based UI | Required for click-and-drag ROI drawing; standard browser API |
