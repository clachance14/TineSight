# Feature Specification: Photo Pipeline

**Feature Branch**: `002-photo-pipeline`
**Created**: 2025-12-01
**Status**: Draft
**MVP Phase**: 2 (Photo Pipeline)
**Depends On**: `001-saas-foundation` (auth, database schema)

## Product Context

This feature implements **Phase 2** of the TineSight MVP as defined in the [Product Vision](../../.specify/memory/product-vision.md).

| Aspect | Summary |
|--------|---------|
| **Problem** | Hunting lease operators have 1000s of photos, 80%+ are empty/non-deer |
| **This Feature** | Upload photos in bulk, AI automatically filters to "has deer" |
| **Value Delivered** | Hours saved on manual photo sorting |
| **Next Phase** | Deer Catalog (003) - organize identified deer |

---

## User Scenarios & Testing

### User Story 1 - Bulk Photo Upload (Priority: P1)

Users can upload multiple game camera photos at once to begin processing.

**Why this priority**: This is the entry point for all value. Without photos in the system, nothing else works. Must handle real-world batch sizes (100-500+ photos per upload).

**Independent Test**: Can be fully tested by logging in, dragging a folder of 50+ photos onto the upload area, and verifying all photos appear in the processing queue.

**Acceptance Scenarios**:

1. **Given** an authenticated user on the Photos page, **When** they drag a folder of images onto the upload area, **Then** all valid image files are queued for upload with a progress indicator
2. **Given** an upload in progress, **When** the user views the upload status, **Then** they see individual file progress and overall batch progress
3. **Given** a batch upload completes, **When** processing finishes, **Then** the user sees a summary ("Uploaded 127 photos, processing...")
4. **Given** a user uploads a very large batch (500+ photos), **When** upload completes, **Then** processing continues in background and user can navigate away
5. **Given** an upload fails mid-batch (network error), **When** user returns, **Then** they can resume the failed upload without re-uploading successful files
6. **Given** a user uploads non-image files mixed with images, **When** upload processes, **Then** non-images are skipped with a warning, valid images proceed

---

### User Story 2 - AI Deer Detection (Priority: P1)

Uploaded photos are automatically analyzed by AI to detect whether they contain deer.

**Why this priority**: This is Stage 1 AI - the "triage" step. Filtering out empty photos saves users the most time and is prerequisite to deer identification.

**Independent Test**: Can be fully tested by uploading a mixed batch of photos (some with deer, some empty), waiting for processing, and verifying the AI correctly categorizes most photos.

**Acceptance Scenarios**:

1. **Given** photos are uploaded, **When** background processing runs, **Then** each photo is analyzed by AI and tagged with detection status (has_deer, no_deer, processing, error)
2. **Given** processing completes for a batch, **When** user views the Photos page, **Then** they see photos grouped or filterable by "Has Deer" vs "Empty/Other"
3. **Given** a photo contains a deer, **When** AI processes it, **Then** the deer is detected with a bounding box and confidence score stored
4. **Given** a photo contains multiple deer, **When** AI processes it, **Then** each deer is detected as a separate detection with its own bounding box
5. **Given** AI incorrectly marks a deer photo as empty (false negative), **When** user views the photo, **Then** they can manually mark it as "Has Deer" to correct the classification
6. **Given** AI incorrectly marks an empty photo as having deer (false positive), **When** user views the photo, **Then** they can dismiss the detection

---

### User Story 3 - Photo Review Interface (Priority: P1)

Users can review their photos with filters and see AI detection results.

**Why this priority**: Users need to see what AI found and trust/correct the results. This is the human-in-the-loop interface for Stage 1.

**Independent Test**: Can be fully tested by uploading photos, waiting for processing, then filtering by "Has Deer", viewing individual photos with detection overlays, and correcting any misclassifications.

**Acceptance Scenarios**:

1. **Given** processed photos exist, **When** user views the Photos page, **Then** they see a grid of photo thumbnails with detection status indicators
2. **Given** the photo grid, **When** user applies "Has Deer" filter, **Then** only photos with detected deer are shown
3. **Given** a photo with detected deer, **When** user clicks to view full size, **Then** they see bounding boxes overlaid on detected deer
4. **Given** a photo view, **When** user sees detection details, **Then** they see confidence percentage and detection timestamp
5. **Given** multiple photos to review, **When** user uses keyboard navigation (arrow keys), **Then** they can quickly move through photos without mouse
6. **Given** a photo marked incorrectly, **When** user corrects the classification, **Then** the system updates immediately and learns from the correction

---

### Edge Cases

- What happens if a photo is corrupted or unreadable? (Mark as error, show in "Failed" tab)
- What if AI processing service is unavailable? (Queue for retry, show "Processing" status)
- What if a photo is extremely large (50MB+)? (Resize before upload, warn user)
- What if user uploads duplicate photos? (Detect by hash, skip duplicates with notice)
- What if processing takes longer than expected? (Show estimated time, allow background)

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST accept bulk image uploads via drag-and-drop
- **FR-002**: System MUST support common image formats (JPEG, PNG, HEIC, WebP)
- **FR-003**: System MUST show upload progress for individual files and overall batch
- **FR-004**: System MUST process uploads in background after initial upload completes
- **FR-005**: System MUST store images in user-isolated storage (Supabase Storage)
- **FR-006**: System MUST analyze each image for deer presence using AI (Replicate API)
- **FR-007**: System MUST store detection results with bounding boxes and confidence scores
- **FR-007a**: System MUST generate embedding vectors for deer detections via Replicate API
- **FR-007b**: System MUST store embeddings in deer_embeddings table (orphaned until assigned to deer profile)
- **FR-008**: System MUST allow filtering photos by detection status (has deer, no deer, all)
- **FR-009**: System MUST display detection bounding boxes on photo view
- **FR-010**: System MUST allow users to correct AI classifications (false positives/negatives)
- **FR-011**: System MUST handle upload failures gracefully with retry capability
- **FR-012**: System MUST enforce storage quotas based on subscription tier

### Non-Functional Requirements

- **NFR-001**: Upload of 100 photos SHOULD complete in under 60 seconds on typical connection
- **NFR-002**: AI processing of a single photo SHOULD complete in under 5 seconds
- **NFR-003**: Photo grid SHOULD load first 50 thumbnails in under 2 seconds
- **NFR-004**: System SHOULD handle concurrent uploads from multiple users
- **NFR-005**: Embedding generation for a single detection SHOULD complete in under 10 seconds

### Key Entities

- **Image**: Uploaded photo with file reference, capture time, detection status, camera reference
- **Detection**: AI detection within an image (bounding box, classification, confidence score)

---

## Success Criteria

- **SC-001**: Users can upload a batch of 100+ photos without errors
- **SC-002**: AI correctly identifies deer presence in >85% of photos
- **SC-003**: Users can filter to "Has Deer" photos and see only relevant images
- **SC-004**: Users can correct AI misclassifications with one click
- **SC-005**: Background processing continues even if user navigates away
- **SC-006**: Photo grid displays smoothly without performance issues

---

## Assumptions

- Replicate API (MegaDetector or similar) is available and performant
- Replicate API provides deer re-identification embedding model
- Supabase Storage can handle expected photo volumes
- Users have stable enough internet for batch uploads
- Trigger.dev is available for background job processing

## Out of Scope

- Camera management and location assignment (future feature)
- Video file support (photos only for MVP)
- Direct integration with cellular camera APIs (manual upload only)
- Automatic folder sync or scheduled imports
- Advanced photo editing or cropping

## Dependencies

- `001-saas-foundation`: Authentication, database schema, user profiles
- Supabase Storage: Image file storage
- Replicate API: AI model for deer detection
- Trigger.dev: Background job processing
