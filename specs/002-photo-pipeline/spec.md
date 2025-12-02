# Feature Specification: Photo Pipeline

**Feature Branch**: `002-photo-pipeline`
**Created**: 2025-12-01
**Updated**: 2025-12-02
**Status**: Draft
**MVP Phase**: 2 (Photo Pipeline)
**Depends On**: `001-saas-foundation` (auth, database schema)

## Product Context

This feature implements **Phase 2** of the TineSight MVP as defined in the [Product Vision](../../.specify/memory/product-vision.md).

| Aspect | Summary |
|--------|---------|
| **Problem** | Hunting lease operators have 1000s of photos, 80%+ are empty/non-deer. They cannot track individual bucks across multiple sightings. |
| **This Feature** | Upload photos in bulk, AI detects deer, generates embeddings, and discovers matches to existing deer profiles |
| **Value Delivered** | Hours saved on manual photo sorting + foundation for buck re-identification (North Star metric) |
| **North Star Metric** | First Buck Re-Identified - AI matches a buck to existing catalog entry, user confirms |

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
5. **Given** an upload fails mid-batch (network error), **When** user returns, **Then** they can retry failed uploads without re-uploading successful files
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

### User Story 4 - Embedding Generation (Priority: P2)

Each detected deer generates a unique embedding vector for re-identification matching.

**Why this priority**: This is Stage 2 AI - the foundation for the core differentiator (buck re-identification). Embeddings enable matching the same deer across multiple photos.

**Independent Test**: Can be fully tested by uploading photos with deer, waiting for processing to complete, and verifying that detection records have associated embedding vectors stored.

**Acceptance Scenarios**:

1. **Given** a detection is created for a deer, **When** embedding generation runs, **Then** a 512-dimensional embedding vector is generated and stored
2. **Given** embedding generation completes, **When** user views a photo with detections, **Then** the system indicates the detection is ready for matching
3. **Given** embedding generation fails, **When** user views the detection, **Then** they see an error status with option to retry
4. **Given** a detection for a non-buck animal (doe, fawn), **When** embedding generation runs, **Then** embeddings are still generated (for future matching capabilities)

---

### User Story 5 - Match Discovery (Priority: P2)

System automatically finds similar deer from existing catalog and presents match candidates.

**Why this priority**: This delivers the core value proposition - "Is this the same buck I saw last week?" The AI finds similar deer so users don't have to remember.

**Independent Test**: Can be fully tested by uploading multiple photos of the same buck (from different angles/dates), creating a deer profile from the first, then uploading more photos and verifying the system suggests matches to the existing profile.

**Acceptance Scenarios**:

1. **Given** a new embedding is generated, **When** similar deer exist in the user's catalog, **Then** the system finds up to 5 closest matches using similarity search
2. **Given** match candidates are found, **When** user views the detection, **Then** they see "Possible matches" with thumbnail comparisons and similarity scores
3. **Given** no similar deer exist in catalog, **When** embedding is generated, **Then** the system shows "No matches - Create new deer profile?" option
4. **Given** match candidates exist, **When** similarity score is below threshold (70%), **Then** the candidate is still shown but marked as "Low confidence"
5. **Given** multiple photos in a batch have matches, **When** processing completes, **Then** user sees a summary "12 photos may match existing deer"

---

### User Story 6 - Match Confirmation (Priority: P2)

Users confirm or reject AI match suggestions before linking detections to deer profiles.

**Why this priority**: Human-in-the-loop is a constitutional requirement. Users must have final authority over deer identification. This builds trust and improves model accuracy.

**Independent Test**: Can be fully tested by uploading a photo with a detection that matches an existing deer, viewing the match suggestion, and confirming or rejecting it.

**Acceptance Scenarios**:

1. **Given** a detection with match candidates, **When** user views the match suggestion, **Then** they see side-by-side photo comparison (new detection vs existing deer)
2. **Given** a match suggestion, **When** user confirms "Yes, same deer", **Then** the detection is linked to the existing deer profile and deer's last_seen date is updated
3. **Given** a match suggestion, **When** user rejects "No, different deer", **Then** the candidate is marked as rejected and won't be suggested again for this detection
4. **Given** all candidates rejected, **When** user finishes review, **Then** system offers "Create new deer profile from this detection"
5. **Given** a confirmed match, **When** user views the deer profile, **Then** they see the newly linked detection photo in the deer's gallery
6. **Given** multiple match candidates, **When** user reviews them, **Then** they can quickly navigate between candidates and confirm the correct one

---

### User Story 7 - Filter and Retry Failed Photos (Priority: P3)

Users can filter photos by processing status and retry failed processing.

**Why this priority**: Error handling and recovery improves reliability. Users shouldn't lose photos due to transient processing failures.

**Independent Test**: Can be fully tested by simulating a processing failure, viewing the "Failed" filter, and successfully retrying the failed photo.

**Acceptance Scenarios**:

1. **Given** the photo grid, **When** user selects "Failed" filter, **Then** only photos with processing errors are shown
2. **Given** a failed photo, **When** user clicks "Retry", **Then** the photo is re-queued for processing
3. **Given** multiple failed photos, **When** user clicks "Retry All", **Then** all failed photos are re-queued for processing
4. **Given** a photo fails 3 times, **When** user views it, **Then** they see detailed error message and can still view the photo manually

---

### Edge Cases

- What happens if a photo is corrupted or unreadable? → Mark as error, show in "Failed" tab with specific error message
- What if AI processing service is unavailable? → Queue for retry with exponential backoff, show "Processing" status
- What if a photo is extremely large (50MB+)? → Resize before upload, warn user about file size
- What if user uploads duplicate photos? → Detect by hash, skip duplicates with notice
- What if processing takes longer than expected? → Show estimated time, allow background processing
- What if the same deer is detected in multiple photos within a batch? → Process each independently, let user confirm matches
- What if user deletes a deer profile that has matched detections? → Orphan the detections (keep embeddings for future matching)
- What if similarity search returns the same deer multiple times (from different embeddings)? → Deduplicate results by deer_id, show highest similarity score

---

## Requirements

### Functional Requirements

**Upload & Storage**
- **FR-001**: System MUST accept bulk image uploads via drag-and-drop
- **FR-002**: System MUST support common image formats (JPEG, PNG, HEIC, WebP)
- **FR-003**: System MUST show upload progress for individual files and overall batch
- **FR-004**: System MUST process uploads in background after initial upload completes
- **FR-005**: System MUST store images in user-isolated storage with RLS protection
- **FR-006**: System MUST handle upload failures gracefully with retry capability

**AI Detection (Stage 1)**
- **FR-007**: System MUST analyze each image for deer presence using AI
- **FR-008**: System MUST store detection results with bounding boxes and confidence scores
- **FR-009**: System MUST allow filtering photos by detection status (has deer, no deer, processing, failed)
- **FR-010**: System MUST display detection bounding boxes on photo view
- **FR-011**: System MUST allow users to correct AI classifications (false positives/negatives)

**Embedding & Matching (Stage 2)**
- **FR-012**: System MUST generate embedding vectors for each deer detection
- **FR-013**: System MUST store embeddings in database (orphaned until assigned to deer profile)
- **FR-014**: System MUST search for similar embeddings when new embedding is created
- **FR-015**: System MUST present match candidates to user with similarity scores
- **FR-016**: System MUST require user confirmation before linking detection to deer profile
- **FR-017**: System MUST update deer profile's last_seen date when match is confirmed

**Error Handling**
- **FR-018**: System MUST retry failed processing with exponential backoff (max 3 attempts)
- **FR-019**: System MUST show clear error messages for failed processing
- **FR-020**: System MUST allow manual retry of failed photos

### Non-Functional Requirements

- **NFR-001**: Upload of 100 photos SHOULD complete in under 60 seconds on typical connection
- **NFR-002**: AI detection of a single photo SHOULD complete in under 5 seconds
- **NFR-003**: Embedding generation SHOULD complete in under 10 seconds per detection
- **NFR-004**: Photo grid SHOULD load first 50 thumbnails in under 2 seconds
- **NFR-005**: Similarity search SHOULD return results in under 1 second
- **NFR-006**: System SHOULD handle concurrent uploads from multiple users

### Key Entities

- **Image**: Uploaded photo with file reference, capture time, detection status, camera reference
- **Detection**: AI detection within an image (bounding box, classification, confidence score, optional deer_id link)
- **Deer Embedding**: 512-dimensional vector associated with a detection, used for similarity matching
- **Match Candidate**: Potential match between a detection and existing deer profile (similarity score, confirmation status)
- **Processing Batch**: Group of photos uploaded together, tracks overall progress

---

## Success Criteria

### Measurable Outcomes

- **SC-001**: Users can upload a batch of 100+ photos without errors
- **SC-002**: AI correctly identifies deer presence in >85% of photos
- **SC-003**: Users can filter to "Has Deer" photos and see only relevant images
- **SC-004**: Users can correct AI misclassifications with one click
- **SC-005**: Background processing continues even if user navigates away
- **SC-006**: Photo grid displays smoothly without performance issues
- **SC-007**: When the same buck is photographed multiple times, the system suggests correct matches with >70% accuracy
- **SC-008**: Users can confirm or reject match suggestions in under 5 seconds per match
- **SC-009**: Confirmed matches update deer profile within 1 second
- **SC-010**: 80% of users who upload deer photos confirm at least one match within first session

---

## Assumptions

- Replicate API (MegaDetector) is available and performant for deer detection
- Replicate API provides suitable deer re-identification embedding model
- Supabase Storage can handle expected photo volumes (1000s per user per month)
- Users have stable enough internet for batch uploads
- Trigger.dev is available for background job processing
- pgvector extension provides efficient similarity search at expected scale
- Users will have at least 2-3 photos of the same buck to establish matching baseline

## Out of Scope

- Camera management and location assignment (future feature)
- Video file support (photos only for MVP)
- Direct integration with cellular camera APIs (manual upload only)
- Automatic folder sync or scheduled imports
- Advanced photo editing or cropping
- Deer profile management (covered in future 003-deer-catalog spec)
- Team member access to shared photos (uses existing RLS from 001)
- Training custom models on user-confirmed matches (future enhancement)

## Dependencies

- `001-saas-foundation`: Authentication, database schema (images, detections, deer, deer_embeddings tables), user profiles
- Supabase Storage: Image file storage with RLS
- Replicate API: AI models for detection and embedding generation
- Trigger.dev: Background job processing
- pgvector: Vector similarity search in database
