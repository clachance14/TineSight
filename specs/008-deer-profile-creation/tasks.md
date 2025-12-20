# Tasks: Deer Profile Creation

**Input**: Design documents from `/specs/008-deer-profile-creation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/deer-api.yaml

**Tests**: Integration test included (per plan.md Task H and Constitution Principle V)

**Organization**: Tasks grouped by user story for independent implementation and testing

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Paths are relative to repository root

---

## Phase 1: Setup

**Purpose**: No project initialization needed - this is an existing Next.js project

No setup tasks required - project already initialized.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Fix schema mismatch that BLOCKS all user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T001 Replace `account_id` with `user_id` in Deer interface in `lib/services/deer.ts` (line ~5)
- [X] T002 Fix `createDeer()` insert to use `user_id` instead of `account_id` in `lib/services/deer.ts` (line ~78)
- [X] T003 Fix `getDeerCatalog()` filter to use `user_id` instead of `account_id` in `lib/services/deer.ts` (line ~114)
- [X] T004 Fix `getDeerById()` filter to use `user_id` instead of `account_id` in `lib/services/deer.ts` (line ~150)
- [X] T005 Fix `deleteDeer()` filter to use `user_id` instead of `account_id` in `lib/services/deer.ts` (line ~232)
- [X] T006 Verify deer catalog page loads without errors at `http://localhost:3000/deer`
- [X] T006a Verify RLS: Attempt to access another user's deer via direct URL → expect "Deer not found" error

**Checkpoint**: Schema alignment complete - user story implementation can now begin

---

## Phase 3: User Story 1 - Create Deer Profile from Detection (Priority: P1) 🎯 MVP

**Goal**: Enable users to create a deer profile by selecting an unassigned buck detection and providing a name

**Independent Test**: Upload photo with buck detection → select detection → click "Create Deer Profile" → enter name → verify profile created

### Implementation for User Story 1

- [X] T007 [US1] Add `useState` for `createModalOpen` state in `components/photos/detection-edit-panel.tsx`
- [X] T008 [US1] Import `CreateDeerModal` component in `components/photos/detection-edit-panel.tsx`
- [X] T009 [US1] Import `useRouter` from `next/navigation` in `components/photos/detection-edit-panel.tsx`
- [X] T010 [US1] Add conditional "Create Deer Profile" button for unlinked buck detections in `components/photos/detection-edit-panel.tsx`
- [X] T011 [US1] Add `CreateDeerModal` with `onSuccess` handler that navigates to `/deer/[id]` in `components/photos/detection-edit-panel.tsx`
- [ ] T012 [US1] Test: Select buck detection → verify "Create Deer Profile" button appears
- [ ] T013 [US1] Test: Select non-buck detection → verify button does NOT appear
- [ ] T014 [US1] Test: Select already-linked detection → verify button does NOT appear
- [ ] T015 [US1] Test: Click button → modal opens → enter name → submit → redirects to deer detail page

**Checkpoint**: User Story 1 complete - users can create deer profiles from detections

---

## Phase 4: User Story 2 - View Deer Profile Detail Page (Priority: P1)

**Goal**: Provide a dedicated deer detail page displaying profile info and paginated sightings grid

**Independent Test**: Navigate to `/deer/[id]` → verify name, notes, reference image, and sightings grid displayed

### Implementation for User Story 2

- [X] T016 [P] [US2] Create server component at `app/(dashboard)/deer/[id]/page.tsx` with auth check and data fetch
- [X] T017 [P] [US2] Create sightings grid component at `components/deer/sightings-grid.tsx` with pagination props
- [X] T018 [US2] Create client component at `app/(dashboard)/deer/[id]/deer-detail-client.tsx` with layout structure
- [X] T019 [US2] Implement header section with back button and deer name in `app/(dashboard)/deer/[id]/deer-detail-client.tsx`
- [X] T020 [US2] Implement main section (2/3 width) with reference detection image in `app/(dashboard)/deer/[id]/deer-detail-client.tsx`
- [X] T021 [US2] Display deer notes below reference image in `app/(dashboard)/deer/[id]/deer-detail-client.tsx`
- [X] T022 [US2] Implement sidebar (1/3 width) with sightings grid in `app/(dashboard)/deer/[id]/deer-detail-client.tsx`
- [X] T023 [US2] Add pagination controls (prev/next buttons, page indicator) to `components/deer/sightings-grid.tsx`
- [X] T024 [US2] Add empty state message when no additional sightings in `components/deer/sightings-grid.tsx`
- [X] T024a [US2] Add fallback placeholder image when reference detection thumbnail is unavailable in `app/(dashboard)/deer/[id]/deer-detail-client.tsx`
- [X] T025 [US2] Add click handler on sighting thumbnails to navigate to `/photos/[imageId]` in `components/deer/sightings-grid.tsx`
- [X] T026 [US2] Update GET handler to accept `page` and `pageSize` query params in `app/api/deer/[id]/route.ts`
- [X] T027 [US2] Return pagination metadata `{ page, pageSize, total, totalPages }` in `app/api/deer/[id]/route.ts`
- [X] T028 [US2] Update `useDeer` hook to accept pagination params in `lib/hooks/use-deer.ts`
- [X] T029 [US2] Include pagination in query key for cache invalidation in `lib/hooks/use-deer.ts`
- [ ] T030 [US2] Test: Navigate to deer detail page → verify name and reference image displayed
- [ ] T031 [US2] Test: Deer with sightings → verify grid shows thumbnails with dates
- [ ] T032 [US2] Test: Click sighting thumbnail → navigates to source photo
- [ ] T033 [US2] Test: Deer with >20 sightings → verify pagination controls work

**Checkpoint**: User Story 2 complete - users can view deer profiles with sightings

---

## Phase 5: User Story 3 - Edit Deer Profile Information (Priority: P2)

**Goal**: Allow users to update the name and notes of an existing deer profile

**Independent Test**: Navigate to deer detail → click edit → modify name/notes → save → verify changes persist

### Implementation for User Story 3

- [X] T034 [US3] Add `useState` for edit mode (`isEditing`) in `app/(dashboard)/deer/[id]/deer-detail-client.tsx`
- [X] T035 [US3] Add edit button/icon next to deer name in `app/(dashboard)/deer/[id]/deer-detail-client.tsx`
- [X] T036 [US3] Implement inline edit form for name (text input) in `app/(dashboard)/deer/[id]/deer-detail-client.tsx`
- [X] T037 [US3] Implement inline edit form for notes (textarea) in `app/(dashboard)/deer/[id]/deer-detail-client.tsx`
- [X] T038 [US3] Add validation for non-empty name with error message in `app/(dashboard)/deer/[id]/deer-detail-client.tsx`
- [X] T039 [US3] Add save/cancel buttons in edit mode in `app/(dashboard)/deer/[id]/deer-detail-client.tsx`
- [X] T040 [US3] Call `useUpdateDeer` mutation on save in `app/(dashboard)/deer/[id]/deer-detail-client.tsx`
- [X] T041 [US3] Exit edit mode and show success toast on successful save in `app/(dashboard)/deer/[id]/deer-detail-client.tsx`
- [ ] T042 [US3] Test: Click edit → change name → save → verify name updated
- [ ] T043 [US3] Test: Click edit → clear name → save → verify error shown
- [ ] T044 [US3] Test: Click edit → modify notes → save → verify notes updated

**Checkpoint**: User Story 3 complete - users can edit deer profile information

---

## Phase 6: User Story 4 - Navigate from Deer Catalog to Deer Detail (Priority: P2)

**Goal**: Allow users to click on deer cards in the catalog to navigate to detail pages

**Independent Test**: Navigate to deer catalog → click deer card → verify navigation to detail page

### Implementation for User Story 4

- [X] T045 [US4] Import `Link` from `next/link` in `components/deer/deer-catalog.tsx` (if not already)
- [X] T046 [US4] Wrap deer card content in `<Link href={`/deer/${d.id}`}>` in `components/deer/deer-catalog.tsx`
- [X] T047 [US4] Ensure proper hover styles indicate clickability in `components/deer/deer-catalog.tsx`
- [X] T048 [US4] Test: Click deer card in catalog → navigates to correct deer detail page

**Checkpoint**: User Story 4 complete - catalog navigation works

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Integration test and final verification

- [ ] T049 Create integration test file at `tests/e2e/deer-profile-creation.spec.ts`
- [ ] T050 Implement test: Upload photo with buck detection
- [ ] T051 Implement test: Open detection panel and verify "Create Deer Profile" button
- [ ] T052 Implement test: Click button, enter name in modal, submit
- [ ] T053 Implement test: Verify redirect to deer detail page
- [ ] T054 Implement test: Verify deer name and reference image displayed
- [X] T055 Run `npm run type-check` and fix any TypeScript errors
- [X] T056 Run `npm run lint` and fix any linting errors
- [ ] T057 Verify all acceptance scenarios from spec.md manually

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: N/A - no setup needed
- **Foundational (Phase 2)**: BLOCKS all user stories - must complete T001-T006 first
- **User Stories (Phase 3-6)**: All depend on Foundational completion
  - US1 and US2 can proceed in parallel (different files)
  - US3 depends on US2 (uses deer detail page)
  - US4 is independent of other stories
- **Polish (Phase 7)**: Depends on US1 and US2 completion minimum

### User Story Dependencies

- **US1 (Create Profile)**: No dependencies on other stories - can start after Phase 2
- **US2 (View Detail Page)**: No dependencies on other stories - can start after Phase 2
- **US3 (Edit Profile)**: Depends on US2 (needs detail page to exist)
- **US4 (Catalog Navigation)**: No dependencies on other stories - can start after Phase 2

### Within Each User Story

- Implementation tasks are ordered sequentially within each story
- Tasks marked [P] can run in parallel with other [P] tasks in the same phase

### Parallel Opportunities

**After Phase 2 completes:**
```
Developer A: US1 (T007-T015) - detection panel CTA
Developer B: US2 (T016-T033) - deer detail page
```

**Within Phase 4 (US2):**
```
Parallel: T016 (server component) + T017 (sightings grid)
Sequential: T018-T029 (depend on T016/T017)
```

---

## Parallel Example: User Story 2

```bash
# Launch parallel tasks after Phase 2:
Task: "Create server component at app/(dashboard)/deer/[id]/page.tsx"
Task: "Create sightings grid component at components/deer/sightings-grid.tsx"

# Then sequential implementation:
Task: "Create client component at app/(dashboard)/deer/[id]/deer-detail-client.tsx"
# ... remaining tasks depend on prior ones
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 2: Foundational (T001-T006) - **CRITICAL BLOCKER**
2. Complete Phase 3: US1 - Create deer profile (T007-T015)
3. Complete Phase 4: US2 - View deer detail page (T016-T033)
4. **STOP and VALIDATE**: Test create → view flow end-to-end
5. Deploy/demo if ready - core feature is usable

### Incremental Delivery

1. Phase 2 complete → Schema fixed, existing pages work
2. Add US1 → Test create flow → Deploy (partial MVP)
3. Add US2 → Test view flow → Deploy (complete MVP!)
4. Add US3 → Test edit flow → Deploy (enhanced)
5. Add US4 → Test navigation → Deploy (polished)

### Parallel Team Strategy

With two developers:

1. Both complete Phase 2 together
2. Once Phase 2 done:
   - Developer A: US1 (detection panel CTA)
   - Developer B: US2 (deer detail page)
3. When US2 done:
   - Developer A: US3 (edit functionality)
   - Developer B: US4 (catalog navigation)

---

## Notes

- [P] tasks = different files, no dependencies within same phase
- [Story] label maps task to user story for traceability
- US1 + US2 together = minimum viable feature (create + view)
- US3 + US4 = enhancements for better UX
- Integration test (Phase 7) validates complete flow
- Commit after each task or logical group
