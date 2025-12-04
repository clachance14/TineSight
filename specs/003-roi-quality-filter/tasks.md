# Tasks: ROI Selection & Quality Filtering

**Input**: Design documents from `/specs/003-roi-quality-filter/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/roi-api.yaml
**Branch**: `003-roi-quality-filter`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and dependencies

- [x] T001 Install Sharp dependency for image processing: `npm install sharp && npm install -D @types/sharp`
- [x] T002 Create database migration file in `supabase/migrations/005_megadescriptor_roi.sql`
- [x] T003 Apply migration: `npx supabase db push`
- [x] T004 Regenerate TypeScript types: `npx supabase gen types typescript --linked > types/database.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Backend Services

- [x] T005 [P] Create ROI service in `lib/services/roi.ts` with CRUD operations (getROI, upsertROI, deleteROI, setROIReference, getReferenceROIs, countReferenceROIs)
- [x] T006 [P] Create quality service in `lib/services/quality.ts` with scoring logic (computeQualityScore, scoreToStatus, createFeedback, getFeedbackForDetection)
- [x] T007 [P] Create image cropping utility in `lib/image/crop.ts` using Sharp (cropToROI, cropImageFromUrl)

### API Routes

- [x] T008 [P] Create ROI CRUD endpoint in `app/api/detections/[id]/roi/route.ts` (GET, POST, PATCH, DELETE)
- [x] T009 [P] Create feedback endpoint in `app/api/detections/[id]/feedback/route.ts` (GET, POST)
- [x] T010 [P] Create regenerate-embedding endpoint in `app/api/detections/[id]/regenerate-embedding/route.ts` (POST)

### Background Jobs

- [x] T011 [P] Create regenerate-embedding Trigger.dev job in `trigger/jobs/regenerate-embedding.ts`
- [x] T012 [P] Create compute-quality Trigger.dev job in `trigger/jobs/compute-quality.ts`

### Client Hooks

- [x] T013 Create TanStack Query hooks in `lib/hooks/use-roi.ts` (useROI, useSaveROI, useDeleteROI, useToggleROIReference, useRegenerateEmbedding, useSubmitFeedback)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Draw ROI Selection on Photo (Priority: P1) 🎯 MVP

**Goal**: Allow users to draw a rectangular ROI around the head/antlers area of a detected deer

**Independent Test**: Upload a photo with a detected deer, draw a rectangle around the head/antlers area, verify the selection is saved and displayed correctly

### Implementation for User Story 1

- [x] T014 [P] [US1] Create ROI selector component in `components/photos/roi-selector.tsx` with canvas-based drawing, mouse/touch support
- [x] T015 [P] [US1] Create ROI control panel component in `components/photos/roi-control-panel.tsx` with Save, Clear, and status display
- [x] T016 [US1] Modify `components/photos/detection-overlay.tsx` to show ROI alongside detection bbox with distinct styling
- [x] T017 [US1] Create photo detail client wrapper in `components/photos/photo-detail-client.tsx` to manage ROI state and selection
- [x] T018 [US1] Modify `app/(dashboard)/photos/[id]/page.tsx` to integrate ROI selection UI (import ROISelector, ROIControlPanel, pass handlers)
- [x] T019 [US1] Add detection selection state - clicking a detection should enable ROI drawing mode for that detection
- [x] T020 [US1] Add ROI persistence - save/load ROI from API when detection is selected

**Checkpoint**: User Story 1 complete - users can draw, save, clear, and view ROI selections

---

## Phase 4: User Story 2 - Mark ROI as Reference (Priority: P2)

**Goal**: Allow users to mark certain ROI selections as "reference examples" for quality filtering

**Independent Test**: Save an ROI, toggle "Mark as Reference", verify reference status persists and is included in reference count

### Implementation for User Story 2

- [x] T021 [US2] Add reference toggle button to `components/photos/roi-control-panel.tsx` (already implemented)
- [x] T022 [US2] Display reference count on photo detail page showing "X/3 references needed for auto-filtering"
- [x] T023 [US2] Add visual indicator on detection overlay when ROI is marked as reference (amber styling)

**Checkpoint**: User Story 2 complete - users can mark/unmark ROIs as references

---

## Phase 5: User Story 3 - Regenerate Embedding from ROI (Priority: P2)

**Goal**: Allow users to regenerate re-ID embeddings using only the selected ROI region

**Independent Test**: Save an ROI, click "Regenerate Embedding", verify new embedding is generated from cropped ROI region

### Implementation for User Story 3

- [x] T024 [US3] Add "Regenerate Embedding" button to `components/photos/roi-control-panel.tsx` (already implemented)
- [x] T025 [US3] Add loading state and success/error feedback when regeneration is triggered
- [x] T026 [US3] Show processing status on detection card while embedding regeneration is in progress

**Checkpoint**: User Story 3 complete - users can trigger embedding regeneration from ROI

---

## Phase 6: User Story 4 - Automatic Quality Filtering (Priority: P3)

**Goal**: Automatically filter low-quality photos based on similarity to reference ROIs

**Independent Test**: Have 3+ reference ROIs, upload new photos, verify quality scores are computed and low-quality detections are marked

### Implementation for User Story 4

- [x] T027 [US4] Display quality status badge on detection cards in photo detail page (high_quality, low_quality, manual_review, pending)
- [x] T028 [US4] Display quality score percentage when available
- [x] T029 [US4] Add quality filter to photos list page to show/hide by quality status
- [x] T030 [US4] Integrate compute-quality job call after embedding generation completes

**Checkpoint**: User Story 4 complete - quality filtering is active when 3+ references exist

---

## Phase 7: User Story 5 - Provide Quality Feedback (Priority: P3)

**Goal**: Capture rejection feedback when users identify issues with detections

**Independent Test**: Click "Report Issue" on a detection, select a feedback type, verify feedback is recorded

### Implementation for User Story 5

- [x] T031 [P] [US5] Create quality feedback dialog component in `components/photos/quality-feedback-dialog.tsx` (already implemented)
- [x] T032 [US5] Wire "Report Issue" button in ROI control panel to open feedback dialog
- [x] T033 [US5] Show feedback history on detection card if feedback exists
- [x] T034 [US5] Add feedback submission success toast notification

**Checkpoint**: User Story 5 complete - users can submit quality feedback

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T035 Update `data-model.md` to reflect 1536-dim embeddings (MegaDescriptor change)
- [x] T036 Update `research.md` to document MegaDescriptor selection rationale
- [x] T037 Verify all components follow TineSight design system (copper for ROI, amber for reference)
- [ ] T038 Run quickstart.md validation - manual test all scenarios
- [x] T039 [P] Add error boundaries around ROI components for graceful failure handling
- [ ] T040 [P] Test ROI drawing with touch input on mobile devices (FR-014 validation) - verify `components/photos/roi-selector.tsx` handles touch events correctly

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - COMPLETED ✓
- **Foundational (Phase 2)**: Depends on Setup - COMPLETED ✓
- **User Stories (Phase 3-7)**: All depend on Foundational phase
  - US1 (P1): Can proceed now - IN PROGRESS
  - US2 (P2): Can start after US1 or in parallel (but needs ROI UI integrated)
  - US3 (P2): Can start after US1 or in parallel
  - US4 (P3): Depends on US2 (needs references to exist)
  - US5 (P3): Can start after US1 or in parallel
- **Polish (Phase 8)**: Depends on all user stories being complete

### Within User Story 1

Current blockers:
1. T016: detection-overlay needs ROI display
2. T017: photo-detail-client wrapper for state management
3. T018: page integration bringing it all together
4. T019-T020: interaction wiring

### Parallel Opportunities

**Can run in parallel now:**
- T016 (detection-overlay) and T017 (photo-detail-client) - different files
- T022 (reference count display) and T23 (reference visual indicator) - different files

---

## Parallel Example: Completing User Story 1

```bash
# Step 1: Create the client wrapper (required first)
Task T017: "Create photo detail client wrapper in components/photos/photo-detail-client.tsx"

# Step 2: These can run in parallel:
Task T016: "Modify detection-overlay.tsx to show ROI alongside detection bbox"
Task T19-T20: "Add detection selection and ROI persistence"

# Step 3: Final integration
Task T018: "Modify app/(dashboard)/photos/[id]/page.tsx to integrate ROI UI"
```

---

## Implementation Strategy

### Current State (Resuming Implementation)

**COMPLETED**: T001-T015, T021, T024, T031 (15 of 39 tasks = 38%)
**IN PROGRESS**: T016-T020 (User Story 1 integration)
**REMAINING**: T016-T020, T022-T023, T025-T030, T032-T039 (24 tasks)

### MVP Path (User Story 1 Only)

1. ~~Complete Phase 1: Setup~~ ✓
2. ~~Complete Phase 2: Foundational~~ ✓
3. **Complete Phase 3: User Story 1** ← CURRENT
4. **STOP and VALIDATE**: Test ROI drawing independently
5. Deploy/demo if ready

### Recommended Next Steps

1. Create `photo-detail-client.tsx` wrapper component (T017)
2. Update `detection-overlay.tsx` to display ROI (T016)
3. Modify page.tsx to use the new client wrapper (T018)
4. Wire up detection selection and ROI persistence (T019-T020)

---

## Summary

| Phase | Tasks | Completed | Status |
|-------|-------|-----------|--------|
| Setup | T001-T004 | 4/4 | ✅ Complete |
| Foundational | T005-T013 | 9/9 | ✅ Complete |
| US1 - Draw ROI | T014-T020 | 7/7 | ✅ Complete |
| US2 - Reference | T021-T023 | 3/3 | ✅ Complete |
| US3 - Regenerate | T024-T026 | 3/3 | ✅ Complete |
| US4 - Quality Filter | T027-T030 | 4/4 | ✅ Complete |
| US5 - Feedback | T031-T034 | 4/4 | ✅ Complete |
| Polish | T035-T040 | 4/6 | 🚧 In Progress |
| **Total** | **T001-T040** | **38/40** | **95%** |

---

## Notes

- [x] = COMPLETED (verified file exists in codebase)
- [ ] = PENDING or IN PROGRESS
- All ROI coordinates use 0-10000 normalized scale
- Quality thresholds: ≥0.7 high, 0.4-0.7 manual review, <0.4 low
- Minimum 3 reference ROIs required for auto-filtering
- MegaDescriptor uses 1536-dimensional embeddings (updated from 512)
