# Tasks: 10K Photo Bulk Upload

**Input**: Design documents from `/specs/012-bulk-upload/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/upload-api.yaml, quickstart.md

**Tests**: Constitution specifies "Integration Testing Over Unit Testing" - E2E tests included for critical paths only.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1, US2, US3, US4)
- Exact file paths included in all descriptions

## Path Conventions (from plan.md)

```
app/(dashboard)/upload/     # Upload page and worker
app/api/photos/             # API routes
components/upload/          # UI components
lib/upload/                 # Upload utilities
lib/hooks/                  # React hooks
lib/services/               # Data access layer
trigger/jobs/               # Background processing
supabase/migrations/        # Database changes
tests/e2e/                  # Playwright tests
tests/integration/          # API tests
```

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project dependencies and build configuration

- [X] T001 Install exifr dependency via `npm install exifr`
- [X] T002 [P] Update next.config.js to support Web Worker bundling with webpack rules
- [X] T003 [P] Create lib/upload/ directory structure with index.ts barrel export
- [X] T004 [P] Create components/upload/ directory structure with index.ts barrel export
- [X] T005 [P] Create upload configuration constants in lib/upload/config.ts (chunk size: 25, parallel: 5, max retries: 3, EXIF slice: 128KB)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story

**CRITICAL**: All user stories depend on this phase

### Database & Schema

- [X] T006 Create database migration supabase/migrations/037_bulk_upload_support.sql (add original_filename to images, add progress columns to upload_sessions, create idx_images_dedup index)
- [X] T007 Run migration via `npx supabase db push` and verify schema changes

### Web Worker Infrastructure

- [X] T008 Create EXIF extraction Web Worker in components/upload/FileProcessor.worker.ts using exifr with 128KB binary slicing
- [X] T009 Create ExifWorkerPool manager class in lib/upload/ExifWorkerPool.ts with pool size matching navigator.hardwareConcurrency

### Core Upload Libraries

- [X] T010 [P] Create file chunker utility in lib/upload/chunker.ts with chunkArray() function for 25-file batches
- [X] T011 [P] Create parallel upload manager in lib/upload/uploader.ts with 5 concurrent uploads and XHR-based progress tracking
- [X] T012 [P] Create duplicate detection client in lib/upload/dedup.ts wrapping /api/photos/check-duplicates endpoint
- [X] T013 Create upload session types in lib/upload/types.ts (UploadSession, FileStatus, ChunkStatus, UploadProgress)

### API Endpoints (Shared)

- [X] T014 [P] Create upload session API POST route in app/api/photos/upload-session/route.ts (creates upload_sessions record)
- [X] T015 [P] Create upload session GET/PATCH routes in app/api/photos/upload-session/[sessionId]/route.ts (read and update session)
- [X] T016 [P] Create batch signed URLs API in app/api/photos/signed-urls/route.ts (generates 25 signed URLs per request, creates pending image records)
- [X] T017 [P] Create duplicate check API in app/api/photos/check-duplicates/route.ts (queries idx_images_dedup index)

### Photo Service Enhancement

- [X] T018 Update lib/services/photos.ts with bulk upload operations (createUploadSession, updateSessionProgress, checkDuplicates, getBatchSignedUrls)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - First-Time Bulk Import (Priority: P1) MVP

**Goal**: Users can upload 10,000 photos without browser crash, with AI processing starting immediately as chunks complete

**Independent Test**: Select folder with 1,000+ photos, verify all photos appear in gallery with deer detections completed

### Implementation for User Story 1

- [X] T019 [US1] Create Supabase Realtime subscription hook in lib/hooks/use-realtime-photos.ts with postgres_changes filter on images table
- [X] T020 [US1] Create main BulkUploader orchestrator component in components/upload/BulkUploader.tsx integrating ExifWorkerPool, chunker, and uploader
- [X] T021 [US1] Implement folder selection with webkitdirectory attribute and file type filtering (JPEG, PNG, HEIC, WebP) in BulkUploader.tsx
- [X] T022 [US1] Implement chunked EXIF extraction pipeline in BulkUploader.tsx: file → slice 128KB → transfer to worker → collect metadata
- [X] T023 [US1] Implement pipelined batch upload in BulkUploader.tsx: fetch URLs for chunk N+1 while uploading chunk N
- [X] T024 [US1] Integrate useRealtimePhotos hook in BulkUploader.tsx for live gallery updates as processing completes
- [X] T025 [US1] Create Trigger.dev batch processing job in trigger/jobs/batch-process.ts to trigger process-photo for each uploaded chunk
- [X] T026 [US1] Update upload page app/(dashboard)/upload/page.tsx to use BulkUploader component with session management
- [X] T027 [US1] Wire TanStack Query cache updates in use-realtime-photos.ts for optimistic UI updates when images complete processing

**Checkpoint**: User Story 1 complete - bulk upload with streaming processing works independently

---

## Phase 4: User Story 2 - Progress Visibility (Priority: P1)

**Goal**: Users see clear upload and processing progress with failed file tracking

**Independent Test**: Upload 100+ photos and verify dual progress bars update in real-time for upload and processing stages

### Implementation for User Story 2

- [X] T028 [P] [US2] Create UploadProgress component in components/upload/UploadProgress.tsx with dual progress bars (upload count, processing count)
- [X] T029 [P] [US2] Create UploadQueue visualization component in components/upload/UploadQueue.tsx showing chunk status (pending/uploading/complete/failed)
- [X] T030 [US2] Add failed file state tracking to BulkUploader.tsx with error details collection per file
- [X] T031 [US2] Create FailedFilesList component in components/upload/FailedFilesList.tsx with retry button and error message display
- [X] T032 [US2] Implement beforeunload warning in BulkUploader.tsx to prevent accidental tab close during active upload
- [X] T033 [US2] Add skipped files counter display in UploadProgress.tsx for deduplicated files
- [X] T034 [US2] Integrate UploadProgress and UploadQueue components into upload page app/(dashboard)/upload/page.tsx

**Checkpoint**: User Story 2 complete - progress visibility works independently

---

## Phase 5: User Story 3 - Slow Connection Tolerance (Priority: P2)

**Goal**: Uploads succeed on slow/unreliable rural connections with automatic retry

**Independent Test**: Throttle network to 1Mbps and verify 5MB files upload successfully with automatic retry on transient failures

### Implementation for User Story 3

- [X] T035 [US3] Create retry utility in lib/upload/retry.ts with exponential backoff (1s, 2s, 4s) plus 10% jitter, max 30s cap
- [X] T036 [US3] Create refresh URL API in app/api/photos/[id]/refresh-url/route.ts for generating fresh signed URL on retry
- [X] T037 [US3] Enhance uploader.ts with retry logic: detect transient errors (network, 5xx, 429), apply exponential backoff, refresh URL on retry
- [X] T038 [US3] Add adaptive timeout calculation to uploader.ts based on file size (30s minimum, scale with file size for slow connections)
- [X] T039 [US3] Add connection quality detection in BulkUploader.tsx to adjust concurrency (reduce to 2-3 uploads on slow connections)
- [X] T040 [US3] Display retry status in UploadQueue.tsx (show "Retry 1/3" indicator for files being retried)

**Checkpoint**: User Story 3 complete - slow connection handling works independently

---

## Phase 6: User Story 4 - Debug Logging for Support (Priority: P3)

**Goal**: Structured console logs enable support to diagnose upload issues

**Independent Test**: Enable debug mode and verify structured log output appears in console with timestamps, phases, and metrics

### Implementation for User Story 4

- [X] T041 [P] [US4] Create structured logger utility in lib/upload/logger.ts with phases (init, hash, upload, process, complete, error) and metrics
- [X] T042 [P] [US4] Create UploadMetrics collector in lib/upload/metrics.ts tracking peak memory, throughput, error rates, timing
- [X] T043 [US4] Integrate logger throughout BulkUploader.tsx with structured events for each upload phase
- [X] T044 [US4] Add debug mode toggle to upload page UI in app/(dashboard)/upload/page.tsx (localStorage persisted)
- [X] T045 [US4] Add upload completion summary log with total files, success/fail counts, peak memory, total duration
- [X] T046 [US4] Create exportable log format in logger.ts for users to copy/paste console output to support

**Checkpoint**: User Story 4 complete - debug logging works independently

---

## Phase 7: E2E Testing & Polish

**Purpose**: Integration verification and cross-cutting improvements

### E2E Tests

- [ ] T047 [P] Create bulk upload E2E test in tests/e2e/bulk-upload.spec.ts (select 50 photos, verify upload completion and gallery appearance)
- [ ] T048 [P] Create upload API contract tests in tests/integration/upload-api.test.ts (signed-urls, check-duplicates, session endpoints)

### Polish & Optimization

- [X] T049 Add loading skeleton to upload page while session initializes
- [X] T050 Add keyboard accessibility to upload dropzone (Enter to open file picker)
- [X] T051 Review and ensure TineSight design system compliance (dark mode, copper accents, cream text)
- [X] T052 Add error boundary to BulkUploader component for graceful failure handling
- [X] T053 Run quickstart.md validation checklist to verify all setup steps work

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup ─────────────────────────────────────┐
                                                     ▼
Phase 2: Foundational ──────────────────────────────┤ BLOCKS ALL STORIES
                                                     │
         ┌───────────────────┬───────────────────────┼───────────────────────┐
         ▼                   ▼                       ▼                       ▼
Phase 3: US1 (P1)    Phase 4: US2 (P1)      Phase 5: US3 (P2)     Phase 6: US4 (P3)
(Bulk Import)        (Progress)             (Slow Connection)     (Debug Logging)
         │                   │                       │                       │
         └───────────────────┴───────────────────────┴───────────────────────┘
                                                     │
                                                     ▼
                                          Phase 7: E2E & Polish
```

### User Story Dependencies

| Story | Depends On | Can Parallel With | Notes |
|-------|------------|-------------------|-------|
| US1 (Bulk Import) | Phase 2 only | US2, US3, US4 | Core upload flow |
| US2 (Progress) | Phase 2, US1 partial | US3, US4 | Uses BulkUploader state |
| US3 (Slow Connection) | Phase 2 only | US1, US2, US4 | Enhances uploader.ts |
| US4 (Debug Logging) | Phase 2 only | US1, US2, US3 | Cross-cutting concern |

### Within Each Story

1. Libraries/utilities before components
2. API routes before client code that calls them
3. Core functionality before enhancements
4. Tests after implementation (constitution: integration over unit)

### Parallel Opportunities

**Phase 2 (Foundational)** - Maximum parallelism after T009:
```
T010 (chunker) ─┬─ T011 (uploader) ─┬─ T012 (dedup) ─┬─ T013 (types)
                │                    │                │
T014 (session POST) ─┬─ T015 (session CRUD) ─┬─ T016 (signed-urls) ─┬─ T017 (check-dup)
```

**Phase 7 (E2E)** - Tests run in parallel:
```
T047 (E2E bulk upload) ─┬─ T048 (API contract tests)
```

---

## Parallel Execution Examples

### Phase 2: Launch API Routes in Parallel (4 agents)

```bash
Agent 1: "Create upload session API POST route in app/api/photos/upload-session/route.ts"
Agent 2: "Create upload session GET/PATCH routes in app/api/photos/upload-session/[sessionId]/route.ts"
Agent 3: "Create batch signed URLs API in app/api/photos/signed-urls/route.ts"
Agent 4: "Create duplicate check API in app/api/photos/check-duplicates/route.ts"
```

### Phase 3-6: Launch User Stories in Parallel (after Foundational)

```bash
# If team capacity allows, all user stories can start simultaneously:
Agent 1: "US1 - Starting with T019 (Realtime hook)"
Agent 2: "US2 - Starting with T028 (UploadProgress component)"
Agent 3: "US3 - Starting with T035 (Retry utility)"
Agent 4: "US4 - Starting with T041 (Structured logger)"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup (T001-T005) - ~5 tasks
2. Complete Phase 2: Foundational (T006-T018) - ~13 tasks, BLOCKS ALL
3. Complete Phase 3: User Story 1 (T019-T027) - ~9 tasks
4. Complete Phase 4: User Story 2 (T028-T034) - ~7 tasks
5. **STOP and VALIDATE**: Test with 100+ photos
6. Deploy MVP with bulk upload + progress visibility

### Incremental Delivery

| Increment | Stories | Value Delivered |
|-----------|---------|-----------------|
| MVP | US1 + US2 | Bulk upload works with progress bars |
| +P2 | +US3 | Reliable on slow rural connections |
| +P3 | +US4 | Support can diagnose issues |
| Polish | E2E tests | Production confidence |

### Recommended Single-Developer Sequence

1. **Day 1**: T001-T009 (Setup + Worker infrastructure)
2. **Day 2**: T010-T018 (Libraries + APIs)
3. **Day 3**: T019-T027 (US1 - Core upload)
4. **Day 4**: T028-T034 (US2 - Progress UI)
5. **Day 5**: T035-T040 (US3 - Retry/slow connection)
6. **Day 6**: T041-T046 (US4 - Logging)
7. **Day 7**: T047-T053 (E2E + Polish)

---

## Summary

| Phase | Task Count | Parallel Tasks | Key Deliverable |
|-------|------------|----------------|-----------------|
| Setup | 5 | 4 | Dependencies + config |
| Foundational | 13 | 8 | Migration, Worker, APIs |
| US1 (P1) | 9 | 0 | Bulk upload core |
| US2 (P1) | 7 | 2 | Progress visibility |
| US3 (P2) | 6 | 0 | Slow connection handling |
| US4 (P3) | 6 | 2 | Debug logging |
| E2E/Polish | 7 | 2 | Tests + refinement |
| **Total** | **53** | **18** | Complete feature |

---

## Notes

- [P] tasks can run with up to 5 parallel agents
- All user stories are independently testable after Foundational phase
- Constitution requires RLS enforcement - handled by existing policies
- Supabase Realtime already enabled on images table (migration 031)
- Server-side thumbnails handled by existing Trigger.dev process-photo job
