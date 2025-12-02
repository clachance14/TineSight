# Tasks: Photo Pipeline

**Input**: Design documents from `/specs/002-photo-pipeline/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app (Next.js App Router)**: `app/`, `components/`, `lib/`, `trigger/`
- **Database**: `supabase/migrations/`
- **Tests**: `tests/e2e/`, `tests/integration/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependencies, and external service configuration

- [x] T001 Add Trigger.dev dependencies: `npm install @trigger.dev/sdk @trigger.dev/nextjs`
- [x] T002 Add Replicate SDK: `npm install replicate`
- [x] T003 [P] Initialize Trigger.dev config in `trigger.config.ts`
- [x] T004 [P] Add environment variables to `.env.example` (TRIGGER_API_KEY, REPLICATE_API_TOKEN, model versions)
- [x] T005 [P] Create Replicate client wrapper in `lib/replicate/client.ts`
- [x] T006 Create Trigger.dev client configuration in `trigger/client.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, storage bucket, and core infrastructure that MUST be complete before ANY user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database Schema

- [x] T007 Create migration `supabase/migrations/002_photo_pipeline.sql`:
  - Alter `deer_embeddings.deer_id` to nullable
  - Create `processing_batches` table with RLS
  - Add `batch_id` column to `images` table
  - Create `match_candidates` table with RLS
  - Create `find_similar_deer()` function
  - Update RLS policies for orphaned embeddings
- [ ] T008 Push migration to Supabase: `npx supabase db push`
- [ ] T009 Regenerate TypeScript types: `npx supabase gen types typescript --linked > types/database.ts`

### Storage Configuration

- [ ] T010 [P] Create `photos` storage bucket in Supabase (private, 50MB limit, allowed MIME types)
- [ ] T011 Apply storage RLS policies (upload/view/delete to own folder)

### Service Layer Foundation

- [x] T012 [P] Create photos service in `lib/services/photos.ts` with base CRUD operations
- [x] T013 [P] Create detections service in `lib/services/detections.ts` with base operations
- [x] T014 [P] Create matching service in `lib/services/matching.ts` with similarity search

### Upload State Management

- [x] T015 Create upload store in `lib/stores/upload.ts` (Zustand - queue, progress, status tracking)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Bulk Photo Upload (Priority: P1) 🎯 MVP

**Goal**: Users can upload multiple game camera photos at once to begin processing

**Independent Test**: Log in, drag a folder of 50+ photos onto the upload area, verify all photos appear in the processing queue with progress indicators

### Implementation for User Story 1

- [x] T016 [US1] Create PhotoUploader component in `components/photos/photo-uploader.tsx`:
  - Drag-and-drop zone (react-dropzone)
  - File validation (JPEG, PNG, HEIC, WebP)
  - Client-side thumbnail generation (Canvas API, 300px)
  - Queue files in upload store
- [x] T017 [US1] Create UploadProgressPanel component in `components/photos/upload-progress-panel.tsx`:
  - Individual file progress bars
  - Overall batch progress
  - Success/failure counts
  - Dismiss on complete
- [x] T018 [US1] Create upload initiation API route in `app/api/photos/upload/route.ts`:
  - POST: Create processing_batch, generate signed URLs
  - Validate file metadata (size, type)
  - Return batch_id and upload URLs
- [x] T019 [US1] Create upload completion API route in `app/api/photos/upload/complete/route.ts`:
  - POST: Mark batch as uploading→processing
  - Trigger background processing job
- [x] T020 [US1] Extend photos service with upload methods in `lib/services/photos.ts`:
  - `initiateUpload(files: FileMetadata[])` - create batch, get signed URLs
  - `uploadToStorage(file, signedUrl)` - upload file + thumbnail
  - `completeUpload(batchId, imageIds)` - trigger processing
- [x] T021 [US1] Create batch-process job in `trigger/jobs/batch-process.ts`:
  - Fan-out coordinator for batch
  - Update batch status
  - Queue detect-animals for each image
- [x] T022 [US1] Create Photos page in `app/(dashboard)/photos/page.tsx`:
  - PhotoUploader at top
  - UploadProgressPanel when upload active
  - Placeholder for photo grid (US3)
- [x] T023 [US1] Add photos link to dashboard sidebar in `components/dashboard/sidebar.tsx`

**Checkpoint**: Users can upload photos and see progress. Photos are stored and queued for processing.

---

## Phase 4: User Story 2 - AI Deer Detection (Priority: P1)

**Goal**: Uploaded photos are automatically analyzed by AI to detect deer presence

**Independent Test**: Upload a mixed batch of photos (some with deer, some empty), wait for processing, verify AI correctly categorizes most photos

### Implementation for User Story 2

- [x] T024 [US2] Create detect-animals job in `trigger/jobs/detect-animals.ts`:
  - Call MegaDetector via Replicate
  - Parse bounding boxes and confidence scores
  - Create detection records in database
  - Update image detection_status
  - Handle errors with retry logic
- [x] T025 [US2] Add detection status update method to `lib/services/photos.ts`:
  - `updateDetectionStatus(imageId, status, results?)`
- [x] T026 [US2] Create detection records service in `lib/services/detections.ts`:
  - `createDetections(imageId, detections[])`
  - `getDetectionsForImage(imageId)`
  - `updateDetectionClass(detectionId, class)` - for manual corrections
- [x] T027 [US2] Add Trigger.dev webhook route in `app/api/trigger/route.ts` (N/A - Trigger.dev v4 uses direct triggers)
- [x] T028 [US2] Create TanStack Query hooks for photo status polling in `lib/hooks/use-photos.ts`:
  - `usePhotos(filters)` with refetchInterval for processing status
  - `usePhotoDetail(id)`
  - `useBatchStatus(batchId)`

**Checkpoint**: Photos are automatically processed by AI. Detection results stored in database.

---

## Phase 5: User Story 3 - Photo Review Interface (Priority: P1)

**Goal**: Users can review their photos with filters and see AI detection results

**Independent Test**: Upload photos, wait for processing, filter by "Has Deer", view individual photos with detection overlays, correct any misclassifications

### Implementation for User Story 3

- [x] T029 [US3] Create PhotoGrid component in `components/photos/photo-grid.tsx`:
  - Responsive masonry grid layout
  - Thumbnail display with signed URLs
  - Status badge overlays
  - Infinite scroll with TanStack Query
- [x] T030 [US3] Create PhotoCard component in `components/photos/photo-card.tsx`:
  - Thumbnail with detection status indicator
  - Quick stats (detection count, deer/empty)
  - Click to open viewer
- [x] T031 [US3] Create PhotoFilters component in `components/photos/photo-filters.tsx`:
  - Filter by: All, Has Deer, Empty, Processing, Failed
  - Filter by batch
  - Search by date range
- [x] T032 [US3] Create PhotoViewer modal in `components/photos/photo-viewer.tsx`:
  - Full-size image display
  - Keyboard navigation (arrow keys)
  - Detection details panel
  - Close on escape
- [x] T033 [US3] Create DetectionOverlay component in `components/photos/detection-overlay.tsx`:
  - Bounding box display
  - Confidence percentage badge
  - Toggle visibility
- [x] T034 [US3] Create photo detail page in `app/(dashboard)/photos/[id]/page.tsx`:
  - Full photo view with DetectionOverlay
  - Detection list with details
  - Manual correction buttons (mark as deer/empty)
- [x] T035 [US3] Add GET /photos endpoint in `app/api/photos/route.ts`:
  - List photos with pagination
  - Filter by status, hasDeer, batchId
- [x] T036 [US3] Add GET /photos/[id] endpoint in `app/api/photos/[id]/route.ts`:
  - Photo details with detections
  - Signed URL for full image
- [x] T037 [US3] Update Photos page to integrate PhotoGrid and PhotoFilters in `app/(dashboard)/photos/page.tsx`

**Checkpoint**: Users can browse, filter, and view photos with detection overlays.

---

## Phase 6: User Story 4 - Embedding Generation (Priority: P2)

**Goal**: Each detected deer generates a unique embedding vector for re-identification matching

**Independent Test**: Upload photos with deer, wait for processing to complete, verify detection records have associated embedding vectors stored

### Implementation for User Story 4

- [x] T038 [US4] Create generate-embedding job in `trigger/jobs/generate-embedding.ts`:
  - Crop detection from image
  - Call embedding model via Replicate
  - Store 512-dimensional vector in deer_embeddings
  - deer_id = NULL (orphaned until matched)
  - Handle errors with retry
- [x] T039 [US4] Update detect-animals job to trigger embedding generation in `trigger/jobs/detect-animals.ts`:
  - After creating detection, queue generate-embedding job
- [x] T040 [US4] Add embedding methods to detections service in `lib/services/detections.ts`:
  - `createEmbedding(detectionId, vector)`
  - `hasEmbedding(detectionId)`
- [x] T041 [US4] Update PhotoViewer to show embedding status in `components/photos/photo-viewer.tsx`:
  - Badge showing "Ready for matching" when embedding exists

**Checkpoint**: Detected deer have embeddings ready for similarity matching.

---

## Phase 7: User Story 5 - Match Discovery (Priority: P2)

**Goal**: System automatically finds similar deer from existing catalog and presents match candidates

**Independent Test**: Upload multiple photos of the same buck, create deer profile from first, upload more photos, verify system suggests matches to existing profile

### Implementation for User Story 5

- [x] T042 [US5] Create find-matches job in `trigger/jobs/find-matches.ts`:
  - Call find_similar_deer() database function
  - Create match_candidates records for top 5 matches
  - Handle "no matches found" case
- [x] T043 [US5] Update generate-embedding job to trigger match finding in `trigger/jobs/generate-embedding.ts`:
  - After storing embedding, queue find-matches job
- [x] T044 [US5] Add match candidate methods to matching service in `lib/services/matching.ts`:
  - `findSimilarDeer(embedding, userId)`
  - `createMatchCandidates(detectionId, candidates[])`
  - `getMatchCandidates(detectionId)`
- [x] T045 [US5] Create GET /detections/[id]/matches endpoint in `app/api/detections/[id]/matches/route.ts`:
  - Return candidates with similarity scores
  - Include deer summary and representative image
- [x] T046 [US5] Create TanStack Query hooks for matches in `lib/hooks/use-matches.ts`:
  - `useMatchCandidates(detectionId)`
  - `usePendingMatches()` - photos with unreviewed candidates

**Checkpoint**: System automatically finds and stores potential deer matches.

---

## Phase 8: User Story 6 - Match Confirmation (Priority: P2)

**Goal**: Users confirm or reject AI match suggestions before linking detections to deer profiles

**Independent Test**: Upload a photo with a detection that matches an existing deer, view match suggestion, confirm or reject it, verify deer profile updated

### Implementation for User Story 6

- [x] T047 [US6] Create MatchConfirmation component in `components/deer/match-confirmation.tsx`:
  - Side-by-side comparison (new detection vs candidate deer)
  - Similarity score display
  - Confirm/Reject buttons
  - "Create new deer" option
- [x] T048 [US6] Create MatchReviewPanel component in `components/photos/match-review-panel.tsx`:
  - Summary of pending matches
  - Quick navigation between detections
  - Batch actions
- [x] T049 [US6] Create POST /detections/[id]/confirm endpoint in `app/api/detections/[id]/confirm/route.ts`:
  - Link detection to deer
  - Update deer.last_seen
  - Assign embedding to deer
  - Mark match candidate as confirmed
- [x] T050 [US6] Create POST /detections/[id]/reject endpoint in `app/api/detections/[id]/reject/route.ts`:
  - Mark candidates as rejected
  - Return remaining candidate count
- [x] T051 [US6] Create POST /detections/[id]/create-deer endpoint in `app/api/detections/[id]/create-deer/route.ts`:
  - Create new deer profile
  - Link detection to new deer
  - Assign embedding to new deer
- [x] T052 [US6] Add confirmation methods to matching service in `lib/services/matching.ts`:
  - `confirmMatch(detectionId, deerId)`
  - `rejectCandidates(detectionId, deerIds[])`
  - `createDeerFromDetection(detectionId, name?)`
- [x] T053 [US6] Create GET /photos/pending-matches endpoint in `app/api/photos/pending-matches/route.ts`:
  - List photos with unreviewed match candidates
- [x] T054 [US6] Update PhotoViewer to integrate MatchConfirmation in `components/photos/photo-viewer.tsx`:
  - Show match candidates when available
  - Actions to confirm/reject/create
- [x] T055 [US6] Add keyboard navigation for match review in PhotoViewer:
  - Y = confirm top match
  - N = reject top match
  - Arrow keys = navigate photos

**Checkpoint**: Users can review and confirm/reject match suggestions. Deer profiles updated on confirmation.

---

## Phase 9: User Story 7 - Filter and Retry Failed Photos (Priority: P3)

**Goal**: Users can filter photos by processing status and retry failed processing

**Independent Test**: Simulate a processing failure, view "Failed" filter, successfully retry the failed photo

### Implementation for User Story 7

- [x] T056 [US7] Add "Failed" status filter to PhotoFilters component in `components/photos/photo-filters.tsx`
- [x] T057 [US7] Create RetryButton component in `components/photos/retry-button.tsx`:
  - Single photo retry
  - "Retry All Failed" option
- [x] T058 [US7] Create POST /photos/[id]/retry endpoint in `app/api/photos/[id]/retry/route.ts`:
  - Validate photo is in failed state
  - Reset retry_count
  - Re-queue for processing
- [x] T059 [US7] Add retry methods to photos service in `lib/services/photos.ts`:
  - `retryPhoto(imageId)`
  - `retryAllFailed(batchId?)`
- [x] T060 [US7] Update detect-animals job for retry handling in `trigger/jobs/detect-animals.ts`:
  - Respect max retry count (3)
  - Exponential backoff
  - Clear error message on success
- [x] T061 [US7] Show error details on failed photos in `components/photos/photo-card.tsx`:
  - Error badge
  - Tooltip with error message

**Checkpoint**: Users can recover from processing failures with retry functionality.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T062 [P] Add loading skeletons to PhotoGrid and PhotoViewer
- [x] T063 [P] Add empty states to Photos page ("Upload your first photos")
- [x] T064 [P] Create batch status summary component in `components/photos/batch-summary.tsx`
- [x] T065 Implement optimistic updates for match confirmation/rejection
- [x] T066 [P] Add error boundary wrapper for photo components
- [ ] T067 [P] Run quickstart.md verification checklist
- [ ] T068 Create E2E test for photo upload flow in `tests/e2e/photo-upload.spec.ts`
- [ ] T069 Create E2E test for match confirmation flow in `tests/e2e/match-confirmation.spec.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **US1 Upload (Phase 3)**: Depends on Foundational - MVP entry point
- **US2 Detection (Phase 4)**: Depends on US1 (needs photos to process)
- **US3 Review (Phase 5)**: Depends on US2 (needs detection results to display)
- **US4 Embedding (Phase 6)**: Depends on US2 (needs detections to generate embeddings)
- **US5 Match Discovery (Phase 7)**: Depends on US4 (needs embeddings for similarity)
- **US6 Confirmation (Phase 8)**: Depends on US5 (needs match candidates to review)
- **US7 Retry (Phase 9)**: Depends on US2 (needs processing pipeline)
- **Polish (Phase 10)**: Depends on all desired stories being complete

### User Story Dependency Graph

```
Foundational (Phase 2)
        │
        ▼
    US1 Upload (P1) ─────────────────────────────┐
        │                                        │
        ▼                                        ▼
    US2 Detection (P1)                      US7 Retry (P3)
        │
        ├───────────────┐
        ▼               ▼
    US3 Review (P1)  US4 Embedding (P2)
                        │
                        ▼
                    US5 Match Discovery (P2)
                        │
                        ▼
                    US6 Confirmation (P2)
```

### Within Each User Story

- Services/hooks before API routes
- API routes before components
- Components before pages
- Integration/wiring last

### Parallel Opportunities

**Phase 1 Setup** (all can run in parallel):
- T003, T004, T005, T006

**Phase 2 Foundational** (after T007-T009 complete):
- T010, T011 (storage)
- T012, T013, T014 (services)

**Phase 3 US1** (after T015 complete):
- T016, T017 (components) can parallel with T018, T019 (routes)

---

## Parallel Example: User Story 1

```bash
# After T015 (upload store) is complete, launch in parallel:
Task: "Create PhotoUploader component" (T016)
Task: "Create upload initiation API route" (T018)
Task: "Create upload completion API route" (T019)
Task: "Extend photos service with upload methods" (T020)
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US3 = Core Photo Pipeline)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: US1 - Upload
4. Complete Phase 4: US2 - Detection
5. Complete Phase 5: US3 - Review Interface
6. **STOP and VALIDATE**: Test full upload→detect→review flow
7. Deploy/demo if ready

### Adding Re-Identification (US4 + US5 + US6 = North Star)

1. Complete Phase 6: US4 - Embeddings
2. Complete Phase 7: US5 - Match Discovery
3. Complete Phase 8: US6 - Match Confirmation
4. **VALIDATE**: Test buck re-identification (North Star metric)

### Error Handling (US7 = Reliability)

1. Complete Phase 9: US7 - Retry Failed
2. Improves reliability for production use

---

## Summary

| Phase | User Story | Task Count | Parallel Tasks |
|-------|------------|------------|----------------|
| 1 | Setup | 6 | 4 |
| 2 | Foundational | 9 | 5 |
| 3 | US1 - Upload | 8 | 2 |
| 4 | US2 - Detection | 5 | 0 |
| 5 | US3 - Review | 9 | 0 |
| 6 | US4 - Embedding | 4 | 0 |
| 7 | US5 - Match Discovery | 5 | 0 |
| 8 | US6 - Confirmation | 9 | 0 |
| 9 | US7 - Retry | 6 | 0 |
| 10 | Polish | 8 | 5 |
| **Total** | | **69** | **16** |

**MVP Scope**: Phases 1-5 (US1-US3) = 37 tasks
**North Star Scope**: Add Phases 6-8 (US4-US6) = +18 tasks = 55 tasks
**Full Feature**: All phases = 69 tasks
