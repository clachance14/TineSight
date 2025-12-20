# Tasks: Photo Confidence Filter

**Input**: Design documents from `/specs/004-photo-confidence-filter/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/filter-api.yaml, quickstart.md

**Tests**: E2E test required per Constitution (Integration Testing principle)

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US5)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add slider component dependency

- [X] T001 Add @radix-ui/react-slider via `npx shadcn@latest add slider` or manual install
- [X] T002 [P] Create slider component in components/ui/slider.tsx following shadcn/ui pattern with TineSight theme colors (Copper accent)

---

## Phase 2: Foundational (US1 - Core Filtering Logic)

**Purpose**: Backend filtering infrastructure that enables confidence filtering

**⚠️ CRITICAL**: User story UI work cannot begin until this phase is complete

**Goal**: Implement "any detection" logic - photo shown if ANY detection meets threshold

- [X] T003 [P] Add minConfidence field to PhotoFilters interface in components/photos/photo-filters.tsx (line 13-18)
- [X] T004 [P] Add minConfidence field to service PhotoFilters interface in lib/services/photos.ts (line 5-14)
- [X] T005 Implement confidence filtering in getPhotos() function in lib/services/photos.ts - use subquery pattern from qualityStatus (lines 53-112)
- [X] T006 Add minConfidence parameter parsing in app/api/photos/route.ts with validation (0-100 range)
- [X] T007 Add minConfidence to URL params in usePhotos hook in lib/hooks/use-photos.ts

**Checkpoint**: API should now filter photos by confidence when `?minConfidence=50` is passed

---

## Phase 3: User Story 1+2 - Core Filtering + Default View (Priority: P1) 🎯 MVP

**Goal**: Photos are filtered by default (hasDeer=true, minConfidence=50%) on page load

**Independent Test**: Navigate to /photos, verify only deer photos with ≥50% confidence appear

### Implementation for User Stories 1 & 2

- [X] T008 [US1+US2] Update default filter state in app/(dashboard)/photos/page.tsx: hasDeer=true, minConfidence=50 (line 21-26)
- [X] T009 [US1+US2] Add URL search params handling for shared links (useSearchParams) in app/(dashboard)/photos/page.tsx
- [X] T010 [US1+US2] Add minConfidence to serviceFilters conversion in app/(dashboard)/photos/page.tsx (line 155-161)

**Checkpoint**: Page loads with default filters applied. Photos filtered correctly.

---

## Phase 4: User Story 3 - Adjustable Confidence Threshold (Priority: P2)

**Goal**: User can adjust confidence threshold via slider (0-100%, 5% increments)

**Independent Test**: Adjust slider from 50% to 75%, verify photo list updates immediately

### Implementation for User Story 3

- [X] T011 [US3] Import Slider component in components/photos/photo-filters.tsx
- [X] T012 [US3] Add confidence threshold filter section with slider in components/photos/photo-filters.tsx (after Quality Status section ~line 161)
- [X] T013 [US3] Implement handleConfidenceChange handler in components/photos/photo-filters.tsx
- [X] T014 [US3] Add percentage display showing current threshold value

**Checkpoint**: Slider visible, adjustable, photos filter in real-time

---

## Phase 5: User Story 4 - Toggle Filter On/Off (Priority: P2)

**Goal**: User can toggle confidence filter without losing threshold setting

**Independent Test**: Set slider to 70%, toggle OFF (all photos show), toggle ON (70% filter restored)

### Implementation for User Story 4

- [X] T015 [US4] Add toggle button (On/Off) next to slider in components/photos/photo-filters.tsx
- [X] T016 [US4] Add lastConfidence state for threshold preservation in components/photos/photo-filters.tsx
- [X] T017 [US4] Implement handleConfidenceToggle handler (undefined=off, number=on)
- [X] T018 [US4] Update hasActiveFilters calculation to include minConfidence (line 26-30)
- [X] T019 [US4] Update getActiveFilterCount() to include minConfidence (line 54-61)
- [X] T020 [US4] Update clearFilters() to reset minConfidence to undefined (line 45-52)

**Checkpoint**: Toggle works, threshold preserved when toggling back on

---

## Phase 6: User Story 5 - Active Filter Visibility (Priority: P3)

**Goal**: User sees confidence filter chip showing "Confidence: >=X%" when active

**Independent Test**: Set confidence to 60%, verify chip shows "Confidence: >=60%" with remove button

### Implementation for User Story 5

- [X] T021 [US5] Add confidence chip to Active Filters Summary section in components/photos/photo-filters.tsx (~line 212)
- [X] T022 [US5] Implement chip remove button to disable confidence filter

**Checkpoint**: Chip displays correctly, clicking X removes filter

---

## Phase 7: Shareable URLs (FR-011, FR-012)

**Goal**: User can copy shareable URL with current filter settings encoded

**Independent Test**: Set filters, click "Copy link", open URL in new tab, verify filters restored

### Implementation for Shareable URLs

- [X] T023 Add "Copy link" button to filter panel in components/photos/photo-filters.tsx
- [X] T024 Implement copyFilterUrl function using URLSearchParams and navigator.clipboard

**Checkpoint**: Copy link works, shared URLs restore exact filter state

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Testing, edge cases, documentation

- [X] T025 Handle empty filtered results - display helpful message in components/photos/photo-grid.tsx
- [X] T026 Create E2E test for confidence filter in tests/e2e/photo-filters.spec.ts
- [X] T027 Verify slider styling matches TineSight design system (Copper accent color)
- [X] T028 Run quickstart.md verification checklist

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on T001, T002 - BLOCKS all user stories
- **US1+US2 (Phase 3)**: Depends on Foundational completion
- **US3-US5 (Phases 4-6)**: Can proceed sequentially after Phase 3
- **Shareable URLs (Phase 7)**: Can run in parallel with US3-US5
- **Polish (Phase 8)**: Depends on all user story phases

### User Story Dependencies

- **US1+US2 (P1)**: Can start after Foundational - Core MVP functionality
- **US3 (P2)**: Depends on US1+US2 - Slider UI
- **US4 (P2)**: Depends on US3 - Toggle requires slider to exist
- **US5 (P3)**: Can start after US1+US2 - Active filters display

### Within Each Phase

- T003, T004 can run in parallel (different files)
- T011-T014 must be sequential (same file, building on each other)
- T015-T020 must be sequential (same file)

### Parallel Opportunities

```text
Phase 1:
  T001 (install) → T002 (create slider)

Phase 2 (parallel):
  T003 (photo-filters types) ∥ T004 (service types)
  Then: T005 → T006 → T007 (sequential)

Phases 3-7 (sequential by story):
  Phase 3 → Phase 4 → Phase 5 → Phase 6
  Phase 7 can run in parallel with Phases 4-6
```

---

## Parallel Example: Foundational Phase

```bash
# Launch type updates in parallel:
Task: "Add minConfidence to PhotoFilters in components/photos/photo-filters.tsx"
Task: "Add minConfidence to PhotoFilters in lib/services/photos.ts"

# Then sequential service implementation:
Task: "Implement confidence filtering in getPhotos()"
Task: "Add minConfidence parsing in API route"
Task: "Add minConfidence to hook URL params"
```

---

## Implementation Strategy

### MVP First (User Stories 1+2 Only)

1. Complete Phase 1: Setup (slider component)
2. Complete Phase 2: Foundational (filtering infrastructure)
3. Complete Phase 3: US1+US2 (core filtering + defaults)
4. **STOP and VALIDATE**: Test that default filters work
5. Deploy/demo: Users see clean filtered view by default

### Full Feature Delivery

1. Setup + Foundational → Core filtering ready
2. US1+US2 → Default quality view working (MVP!)
3. US3 → Slider control added
4. US4 → Toggle on/off added
5. US5 → Filter chips complete
6. Shareable URLs → Copy link feature
7. Polish → E2E tests, edge cases

---

## Summary

| Phase | Tasks | User Story | Description |
|-------|-------|------------|-------------|
| 1 | T001-T002 | Setup | Slider component |
| 2 | T003-T007 | US1 (Foundational) | Core filtering logic |
| 3 | T008-T010 | US1+US2 (P1) | Default view + core |
| 4 | T011-T014 | US3 (P2) | Slider control |
| 5 | T015-T020 | US4 (P2) | Toggle on/off |
| 6 | T021-T022 | US5 (P3) | Active filter chips |
| 7 | T023-T024 | FR-011/012 | Shareable URLs |
| 8 | T025-T028 | Polish | Testing, edge cases |

**Total Tasks**: 28
**MVP Tasks**: T001-T010 (10 tasks)
**Parallel Opportunities**: T003∥T004, Phase 7 with Phases 4-6

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Each phase has a checkpoint to validate before proceeding
- Constitution requires E2E test (T026)
- Slider must use TineSight Copper accent color (T027)
