# Tasks: Detection Editing Side Panel

**Input**: Design documents from `/specs/006-detection-edit-panel/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/detection-api.yaml

**Organization**: Tasks are grouped by user story to enable independent implementation and testing. US1 and US2 are both P1 priority (can be done in either order after foundational). US3 and US4 are P2 priority.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md structure (Next.js App Router):
- Components: `components/`
- API Routes: `app/api/`
- Services: `lib/services/`
- Hooks: `lib/hooks/`
- Stores: `lib/stores/`
- Migrations: `supabase/migrations/`

---

## Phase 1: Setup

**Purpose**: Add required dependencies and project infrastructure

- [x] T001 Add shadcn/ui Sheet component via `npx shadcn@latest add sheet` to components/ui/sheet.tsx
- [x] T002 [P] Add shadcn/ui AlertDialog if missing via `npx shadcn@latest add alert-dialog` to components/ui/alert-dialog.tsx
- [x] T003 [P] Add Zod validation schemas for detection editing in lib/validations/detection.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database changes and core services that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Create database migration to add `deleted_at` column in supabase/migrations/009_detection_soft_delete.sql
- [x] T005 Run migration with `npx supabase db push` and regenerate types with `npx supabase gen types typescript --linked > types/database.ts`
- [x] T006 Add `updateDetection()` service function in lib/services/detections.ts
- [x] T007 Add `softDeleteDetection()` service function in lib/services/detections.ts
- [x] T008 Modify `getDetectionsForImage()` to filter soft-deleted records (.is('deleted_at', null)) in lib/services/detections.ts
- [x] T009 Modify `getDetection()` to filter soft-deleted records in lib/services/detections.ts
- [x] T010 Create detection edit Zustand store in lib/stores/detection-edit.ts
- [x] T011 Create API route GET handler for single detection in app/api/detections/[id]/route.ts
- [x] T012 Create API route PATCH handler for detection update in app/api/detections/[id]/route.ts
- [x] T013 Create API route DELETE handler for soft delete in app/api/detections/[id]/route.ts
- [x] T014 Add RBAC check to PATCH/DELETE handlers - return 403 for Viewer role (Owner only can edit/delete) in app/api/detections/[id]/route.ts
- [x] T015 Create TanStack Query hook `useDetection()` for fetching in lib/hooks/use-detection.ts
- [x] T016 Create TanStack Query mutation `useUpdateDetection()` in lib/hooks/use-detection.ts
- [x] T017 Create TanStack Query mutation `useDeleteDetection()` in lib/hooks/use-detection.ts

**Checkpoint**: Foundation ready - API working, hooks ready, store ready. User story UI work can begin.

---

## Phase 3: User Story 1 - Edit Detection Classification (Priority: P1) 🎯 MVP

**Goal**: Operators can click a bounding box to open edit panel and correct AI misclassifications (sex, antler points, age class, species)

**Independent Test**: Click detection bounding box → Edit panel opens → Change sex to "buck" → Save → Refresh → Change persists

### Implementation for User Story 1

- [x] T018 [US1] Create DetectionEditPanel component with form fields (sex, antler_points, age_class, species, distinguishing_features) in components/photos/detection-edit-panel.tsx
- [x] T019 [US1] Add detection thumbnail using CSS object-fit/object-position to crop bbox region from full image in components/photos/detection-edit-panel.tsx
- [x] T020 [US1] Add form validation with React Hook Form + Zod in components/photos/detection-edit-panel.tsx
- [x] T021 [US1] Add Save button with loading state and toast feedback in components/photos/detection-edit-panel.tsx
- [x] T022 [US1] Add Close (X) button to dismiss panel in components/photos/detection-edit-panel.tsx
- [x] T023 [US1] Modify detection-overlay.tsx click handler to open panel instead of ROI mode in components/photos/detection-overlay.tsx
- [x] T024 [US1] Remove ROI selection imports and state from photo-detail-client.tsx in components/photos/photo-detail-client.tsx
- [x] T025 [US1] Integrate DetectionEditPanel into PhotoDetailClient in components/photos/photo-detail-client.tsx
- [x] T026 [US1] Wire up Zustand store to control panel open/close in components/photos/photo-detail-client.tsx
- [x] T027 [US1] Add optimistic UI update on save with TanStack Query cache invalidation in components/photos/detection-edit-panel.tsx
- [x] T028 [US1] Add error handling for network failures (show toast, keep panel open) in components/photos/detection-edit-panel.tsx
- [x] T029 [US1] Add detection switching (click different detection updates panel content) in components/photos/photo-detail-client.tsx
- [x] T030 [US1] Hide edit panel trigger for Viewer role users (check role in PhotoDetailClient) in components/photos/photo-detail-client.tsx

**Checkpoint**: User Story 1 complete - operators can edit detection classifications via bounding box click

---

## Phase 4: User Story 2 - Delete False Positive Detection (Priority: P1)

**Goal**: Operators can delete false positive detections via confirmation dialog

**Depends on**: US1 (panel component must exist)

**Independent Test**: Click detection → Open panel → Click Delete → Confirm → Detection disappears → Refresh → Still hidden

### Implementation for User Story 2

- [x] T031 [US2] Add Delete button to DetectionEditPanel in components/photos/detection-edit-panel.tsx
- [x] T032 [US2] Create DeleteConfirmationDialog component using AlertDialog in components/photos/delete-confirmation-dialog.tsx
- [x] T033 [US2] Wire Delete button to open confirmation dialog in components/photos/detection-edit-panel.tsx
- [x] T034 [US2] Call useDeleteDetection mutation on confirm in components/photos/detection-edit-panel.tsx
- [x] T035 [US2] Remove deleted detection from TanStack Query cache immediately in components/photos/detection-edit-panel.tsx
- [x] T036 [US2] Close panel after successful deletion in components/photos/detection-edit-panel.tsx
- [x] T037 [US2] Show toast confirmation on successful delete in components/photos/detection-edit-panel.tsx

**Checkpoint**: User Story 2 complete - operators can delete false positives with confirmation

---

## Phase 5: User Story 3 - Click Detection Card to Edit (Priority: P2)

**Goal**: Operators can click detection cards below photo to open the same edit panel

**Independent Test**: Click detection card → Same edit panel opens → Edit and save works

### Implementation for User Story 3

- [x] T038 [US3] Add onClick handler to DetectionCardWithFeedback in components/photos/detection-card-with-feedback.tsx
- [x] T039 [US3] Wire card click to open panel via Zustand store in components/photos/detection-card-with-feedback.tsx
- [x] T040 [US3] Add visual indication (highlight) on card when its panel is open in components/photos/detection-card-with-feedback.tsx
- [x] T041 [US3] Sync card highlight with bounding box hover state in components/photos/detection-card-with-feedback.tsx

**Checkpoint**: User Story 3 complete - both bounding box and card clicks open edit panel

---

## Phase 6: User Story 4 - Add Distinguishing Features (Priority: P2)

**Goal**: Operators can add/edit distinguishing features text to improve re-identification

**Independent Test**: Open panel → Edit distinguishing features field → Save → Refresh → Text persists

### Implementation for User Story 4

- [x] T042 [US4] Add character counter (max 500) to distinguishing features field in components/photos/detection-edit-panel.tsx
- [x] T043 [US4] Add placeholder text "Describe unique marks..." in components/photos/detection-edit-panel.tsx

**Checkpoint**: User Story 4 complete - distinguishing features can be added/edited

**Note**: The distinguishing_features textarea is already included in T018 with all other form fields.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Design system compliance, mobile responsiveness, edge cases

- [x] T044 [P] Apply TineSight design system colors to DetectionEditPanel (bg-slate, border-cream/20, text-cream) in components/photos/detection-edit-panel.tsx
- [x] T045 [P] Add responsive styling - full-width panel on mobile (sm:640px breakpoint), ensure 44x44px touch targets in components/photos/detection-edit-panel.tsx
- [x] T046 [P] Handle edge case: detection no longer exists on save (show error, close panel) in components/photos/detection-edit-panel.tsx
- [x] T047 [P] Add keyboard shortcut Escape to close panel in components/photos/detection-edit-panel.tsx
- [x] T048 Remove unused ROI-related components/imports (ROISelector, ROIControlPanel, etc.) and console.log debug statements from photo-detail-client.tsx and detection-overlay.tsx
- [x] T049 Run quickstart.md validation checklist to verify all success criteria

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational - Creates panel component
- **User Story 2 (Phase 4)**: Depends on US1 - Adds delete button to existing panel
- **User Story 3 (Phase 5)**: Depends on US1 - Opens existing panel from card click
- **User Story 4 (Phase 6)**: Depends on US1 - Enhances existing form field
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

```
Foundational
     │
     └──→ User Story 1 (P1) ──┬──→ User Story 2 (P1)
                              │
                              ├──→ User Story 3 (P2)
                              │
                              └──→ User Story 4 (P2)
```

- **User Story 1**: Can start after Foundational - Creates the panel component
- **User Story 2**: Depends on US1 - Adds delete functionality to existing panel
- **User Story 3**: Depends on US1 - Wires card click to open existing panel
- **User Story 4**: Depends on US1 - Adds enhancements to existing form field

### Parallel Opportunities

**Within Phase 1 (Setup):**
- T001 and T002 can run in parallel (different components)
- T003 can run parallel with T001/T002

**Within Phase 2 (Foundational):**
- T006, T007 can run parallel (different functions, same file but independent)
- T011, T012, T013, T014 are in same file but sequential (build on each other)
- T015, T016, T017 can run parallel (different hook functions)

**Across User Stories:**
- US2, US3, US4 can start simultaneously after US1 is complete
- Within each story, tasks are sequential (same files)

---

## Parallel Example: Foundational Phase

```bash
# Service functions can be written in parallel:
Task: "Add updateDetection() service function in lib/services/detections.ts"
Task: "Add softDeleteDetection() service function in lib/services/detections.ts"

# Hook functions can be written in parallel:
Task: "Create TanStack Query hook useDetection() in lib/hooks/use-detection.ts"
Task: "Create TanStack Query mutation useUpdateDetection() in lib/hooks/use-detection.ts"
Task: "Create TanStack Query mutation useDeleteDetection() in lib/hooks/use-detection.ts"
```

## Parallel Example: After US1 Completion

```bash
# US2, US3, US4 can start simultaneously after US1:

# Developer A - User Story 2:
Task: "Add Delete button to DetectionEditPanel"
Task: "Create DeleteConfirmationDialog component"

# Developer B - User Story 3:
Task: "Add onClick handler to DetectionCardWithFeedback"
Task: "Wire card click to open panel via Zustand store"

# Developer C - User Story 4:
Task: "Add character counter to distinguishing features field"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T017) - **CRITICAL**
3. Complete Phase 3: User Story 1 (T018-T030)
4. **STOP and VALIDATE**: Test edit flow end-to-end
5. Deploy/demo: Operators can correct AI misclassifications

### P1 Complete (Edit + Delete)

1. Complete MVP above
2. Complete Phase 4: User Story 2 (T031-T037)
3. **VALIDATE**: Test delete flow end-to-end
4. Both core features (edit + delete) now work

### Full Feature (All User Stories)

1. Complete P1 above
2. Complete Phase 5: User Story 3 (T038-T041)
3. Complete Phase 6: User Story 4 (T042-T043)
4. Complete Phase 7: Polish (T044-T049)
5. **FINAL VALIDATION**: Run quickstart.md checklist

---

## Notes

- [P] tasks = different files or independent functions, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 creates the panel component - all other user stories depend on it
- US2, US3, US4 can run in parallel after US1 is complete
- Commit after each task or logical group
- Test each user story independently before moving on
- Verify design system compliance (TineSight colors, spacing) in polish phase
- RBAC: Viewer role handled at API level (T014) and UI level (T030)
