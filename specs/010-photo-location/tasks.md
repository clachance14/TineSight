# Tasks: Photo Location

**Input**: Design documents from `/specs/010-photo-location/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Integration tests included per Constitution Principle V requirement.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- Include exact file paths in descriptions

## Path Conventions

- **Web app (Next.js)**: `app/`, `components/`, `lib/` at repository root
- **Database**: `supabase/migrations/`
- **Tests**: `tests/e2e/`, `tests/integration/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and configure environment for Mapbox integration

- [X] T001 [P] Install react-map-gl and mapbox-gl dependencies via `npm install react-map-gl mapbox-gl`
- [X] T002 [P] Install TypeScript types via `npm install -D @types/mapbox-gl`
- [X] T003 [P] Add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to `.env.example`
- [X] T004 Create database migration in `supabase/migrations/027_batch_location.sql` (updated: 027 not 025)
- [X] T005 Run migration with `npx supabase db push`
- [X] T006 Regenerate TypeScript types with `npx supabase gen types typescript --linked > types/database.ts`
- [X] T007 Verify setup with `npm run type-check`

**Checkpoint**: Dependencies installed, database schema updated, types regenerated

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core state management and service updates that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T008 Add LocationData interface to `lib/stores/upload.ts`
- [X] T009 Add pendingLocation and showLocationPicker state to UploadState interface in `lib/stores/upload.ts`
- [X] T010 Add setPendingLocation and setShowLocationPicker actions to upload store in `lib/stores/upload.ts`
- [X] T011 Update createBatch function signature to accept location data in `lib/services/batches.ts`
- [X] T012 Update UploadInitiationRequest interface to include location fields in `app/api/photos/upload/route.ts`
- [X] T013 Update createBatch call to pass location data in `app/api/photos/upload/route.ts`

**Checkpoint**: Foundation ready - location state and API updates in place, user story implementation can begin

---

## Phase 3: User Story 1 - Set Location During Upload (Priority: P1) 🎯 MVP

**Goal**: Allow users to specify photo location on a map before upload begins

**Independent Test**: Upload photos, set pin location on map, enter area name, confirm, verify location data saved with batch

### Implementation for User Story 1

- [X] T014 [US1] Create location picker modal component in `components/photos/location-picker-modal.tsx`
- [X] T015 [US1] Implement Map component with satellite/topo toggle in `components/photos/location-picker-modal.tsx`
- [X] T016 [US1] Implement pin placement on map click in `components/photos/location-picker-modal.tsx`
- [X] T017 [US1] Implement area name input with autocomplete from existing areas and validation (require both pin placement AND area name before enabling Confirm button) in `components/photos/location-picker-modal.tsx`
- [X] T018 [US1] Implement coordinate display when pin is placed in `components/photos/location-picker-modal.tsx`
- [X] T019 [US1] Add onFilesReady prop to PhotoUploader interface in `components/photos/photo-uploader.tsx`
- [X] T020 [US1] Call onFilesReady callback after file processing in `components/photos/photo-uploader.tsx`
- [X] T021 [US1] Import LocationPickerModal in `app/(dashboard)/upload/page.tsx`
- [X] T022 [US1] Add handleFilesReady callback to trigger location picker in `app/(dashboard)/upload/page.tsx`
- [X] T023 [US1] Add handleLocationConfirm callback to store location in `app/(dashboard)/upload/page.tsx`
- [X] T024 [US1] Integrate LocationPickerModal component in `app/(dashboard)/upload/page.tsx`
- [X] T025 [US1] Update handleStartUpload to include pendingLocation in API request in `app/(dashboard)/upload/page.tsx`

**Checkpoint**: User Story 1 complete - can upload photos with location data

---

## Phase 4: User Story 2 - Skip Location Setting (Priority: P1)

**Goal**: Allow users to skip location tagging and proceed directly to upload

**Independent Test**: Upload photos, click "Skip" in location picker, verify upload proceeds with null location values

### Implementation for User Story 2

- [X] T026 [US2] Implement Skip button in location picker modal in `components/photos/location-picker-modal.tsx`
- [X] T027 [US2] Implement handleSkip callback in location picker in `components/photos/location-picker-modal.tsx`
- [X] T028 [US2] Handle modal close on outside click (same as skip) in `components/photos/location-picker-modal.tsx`
- [X] T029 [US2] Add handleLocationSkip callback in `app/(dashboard)/upload/page.tsx`
- [X] T030 [US2] Ensure upload proceeds when pendingLocation is null in `app/(dashboard)/upload/page.tsx`

**Checkpoint**: User Stories 1 AND 2 complete - can upload with or without location

---

## Phase 5: User Story 3 - Filter Photos by Area (Priority: P2)

**Goal**: Allow users to filter their photo library by area name

**Independent Test**: Navigate to photos page, select area from dropdown, verify only photos from matching batches displayed

### Implementation for User Story 3

- [X] T031 [P] [US3] Add getDistinctAreaNames function to `lib/services/batches.ts`
- [X] T032 [P] [US3] Create areas API endpoint in `app/api/photos/areas/route.ts`
- [X] T033 [P] [US3] Create useAreas hook in `lib/hooks/use-areas.ts`
- [X] T034 [US3] Add areaName to PhotoFilters interface in `lib/services/photos.ts`
- [X] T035 [US3] Implement area filter logic in getPhotos function in `lib/services/photos.ts`
- [X] T036 [US3] Handle "__no_area__" special filter value in `lib/services/photos.ts`
- [X] T037 [US3] Add areaName to PhotoFilters interface in `components/photos/photo-filters.tsx`
- [X] T038 [US3] Update hasActiveFilters check to include areaName in `components/photos/photo-filters.tsx`
- [X] T039 [US3] Add areaList prop to PhotoFiltersProps in `components/photos/photo-filters.tsx`
- [X] T040 [US3] Add Area dropdown with All/No Area/named areas options in `components/photos/photo-filters.tsx` (render only when areaList is non-empty per FR-013)
- [X] T041 [US3] Import useAreas hook in `app/(dashboard)/photos/page.tsx`
- [X] T042 [US3] Pass areaList to PhotoFilters component in `app/(dashboard)/photos/page.tsx`
- [X] T043 [US3] Invalidate areas query on successful upload with location in `app/(dashboard)/upload/page.tsx`

**Checkpoint**: User Stories 1, 2, AND 3 complete - can upload and filter by area

---

## Phase 6: User Story 4 - Set Camera Direction (Priority: P3)

**Goal**: Allow users to optionally specify compass direction when setting location

**Independent Test**: Set location with compass direction selected, verify direction saved with batch

### Implementation for User Story 4

- [X] T044 [US4] Add COMPASS_DIRECTIONS constant array in `components/photos/location-picker-modal.tsx`
- [X] T045 [US4] Add directionCompass state to location picker in `components/photos/location-picker-modal.tsx`
- [X] T046 [US4] Implement 8-button compass direction selector UI in `components/photos/location-picker-modal.tsx`
- [X] T047 [US4] Implement toggle behavior (click again to deselect) in `components/photos/location-picker-modal.tsx`
- [X] T048 [US4] Include directionCompass in onConfirm callback in `components/photos/location-picker-modal.tsx`

**Checkpoint**: User Stories 1-4 complete - direction selection working

---

## Phase 7: User Story 5 - Add Direction Notes (Priority: P3)

**Goal**: Allow users to optionally add free-text notes about camera direction

**Independent Test**: Set location with direction notes entered, verify notes saved with batch

### Implementation for User Story 5

- [X] T049 [US5] Add directionNotes state to location picker in `components/photos/location-picker-modal.tsx`
- [X] T050 [US5] Add Textarea for direction notes in `components/photos/location-picker-modal.tsx`
- [X] T051 [US5] Include directionNotes in onConfirm callback in `components/photos/location-picker-modal.tsx`

**Checkpoint**: All user stories (1-5) complete

---

## Phase 8: Integration Tests & Polish

**Purpose**: Verify complete feature and cross-cutting improvements

### Integration Tests (Constitution Principle V)

- [ ] T052 [P] Create E2E test for upload with location flow in `tests/e2e/photo-location.spec.ts`
- [ ] T053 [P] Create E2E test for skip location flow in `tests/e2e/photo-location.spec.ts`
- [ ] T054 [P] Create integration test for area filter in `tests/integration/area-filter.test.ts`

### Polish

- [ ] T055 Run quickstart.md manual validation checklist
- [X] T056 Verify type-check passes with `npm run type-check`
- [X] T057 Verify lint passes with `npm run lint`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - US1 & US2 are both P1 priority and share the same modal component
  - US3 (P2) depends on US1/US2 for location data to filter
  - US4 & US5 (P3) extend the modal from US1
- **Tests & Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - Core modal implementation
- **User Story 2 (P1)**: Can be implemented alongside US1 - Same modal, skip flow
- **User Story 3 (P2)**: Can start after Foundational - Independent filtering work
- **User Story 4 (P3)**: Extends US1 modal - Compass direction
- **User Story 5 (P3)**: Extends US1 modal - Direction notes

### Within Each User Story

- Models/services before UI components
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- T001, T002, T003 can run in parallel (different files/commands)
- T031, T032, T033 can run in parallel (independent new files)
- T052, T053, T054 can run in parallel (different test files)
- US1/US2 can be developed together (same modal)
- US3 filtering can be developed in parallel with US1/US2 modal work

---

## Parallel Example: Setup Phase

```bash
# Launch setup tasks in parallel:
Task: "Install react-map-gl and mapbox-gl dependencies"
Task: "Install TypeScript types"
Task: "Add NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN to .env.example"
```

## Parallel Example: User Story 3 Initial Tasks

```bash
# Launch independent US3 tasks in parallel:
Task: "Add getDistinctAreaNames function to lib/services/batches.ts"
Task: "Create areas API endpoint in app/api/photos/areas/route.ts"
Task: "Create useAreas hook in lib/hooks/use-areas.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (set location)
4. Complete Phase 4: User Story 2 (skip location)
5. **STOP and VALIDATE**: Test upload flows with and without location
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add US1 + US2 → Test upload flows → Deploy/Demo (MVP!)
3. Add US3 → Test area filtering → Deploy/Demo
4. Add US4 + US5 → Test direction features → Deploy/Demo
5. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US2 share the same modal - implement together
- US4 and US5 are P3 enhancements that extend the modal
- Constitution requires integration tests (Principle V)
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
