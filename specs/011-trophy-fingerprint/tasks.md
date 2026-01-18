# Tasks: Trophy Fingerprint

**Input**: Design documents from `/specs/011-trophy-fingerprint/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/trophy-api.yaml

**Tests**: Contract tests included per Constitution V. Integration verification via manual deer profile creation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database schema, types, and core infrastructure for trophy fingerprinting

- [X] T001 Create database migration for trophy fingerprint schema in supabase/migrations/039_trophy_fingerprint.sql
- [X] T002 [P] Create TypeScript interfaces for fingerprint types in types/fingerprint.ts
- [X] T003 [P] Add ANTLER_FINGERPRINT_PROMPT constant to lib/gemini/prompts.ts
- [X] T004 [P] Add antlerFingerprintSchema to lib/gemini/schemas.ts
- [X] T005 Add extractAntlerFingerprint() function to lib/gemini/client.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core fingerprint infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T006 Create fingerprint comparison algorithm in lib/fingerprint/compare.ts
- [X] T007 Create fingerprint service CRUD operations in lib/services/fingerprint.ts
- [X] T008 Create generate-fingerprint Trigger.dev job in trigger/jobs/generate-fingerprint.ts

**Checkpoint**: Foundation ready - contract tests can now be written

---

## Phase 2.5: Contract Tests (Constitution V Compliance)

**Purpose**: API contract tests for all new endpoints per Constitution V requirement

**Note**: These tests define expected API behavior and should be written before endpoint implementation

- [ ] T008a [P] Contract test for GET /api/trophy/dashboard in tests/contract/trophy-dashboard.test.ts
- [ ] T008b [P] Contract test for POST /api/trophy/batch-confirm in tests/contract/batch-confirm.test.ts
- [ ] T008c [P] Contract test for POST /api/trophy/batch-reject in tests/contract/batch-reject.test.ts
- [ ] T008d [P] Contract test for GET /api/deer/clusters in tests/contract/clusters-list.test.ts
- [ ] T008e [P] Contract test for PATCH /api/deer/clusters/[id] in tests/contract/cluster-update.test.ts
- [ ] T008f [P] Contract test for DELETE /api/deer/clusters/[id] in tests/contract/cluster-delete.test.ts
- [ ] T008g [P] Contract test for POST /api/deer/clusters/[id]/name in tests/contract/cluster-name.test.ts

**Checkpoint**: All API contracts defined - user story implementation can proceed

---

## Phase 3: User Story 1 - Trophy Buck Gets Scored and Fingerprinted (Priority: P1) MVP

**Goal**: When a photo is analyzed and a buck is classified as "trophy" tier, automatically generate B&C score and antler fingerprint.

**Independent Test**: Upload a trail cam photo of a trophy buck and verify fingerprint is generated with measurements.

### Implementation for User Story 1

- [ ] T009 [US1] Modify trigger/jobs/analyze-photo.ts to queue fingerprint generation for trophy bucks
- [ ] T010 [US1] Verify fingerprint extraction stores calibration, measurements, scores, ratios, and features
- [ ] T011 [US1] Add graceful degradation for AI service failures (retry logic, fallback to no fingerprint)

**Checkpoint**: Trophy detection now generates fingerprints automatically

---

## Phase 4: User Story 2 - Enhanced Matching with Fingerprints (Priority: P1) MVP

**Goal**: Include fingerprint data in deer comparisons and show measurements in match review.

**Independent Test**: Upload a photo of a previously cataloged buck and verify match shows measurement comparisons.

### Implementation for User Story 2

- [ ] T012 [US2] Modify trigger/jobs/compare-deer.ts to include fingerprint data in comparison
- [ ] T013 [US2] Update match candidate creation to store antler_print_similarity score
- [ ] T014 [P] [US2] Create measurement-comparison.tsx component in components/trophy/measurement-comparison.tsx
- [ ] T015 [US2] Modify components/deer/match-review-modal.tsx to show measurements alongside visual confidence
- [ ] T016 [US2] Add broken tine detection flag when ratio mismatch detected

**Checkpoint**: Match review now shows both visual and fingerprint similarity with measurements

---

## Phase 4.5: MVP Manual Verification (Constitution V - Integration Test)

**Purpose**: Verify MVP user journey via manual deer profile creation

**Manual Test Procedure**:
1. Upload a trail cam photo containing a trophy buck
2. Wait for analysis to complete (check Trigger.dev logs for `generate-fingerprint` job)
3. Verify fingerprint generated via SQL query from quickstart.md
4. Create a deer profile from the detection
5. Upload a second photo of the same buck
6. Verify match candidate appears with both visual confidence AND antler print similarity
7. Review match and confirm measurements display correctly

- [ ] T016a [US1+US2] Execute manual MVP verification procedure and document results

**Checkpoint**: MVP verified - fingerprint generation and enhanced matching work end-to-end

---

## Phase 5: User Story 3 - Post-Creation Scan (Priority: P2)

**Goal**: Scan unassigned trophy detections when a deer profile is created to find additional matches.

**Independent Test**: Upload 10 photos of the same buck, create deer from one, verify system suggests other 9.

### Implementation for User Story 3

- [ ] T017 [P] [US3] Create post-creation-scan Trigger.dev job in trigger/jobs/post-creation-scan.ts
- [ ] T018 [US3] Modify lib/services/deer.ts to trigger post-creation scan after deer creation
- [ ] T019 [US3] Create match candidates for detections with 85%+ similarity

**Checkpoint**: Deer creation now scans for additional matching detections

---

## Phase 6: User Story 4 - Auto-Clustering of Unassigned Detections (Priority: P2)

**Goal**: Cluster unassigned trophy detections by fingerprint similarity using Union-Find algorithm.

**Independent Test**: Upload 50 photos of 5 different bucks, verify system groups into ~5 clusters.

### Implementation for User Story 4

- [ ] T020 [P] [US4] Create Union-Find data structure in lib/clustering/union-find.ts
- [ ] T021 [P] [US4] Create cluster service in lib/services/clusters.ts
- [ ] T022 [US4] Create cluster-trophy-detections Trigger.dev job in trigger/jobs/cluster-trophy-detections.ts
- [ ] T023 [P] [US4] Create GET endpoint for clusters in app/api/deer/clusters/route.ts
- [ ] T024 [P] [US4] Create PATCH/DELETE endpoints for cluster in app/api/deer/clusters/[id]/route.ts
- [ ] T025 [US4] Create POST endpoint to name cluster in app/api/deer/clusters/[id]/name/route.ts
- [ ] T026 [US4] Implement cluster merge, split, and dismiss operations in lib/services/clusters.ts

**Checkpoint**: Trophy detections are now auto-clustered by fingerprint similarity

---

## Phase 7: User Story 5 - Trophy Bucks Dashboard (Priority: P2)

**Goal**: Dedicated dashboard showing trophy detections by status: assigned, pending, clusters, unclustered.

**Independent Test**: Access dashboard and verify all trophy detections are correctly categorized.

### Implementation for User Story 5

- [ ] T027 [P] [US5] Create trophy service for dashboard data in lib/services/trophy.ts
- [ ] T028 [P] [US5] Create dashboard API endpoint in app/api/trophy/dashboard/route.ts
- [ ] T029 [P] [US5] Create summary-stats.tsx component in components/trophy/summary-stats.tsx
- [ ] T030 [P] [US5] Create pending-matches-section.tsx in components/trophy/pending-matches-section.tsx
- [ ] T031 [P] [US5] Create clusters-section.tsx in components/trophy/clusters-section.tsx
- [ ] T032 [P] [US5] Create cluster-card.tsx in components/trophy/cluster-card.tsx
- [ ] T033 [US5] Create trophy-dashboard.tsx main component in components/trophy/trophy-dashboard.tsx
- [ ] T034 [US5] Create trophy dashboard page in app/(dashboard)/trophy/page.tsx

**Checkpoint**: Trophy dashboard is functional with all sections

---

## Phase 8: User Story 6 - Deer Profile Antler Print Display (Priority: P2)

**Goal**: Display antler print data on deer profile page including score class, measurements, ratios, and features.

**Independent Test**: View a deer profile with fingerprint and verify all measurement data displays.

### Implementation for User Story 6

- [ ] T035 [P] [US6] Create antler-print-card.tsx component in components/deer/antler-print-card.tsx
- [ ] T036 [US6] Integrate antler-print-card into deer profile page

**Checkpoint**: Deer profiles now show antler print data when available

---

## Phase 9: User Story 7 - Batch Match Operations (Priority: P3)

**Goal**: Confirm or reject multiple match candidates at once.

**Independent Test**: Accumulate 10 pending matches for one deer, use batch confirm to accept all.

### Implementation for User Story 7

- [ ] T037 [P] [US7] Create batch-selection Zustand store in lib/stores/batch-selection.ts
- [ ] T038 [P] [US7] Create batch-confirm API endpoint in app/api/trophy/batch-confirm/route.ts
- [ ] T039 [P] [US7] Create batch-reject API endpoint in app/api/trophy/batch-reject/route.ts
- [ ] T040 [US7] Create batch-match-actions.tsx component in components/trophy/batch-match-actions.tsx
- [ ] T041 [US7] Integrate batch actions into pending-matches-section.tsx

**Checkpoint**: Users can batch confirm/reject matches

---

## Phase 10: User Story 8 - Named Buck Gets Fingerprinted (Priority: P3)

**Goal**: Generate fingerprint when user names any buck (not just trophy-tier) if one doesn't exist.

**Independent Test**: Name a "standard" tier buck and verify fingerprint is generated.

### Implementation for User Story 8

- [ ] T042 [US8] Modify deer creation flow to queue fingerprint generation for non-trophy bucks
- [ ] T043 [US8] Update generate-fingerprint job to handle deer reference photos

**Checkpoint**: All named bucks get fingerprints

---

## Phase 11: User Story 9 - Fingerprint Regeneration (Priority: P3)

**Goal**: Regenerate fingerprint when user changes the reference photo for a named deer.

**Independent Test**: Change a deer's reference photo and verify new fingerprint replaces old one.

### Implementation for User Story 9

- [ ] T044 [US9] Modify deer update flow to detect reference photo changes
- [ ] T045 [US9] Clear old fingerprint and queue regeneration when reference changes

**Checkpoint**: Reference photo changes trigger fingerprint regeneration

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and validation

- [ ] T046 Run quickstart.md validation to verify all features work end-to-end
- [ ] T047 Verify RLS policies work correctly for trophy_clusters and trophy_cluster_members
- [ ] T048 Verify dashboard loads in <3s for 1000+ detections (performance goal)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001-T005) - BLOCKS all user stories
- **Contract Tests (Phase 2.5)**: Depends on Foundational - defines API contracts before implementation
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User Story 1 & 2 (P1): Must complete for MVP
  - User Story 3-6 (P2): Can proceed in parallel after foundation
  - User Story 7-9 (P3): Can proceed in parallel after foundation
- **MVP Verification (Phase 4.5)**: Depends on US1+US2 - manual integration test
- **Polish (Phase 12)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Foundation only - No dependencies on other stories
- **User Story 2 (P1)**: Depends on US1 (needs fingerprints to compare)
- **User Story 3 (P2)**: Foundation only - Uses fingerprint comparison from T006
- **User Story 4 (P2)**: Foundation only - Uses fingerprint comparison from T006
- **User Story 5 (P2)**: Depends on US3, US4 (dashboard shows clusters and pending matches)
- **User Story 6 (P2)**: Foundation only - Just displays fingerprint data
- **User Story 7 (P3)**: Depends on US5 (batch actions in dashboard)
- **User Story 8 (P3)**: Depends on US1 (uses same fingerprint generation)
- **User Story 9 (P3)**: Depends on US1 (uses same fingerprint generation)

### Within Each User Story

- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel (T002, T003, T004)
- All Contract Tests can run in parallel (T008a-T008g)
- US2 implementation: T014 can run in parallel with T012-T013
- US4 implementation: T020, T021, T023, T024 can run in parallel
- US5 implementation: T027-T032 can all run in parallel
- US7 implementation: T037, T038, T039 can run in parallel
- US6, US3, US4 can be worked on in parallel (all depend only on foundation)

---

## Parallel Example: User Story 5 (Trophy Dashboard)

```bash
# Launch all parallel components together:
Task: "Create trophy service for dashboard data in lib/services/trophy.ts"
Task: "Create dashboard API endpoint in app/api/trophy/dashboard/route.ts"
Task: "Create summary-stats.tsx component in components/trophy/summary-stats.tsx"
Task: "Create pending-matches-section.tsx in components/trophy/pending-matches-section.tsx"
Task: "Create clusters-section.tsx in components/trophy/clusters-section.tsx"
Task: "Create cluster-card.tsx in components/trophy/cluster-card.tsx"

# Then compose the main dashboard:
Task: "Create trophy-dashboard.tsx main component"
Task: "Create trophy dashboard page"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (T001-T005)
2. Complete Phase 2: Foundational (T006-T008)
3. Complete Phase 2.5: Contract Tests (T008a-T008g) - can run in parallel
4. Complete Phase 3: User Story 1 (T009-T011)
5. Complete Phase 4: User Story 2 (T012-T016)
6. Complete Phase 4.5: MVP Manual Verification (T016a) - create deer profile, verify matching
7. **STOP and VALIDATE**: All contract tests passing, manual verification documented
8. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational + Contract Tests -> Foundation ready
2. Add US1 + US2 + Manual Verification -> MVP with fingerprint generation and enhanced matching
3. Add US3 + US4 -> Clustering and post-creation scan
4. Add US5 + US6 -> Trophy dashboard and deer profile display
5. Add US7 + US8 + US9 -> Batch operations and lifecycle management

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 -> User Story 2 (MVP path)
   - Developer B: User Story 4 (clustering) -> User Story 3 (post-creation)
   - Developer C: User Story 5 (dashboard) + User Story 6 (profile display)
3. P3 stories can be parallelized similarly

---

## Summary

| Metric | Count |
|--------|-------|
| **Total Tasks** | 56 |
| Setup | 5 |
| Foundational | 3 |
| Contract Tests | 7 |
| User Story 1 (P1) | 3 |
| User Story 2 (P1) | 5 |
| MVP Verification | 1 |
| User Story 3 (P2) | 3 |
| User Story 4 (P2) | 7 |
| User Story 5 (P2) | 8 |
| User Story 6 (P2) | 2 |
| User Story 7 (P3) | 5 |
| User Story 8 (P3) | 2 |
| User Story 9 (P3) | 2 |
| Polish | 3 |
| **Parallel Opportunities** | 29 tasks marked [P] |
| **MVP Scope** | US1 + US2 + verification (24 tasks: T001-T016a) |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- MVP = US1 + US2 (fingerprint generation + enhanced matching)
