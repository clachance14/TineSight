# Implementation Plan: Detection Editing Side Panel

**Branch**: `006-detection-edit-panel` | **Date**: 2025-12-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-detection-edit-panel/spec.md`

## Summary

Replace the current ROI selection behavior with a side panel editing interface for detection data. Users click bounding boxes or detection cards to open a slide-in panel from the right that displays detection details and allows editing of classification fields (sex, antler points, age class, species, distinguishing features). The panel includes Save and Delete buttons with confirmation dialogs for deletion. This provides hunting lease operators with a quick way to correct AI misclassifications and remove false positives.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Framework**: Next.js 14 (App Router), React 18
**Primary Dependencies**: TanStack Query (client state), Zustand (UI state), React Hook Form + Zod (validation), shadcn/ui (components)
**Storage**: PostgreSQL via Supabase (existing `detections` table with `deleted_at` column needed)
**Testing**: Playwright (E2E)
**Target Platform**: Web (desktop + mobile responsive)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: Panel opens within 500ms, Save completes within 2s
**Constraints**: No page refresh on save, optimistic UI updates
**Scale/Scope**: Single-user editing, 1-20 detections per photo typical

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Serverless-First | PASS | Uses Supabase API routes, no new infrastructure |
| II. Human-in-the-Loop AI | PASS | User manually corrects AI classifications |
| III. Multi-Tenant Data Isolation | PASS | Existing RLS on detections table enforces ownership |
| IV. Role-Based Access Control | PASS | Owner role can edit; Viewer role limited to viewing |
| V. Integration Testing Over Unit | PASS | Playwright E2E tests planned for user flows |
| VI. Phased Delivery | PASS | P1 (edit/delete), P2 (card click, features) independent |
| VII. Design System Compliance | PASS | shadcn/ui Sheet component, TineSight colors |

## Project Structure

### Documentation (this feature)

```text
specs/006-detection-edit-panel/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── detection-api.yaml
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
app/
├── (dashboard)/
│   └── photos/[id]/
│       └── page.tsx              # Existing - integrates panel
├── api/
│   └── detections/[id]/
│       ├── route.ts              # NEW - GET/PATCH/DELETE detection
│       └── ... (existing routes)

components/
├── photos/
│   ├── photo-detail-client.tsx   # MODIFY - integrate panel trigger
│   ├── detection-overlay.tsx     # MODIFY - change click behavior
│   ├── detection-card-with-feedback.tsx  # MODIFY - add click handler
│   └── detection-edit-panel.tsx  # NEW - side panel component
└── ui/
    └── sheet.tsx                 # ADD - shadcn/ui Sheet if missing

lib/
├── hooks/
│   └── use-detection.ts          # NEW - TanStack Query hooks for detection CRUD
├── services/
│   └── detections.ts             # MODIFY - add update/softDelete functions
└── stores/
    └── detection-edit.ts         # NEW - Zustand store for panel state

types/
└── database.ts                   # MODIFY - add DetectionUpdate type if missing

supabase/
└── migrations/
    └── 009_detection_soft_delete.sql  # NEW - add deleted_at column
```

**Structure Decision**: Web application using existing Next.js App Router structure. New components added to `components/photos/`, new API route for detection CRUD, new Zustand store for panel state management.

## Complexity Tracking

> No constitution violations to justify. Implementation stays within existing patterns.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |
