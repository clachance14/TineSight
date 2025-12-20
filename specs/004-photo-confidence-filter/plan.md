# Implementation Plan: Photo Confidence Filter

**Branch**: `004-photo-confidence-filter` | **Date**: 2025-12-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-photo-confidence-filter/spec.md`

## Summary

Add a confidence threshold slider filter to the photo gallery that hides photos where no detection meets the threshold. Filters are ON by default (hasDeer=true, minConfidence=50%). Uses "any detection" logic - photo shown if ANY detection meets threshold. Includes "Copy link" button for sharing filtered views.

## Technical Context

**Language/Version**: TypeScript 5.x + Next.js 14 (App Router)
**Primary Dependencies**: React 18, TanStack Query, shadcn/ui, @radix-ui/react-slider
**Storage**: PostgreSQL via Supabase (existing `images` and `detections` tables)
**Testing**: Playwright (E2E), Vitest (unit)
**Target Platform**: Web (Vercel serverless)
**Project Type**: Next.js full-stack web application
**Performance Goals**: Photo list updates <1 second after filter change
**Constraints**: Must work with 10,000+ photos, maintain existing filter patterns
**Scale/Scope**: Single feature, 6 files modified + 1 new component

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Serverless-First | ✅ Pass | UI-only changes, uses existing Supabase queries |
| II. Human-in-the-Loop AI | ✅ N/A | Filtering existing data, no AI decisions |
| III. Multi-Tenant Data Isolation | ✅ Pass | Existing RLS policies on images/detections tables apply |
| IV. Role-Based Access Control | ✅ Pass | Viewing photos permitted for all roles |
| V. Integration Testing | ⚠️ Required | Must add E2E test for filter functionality |
| VI. Phased Delivery | ✅ Pass | 5 independent user stories (P1, P2, P3) |
| VII. Design System Compliance | ⚠️ Required | Must use TineSight colors, shadcn/ui slider |

**Gate Status**: ✅ PASS (with required follow-ups for testing and design system)

## Project Structure

### Documentation (this feature)

```text
specs/004-photo-confidence-filter/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── filter-api.yaml  # Filter query parameters contract
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
app/
├── (dashboard)/
│   └── photos/
│       └── page.tsx           # Update: default filters, URL state handling

components/
├── photos/
│   └── photo-filters.tsx      # Update: add slider, confidence filter UI
└── ui/
    └── slider.tsx             # Create: shadcn/ui slider component

lib/
├── services/
│   └── photos.ts              # Update: add confidence filtering to getPhotos()
└── hooks/
    └── use-photos.ts          # Update: add minConfidence to query params

app/api/
└── photos/
    └── route.ts               # Update: parse minConfidence parameter

tests/
└── e2e/
    └── photo-filters.spec.ts  # Create: E2E test for confidence filter
```

**Structure Decision**: Extends existing Next.js App Router structure. No new directories needed except `components/ui/slider.tsx` (standard shadcn pattern).

## Complexity Tracking

> No constitution violations requiring justification.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | - | - |
