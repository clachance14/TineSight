# Tasks: Gemini Deer Analysis Pipeline

**Input**: Design documents from `/specs/005-gemini-deer-pipeline/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested - test tasks omitted

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and dependency installation

- [X] T001 Install Gemini SDK dependencies: `npm install @google/genai zod zod-to-json-schema`
- [X] T002 Add GEMINI_API_KEY to .env.local and .env.example
- [X] T003 [P] Create types/gemini.ts with PhotoAnalysis, DeerDetection, MatchComparison interfaces

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema and Gemini client that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Create database migration supabase/migrations/008_gemini_analysis.sql with all schema changes
- [X] T005 Run migration: `npx supabase db push`
- [X] T006 Regenerate types: `npx supabase gen types typescript --linked > types/database.ts`
- [X] T007 [P] Create lib/gemini/client.ts with GoogleGenAI wrapper and analyzePhoto function
- [X] T008 [P] Create lib/gemini/types.ts with Zod schemas (analysisSchema, comparisonSchema)
- [X] T009 [P] Create lib/gemini/prompts.ts with analysis and comparison prompt templates (handle edge case: instruct Gemini to return partial bbox if head is cropped at frame edge)

**Checkpoint**: Foundation ready - Gemini client can analyze images, database schema supports new fields

---

## Phase 3: User Story 1 - Bulk Photo Analysis (Priority: P1) MVP

**Goal**: Upload trail camera photos and have AI automatically analyze each one, identifying deer and extracting species/sex/points/age

**Independent Test**: Upload 10 photos (mix of deer, empty, wildlife). Verify each photo receives analysis results including deer presence, species, sex, and point count where applicable.

### Implementation for User Story 1

- [X] T010 [P] [US1] Create trigger/jobs/analyze-photo.ts with Gemini vision analysis job (must extract head_bbox, gemini_confidence, species, sex, antler_points, age_class, distinguishing_features per schema)
- [X] T011 [US1] Update trigger/jobs/batch-process.ts to trigger analyze-photo instead of detect-animals
- [X] T012 [US1] Update lib/services/photos.ts with updateImageAnalysis function to store image-level results (has_deer, deer_count, analysis_notes, analyzed_at)
- [X] T013 [US1] Update lib/services/detections.ts with createGeminiDetection function for detection-level fields (species, sex, antler_points, head_bbox, gemini_confidence)
- [X] T014 [US1] Add error handling in analyze-photo.ts for Gemini API errors (rate limits, invalid images)
- [X] T015 [US1] Update app/api/photos/upload/route.ts to trigger batch processing with new job

**Checkpoint**: User Story 1 complete - photos analyzed by Gemini, detections created with species/sex/points

---

## Phase 4: User Story 2 - Triage Dashboard (Priority: P2)

**Goal**: Filter and sort through analysis results to find trophy bucks worth cataloging

**Independent Test**: After analyzing 100 photos, filter to show only bucks with 10+ points. Verify filtered list shows only matching detections.

### Implementation for User Story 2

- [X] T016 [P] [US2] Update app/api/photos/route.ts with sex, min_points, max_points, has_deer query params
- [X] T017 [P] [US2] Create app/api/photos/stats/route.ts returning BatchStats per contracts/photos-api.yaml
- [X] T018 [P] [US2] Create app/api/photos/archive/route.ts for bulk archiving empty photos
- [X] T018b [P] [US2] Create app/api/photos/[id]/retry/route.ts for requeuing failed photo analysis per contracts/photos-api.yaml
- [X] T019 [US2] Update lib/services/photos.ts with getPhotosWithFilters, getBatchStats, and retryPhotoAnalysis functions
- [X] T020 [P] [US2] Create components/photos/triage-dashboard.tsx showing batch summary stats
- [X] T021 [P] [US2] Create components/photos/buck-grid.tsx displaying head crops in grid layout
- [X] T022 [US2] Update components/photos/photo-filters.tsx with point filter buttons (All, 10+, 8-9, 6-7, <6)
- [X] T023 [US2] Update components/photos/photo-grid.tsx to display new detection fields (species, sex, points)
- [X] T024 [US2] Add archive empty photos button to triage-dashboard.tsx calling archive endpoint

**Checkpoint**: User Story 2 complete - users can filter by points, view stats, archive empty photos

---

## Phase 5: User Story 3 - Buck Catalog Building (Priority: P3)

**Goal**: Create named profiles for trophy bucks by selecting a detection and assigning a name

**Independent Test**: Select a buck detection, click "Name Deer", enter "Big 12", verify new catalog entry appears with that name and detection as reference.

### Implementation for User Story 3

- [X] T025 [P] [US3] Create lib/services/deer.ts with createDeer, getDeerCatalog, getDeerById, updateDeer, deleteDeer functions (createDeer must validate unique name per account, return error with suggestion if duplicate)
- [X] T026 [P] [US3] Create app/api/deer/route.ts with GET (list) and POST (create) per contracts/deer-api.yaml
- [X] T027 [P] [US3] Create app/api/deer/[id]/route.ts with GET, PATCH, DELETE per contracts/deer-api.yaml
- [X] T028 [US3] Update lib/services/detections.ts with setReferenceDetection function (sets is_reference=true)
- [X] T029 [P] [US3] Create components/deer/deer-catalog.tsx displaying catalog with reference thumbnails
- [X] T030 [P] [US3] Create components/deer/create-deer-modal.tsx with name input and notes field
- [X] T031 [US3] Create lib/hooks/use-deer.ts with TanStack Query hooks for deer CRUD
- [X] T032 [US3] Add "Name Deer" button to photo-detail or detection view that opens create-deer-modal
- [X] T033 [US3] Create app/(dashboard)/deer/page.tsx displaying deer-catalog component

**Checkpoint**: User Story 3 complete - users can create named deer from detections, view catalog

---

## Phase 6: User Story 4 - On-Demand Matching (Priority: P4)

**Goal**: Compare unassigned buck detections against the catalog to find re-identifications

**Independent Test**: With 3 named deer in catalog and 5 unassigned buck detections, trigger matching. Verify match candidates are created with AI reasoning.

### Implementation for User Story 4

- [X] T034 [P] [US4] Create trigger/jobs/compare-deer.ts with Gemini visual comparison job
- [X] T035 [P] [US4] Create app/api/deer/match/route.ts triggering compare-deer job per contracts/deer-api.yaml (return 400 with "Add deer to your catalog first" if catalog empty)
- [X] T036 [US4] Create lib/services/matching.ts with triggerMatching, getUnassignedBucks, getCatalogWithReferences functions
- [X] T037 [US4] Add createMatchCandidate function to matching.ts storing gemini_confidence and gemini_reasoning
- [X] T038 [US4] Update compare-deer.ts to fetch detection image and all catalog reference images for comparison
- [X] T039 [US4] Add "Find Matches Against Catalog" button to triage-dashboard or deer page

**Checkpoint**: User Story 4 complete - matching job compares detections to catalog, creates candidates

---

## Phase 7: User Story 5 - Match Review UI (Priority: P5)

**Goal**: Review AI match suggestions and confirm, correct, reject, or create new profiles

**Independent Test**: Review a match suggestion, confirm it's correct. Verify the detection is linked to the suggested deer and removed from review queue.

### Implementation for User Story 5

- [X] T040 [P] [US5] Create app/api/deer/matches/route.ts with GET (list pending) per contracts/deer-api.yaml
- [X] T041 [P] [US5] Create app/api/deer/matches/[id]/confirm/route.ts per contracts/deer-api.yaml
- [X] T042 [P] [US5] Create app/api/deer/matches/[id]/correct/route.ts per contracts/deer-api.yaml
- [X] T043 [P] [US5] Create app/api/deer/matches/[id]/reject/route.ts per contracts/deer-api.yaml
- [X] T044 [P] [US5] Create app/api/deer/matches/[id]/skip/route.ts per contracts/deer-api.yaml
- [X] T045 [P] [US5] Create app/api/deer/matches/[id]/create-new/route.ts per contracts/deer-api.yaml
- [X] T046 [US5] Update lib/services/matching.ts with confirmMatch, correctMatch, rejectMatch, skipMatch, createNewFromMatch functions
- [X] T047 [P] [US5] Create components/deer/match-review-modal.tsx with side-by-side comparison UI
- [X] T048 [US5] Add match-review-modal to deer page or create dedicated matches review page
- [X] T049 [US5] Create lib/hooks/use-matches.ts with TanStack Query hooks for match review actions
- [X] T050 [US5] Show pending match count badge on deer catalog or navigation

**Checkpoint**: User Story 5 complete - users can review, confirm, correct, reject matches via UI

---

## Phase 8: User Story 6 - Pipeline Cleanup & Migration (Priority: P6)

**Goal**: Remove legacy Replicate pipeline, clear existing detection data for fresh start

**Independent Test**: After migration, verify no Replicate API calls occur and no legacy Trigger.dev jobs exist.

### Implementation for User Story 6

- [X] T051 [P] [US6] Delete trigger/jobs/detect-animals.ts
- [X] T052 [P] [US6] Delete trigger/jobs/generate-embedding.ts (if exists)
- [X] T053 [P] [US6] Delete trigger/jobs/find-matches.ts (if exists)
- [X] T054 [P] [US6] Delete trigger/jobs/compute-quality.ts (if exists)
- [X] T055 [P] [US6] Delete trigger/jobs/regenerate-embedding.ts (if exists)
- [X] T056 [P] [US6] Delete lib/replicate/client.ts (if exists)
- [X] T057 [US6] Remove replicate package from package.json: `npm uninstall replicate`
- [X] T058 [US6] Remove REPLICATE_API_TOKEN and EMBEDDING_MODEL_VERSION from .env.example
- [X] T059 [US6] Update trigger/index.ts to export only new jobs (analyze-photo, compare-deer, batch-process)

**Checkpoint**: User Story 6 complete - legacy code removed, only Gemini pipeline remains

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Documentation updates and final validation

- [X] T061 [P] Update CLAUDE.md with new Gemini pipeline commands and environment variables
- [X] T062 [P] Verify all API endpoints match contracts/photos-api.yaml and contracts/deer-api.yaml
- [X] T063 Run quickstart.md verification steps for each phase
- [X] T064 Remove any unused components or services related to old pipeline

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational
- **User Story 2 (Phase 4)**: Depends on Foundational, benefits from US1 data
- **User Story 3 (Phase 5)**: Depends on Foundational, uses detections from US1
- **User Story 4 (Phase 6)**: Depends on US3 (needs catalog to match against)
- **User Story 5 (Phase 7)**: Depends on US4 (needs match candidates to review)
- **User Story 6 (Phase 8)**: Should be done LAST after new pipeline is verified working
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (Bulk Photo Analysis)**: Independent - only requires Foundational
- **US2 (Triage Dashboard)**: Independent - can start after Foundational, uses US1 data if available
- **US3 (Buck Catalog)**: Independent - can start after Foundational, uses detections
- **US4 (On-Demand Matching)**: Depends on US3 - needs catalog deer to match against
- **US5 (Match Review)**: Depends on US4 - needs match candidates to review
- **US6 (Pipeline Cleanup)**: Must be LAST - only after new pipeline is working

### Parallel Opportunities

Within each phase, tasks marked [P] can run in parallel. Examples:

**Foundational Phase (T007, T008, T009)**:
```bash
# All Gemini client files can be created in parallel
Task: "Create lib/gemini/client.ts"
Task: "Create lib/gemini/types.ts"
Task: "Create lib/gemini/prompts.ts"
```

**User Story 2 (T016, T017, T018, T020, T021)**:
```bash
# API endpoints and components can be created in parallel
Task: "Update app/api/photos/route.ts with filters"
Task: "Create app/api/photos/stats/route.ts"
Task: "Create app/api/photos/archive/route.ts"
Task: "Create components/photos/triage-dashboard.tsx"
Task: "Create components/photos/buck-grid.tsx"
```

**User Story 5 (T040-T045, T047)**:
```bash
# All match review endpoints can be created in parallel
Task: "Create app/api/deer/matches/route.ts"
Task: "Create app/api/deer/matches/[id]/confirm/route.ts"
Task: "Create app/api/deer/matches/[id]/correct/route.ts"
Task: "Create app/api/deer/matches/[id]/reject/route.ts"
Task: "Create app/api/deer/matches/[id]/skip/route.ts"
Task: "Create app/api/deer/matches/[id]/create-new/route.ts"
Task: "Create components/deer/match-review-modal.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T009)
3. Complete Phase 3: User Story 1 (T010-T015)
4. **STOP and VALIDATE**: Upload test photos, verify Gemini analysis works
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational -> Foundation ready
2. Add User Story 1 -> Test: Photos analyzed by Gemini
3. Add User Story 2 -> Test: Can filter by points, view stats
4. Add User Story 3 -> Test: Can create named deer catalog
5. Add User Story 4 -> Test: Can trigger matching against catalog
6. Add User Story 5 -> Test: Can review and confirm matches
7. Add User Story 6 -> Test: Legacy code removed
8. Polish -> Documentation updated

### Suggested MVP Scope

For initial deployment, complete through **User Story 3** (Phases 1-5):
- Users can upload photos
- Gemini analyzes and extracts deer attributes
- Users can filter by points to find trophy bucks
- Users can build a named deer catalog

This delivers the core value proposition without the matching complexity.

---

## Notes

- [P] tasks = different files, no dependencies within that phase
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable (except US4 depends on US3, US5 depends on US4)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Migration data cleanup (US6) should only run after new pipeline is verified working
