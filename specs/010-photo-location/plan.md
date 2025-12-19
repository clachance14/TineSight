# Implementation Plan: Photo Location

**Branch**: `010-photo-location` | **Date**: 2025-12-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-photo-location/spec.md`

## Summary

Add location data to photo uploads via a Mapbox map picker modal, allowing hunting lease operators to specify where trail camera photos were taken. Location data is stored at the batch level (not individual photos) to accommodate cameras that move between uploads. Users can filter photos by area name to track deer sightings across their property.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: Next.js 14 (App Router), React 18, react-map-gl, mapbox-gl, TanStack Query, Zustand
**Storage**: PostgreSQL via Supabase (processing_batches table extended with location fields)
**Testing**: Playwright (E2E), Vitest (unit)
**Target Platform**: Web (Vercel serverless)
**Project Type**: Web application (Next.js full-stack)
**Performance Goals**: Map loads in <2 seconds, location setting in <30 seconds total user time
**Constraints**: Mapbox API requires access token, satellite imagery data usage
**Scale/Scope**: Existing user base, extends upload flow and photos page filtering

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Serverless-First | ✅ PASS | Mapbox is API-based service, no self-managed infrastructure |
| II. Human-in-the-Loop AI | ✅ N/A | No AI/ML in this feature - user manually sets location |
| III. Multi-Tenant Data Isolation | ✅ PASS | Location stored in processing_batches with existing user_id RLS |
| IV. Role-Based Access Control | ✅ PASS | Upload (Owners only) already enforced; viewing (all roles) unchanged |
| V. Integration Testing | ⚠️ REQUIRED | Must add integration tests for location upload flow and area filtering |
| VI. Phased Delivery | ✅ PASS | User stories prioritized P1/P2/P3, each independently testable |
| VII. Design System | ✅ PASS | Will use TineSight palette (copper accent, slate surfaces), shadcn/ui |

**Gate Result**: PASS - No violations. Integration tests required per Principle V.

## Project Structure

### Documentation (this feature)

```text
specs/010-photo-location/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── batch-location-api.yaml
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
# Next.js App Router structure (existing)
app/
├── (dashboard)/
│   ├── upload/
│   │   └── page.tsx           # Modified: integrate location picker modal
│   └── photos/
│       └── page.tsx           # Modified: add area filter dropdown
└── api/
    └── photos/
        ├── upload/
        │   └── route.ts       # Modified: accept location data
        └── areas/
            └── route.ts       # NEW: fetch distinct area names

components/
├── photos/
│   ├── location-picker-modal.tsx  # NEW: Mapbox map with pin placement
│   ├── photo-uploader.tsx         # Modified: trigger location picker
│   └── photo-filters.tsx          # Modified: add area dropdown
└── ui/                            # Existing shadcn/ui components

lib/
├── stores/
│   └── upload.ts              # Modified: add location state
├── services/
│   ├── batches.ts             # Modified: accept location in createBatch
│   └── photos.ts              # Modified: add areaName filter
└── hooks/
    └── use-areas.ts           # NEW: fetch area names hook

supabase/
└── migrations/
    └── 025_batch_location.sql # NEW: add location columns

tests/
├── e2e/
│   └── photo-location.spec.ts # NEW: location upload flow test
└── integration/
    └── area-filter.test.ts    # NEW: area filtering test
```

**Structure Decision**: Extends existing Next.js App Router structure. New components added to `components/photos/`, new API route for areas, database migration for location columns.

## Complexity Tracking

> No constitution violations to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |
