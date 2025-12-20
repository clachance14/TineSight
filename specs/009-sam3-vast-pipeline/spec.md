# Feature Specification: SAM3 Vast Pipeline

**Feature Branch**: `009-sam3-vast-pipeline`
**Created**: 2025-12-12
**Status**: Draft
**Input**: User description: "Replace Gemini detection with SAM3-powered detection pipeline running on Vast.ai GPU worker"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Accurate Deer Detection from Trail Cam Photos (Priority: P1)

As a hunting lease operator, I want deer detection to accurately identify all deer in my trail camera photos so that I don't miss any bucks in crowded scenes.

**Why this priority**: Detection accuracy is the foundation of the entire TineSight product. If deer are missed, the buck catalog will be incomplete and users lose trust. The current detection struggles with multiple deer in a single frame.

**Independent Test**: Upload a batch of 10 photos containing single and multiple deer, verify all deer are detected with bounding boxes visible in the UI.

**Acceptance Scenarios**:

1. **Given** a photo with a single deer, **When** the photo is processed, **Then** the system detects the deer with a confidence score and bounding box
2. **Given** a photo with 5 deer in frame, **When** the photo is processed, **Then** all 5 deer are detected as separate instances with individual bounding boxes
3. **Given** a photo with no deer (empty scene or other wildlife), **When** the photo is processed, **Then** the system correctly indicates no deer present
4. **Given** a photo with a partially visible deer (cropped at edge), **When** the photo is processed, **Then** the deer is still detected if enough body is visible

---

### User Story 2 - Antler Box Detection for Buck Identification (Priority: P1)

As a hunting lease operator, I want the system to detect antler regions on bucks so that future re-identification can use antler characteristics.

**Why this priority**: Antler detection is essential for buck re-identification (the north star metric). Without antler region data, the system cannot compare antler patterns across sightings.

**Independent Test**: Upload photos of bucks with visible antlers, verify antler bounding boxes appear in detection results.

**Acceptance Scenarios**:

1. **Given** a photo of a buck with clearly visible antlers, **When** processed, **Then** both deer bounding box and antler bounding box are stored
2. **Given** a photo of a doe (no antlers), **When** processed, **Then** deer bounding box is stored but no antler box
3. **Given** a photo of a buck with antlers partially obscured by vegetation, **When** processed, **Then** antler detection includes visible portions with appropriate confidence score

---

### User Story 3 - Batch Processing of Photo Uploads (Priority: P2)

As a hunting lease operator, I want to upload batches of photos and have them all processed automatically so I can quickly build my deer catalog.

**Why this priority**: Operators deal with thousands of photos per season. Manual one-by-one processing is impractical. Batch processing enables the volume-handling TineSight promises.

**Independent Test**: Upload a batch of 50 photos, verify all complete processing within expected timeframe with progress visible.

**Acceptance Scenarios**:

1. **Given** a batch of 50 photos uploaded, **When** upload completes, **Then** all photos enter processing queue automatically
2. **Given** photos in processing queue, **When** I view the dashboard, **Then** I can see progress (pending, processing, completed counts)
3. **Given** a batch of 100 photos, **When** processed, **Then** all complete within 15 minutes under normal conditions

---

### User Story 4 - Viewing Detection Results (Priority: P2)

As a hunting lease operator, I want to view detection results for my photos showing deer locations and confidence scores so I can verify accuracy.

**Why this priority**: Users need visibility into what the AI detected. This builds trust and allows them to identify photos that may need manual review.

**Independent Test**: View a processed photo, verify deer bounding boxes and confidence scores are displayed.

**Acceptance Scenarios**:

1. **Given** a processed photo with detections, **When** I view photo details, **Then** deer bounding boxes are overlaid on the image
2. **Given** a processed photo with a buck, **When** I view photo details, **Then** antler bounding box is visible (if detected)
3. **Given** detection results, **When** displayed, **Then** confidence scores are shown for each detection

---

### User Story 5 - Processing Failure Recovery (Priority: P3)

As a hunting lease operator, I want failed photo processing to be retryable so I don't lose data due to temporary issues.

**Why this priority**: External services can have temporary outages. Users should be able to recover from failures without re-uploading photos.

**Independent Test**: Simulate a processing failure, verify the photo can be retried and eventually succeeds.

**Acceptance Scenarios**:

1. **Given** a photo that failed processing, **When** I view the photo, **Then** I see failure status with retry option
2. **Given** a failed photo, **When** I click retry, **Then** the photo re-enters the processing queue
3. **Given** a transient failure, **When** retried, **Then** processing succeeds and results appear normally

---

### Edge Cases

- What happens when the detection service is temporarily unavailable?
  - Photos are marked as failed after 60-second timeout with user-friendly message explaining the issue; user can retry later
- How does the system handle very large images (>10MB)?
  - Images are processed as-is; the detection service handles resizing internally
- What happens when a photo contains deer but they are very small/distant?
  - Detection confidence scores will be lower; user sees lower-confidence results
- How does the system handle corrupted or invalid image files?
  - Files that cannot be read are marked as failed with appropriate error message
- What happens when many photos are uploaded simultaneously by multiple users?
  - Processing queue handles concurrent requests; each user's photos process independently

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect deer in uploaded photos with bounding box coordinates
- **FR-002**: System MUST detect antler regions on bucks with separate bounding box coordinates
- **FR-003**: System MUST assign confidence scores to each deer detection
- **FR-004**: System MUST assign confidence scores to each antler detection
- **FR-005**: System MUST process photos automatically upon batch upload completion
- **FR-006**: System MUST track processing status for each photo (pending, processing, completed, failed)
- **FR-007**: System MUST store detection results persistently for later retrieval
- **FR-008**: System MUST allow users to retry failed photo processing
- **FR-009**: System MUST handle photos with multiple deer (0 to 10+ instances per photo)
- **FR-010**: System MUST complete processing within 30 seconds per photo under normal conditions
- **FR-011**: System MUST display detection bounding boxes overlaid on photos in the UI (filtered to confidence >= 0.3)
- **FR-012**: System MUST record which detection method was used for each photo (for audit/debugging)
- **FR-013**: System MUST support switching between detection methods via environment variable at deployment time (feature flag)
- **FR-014**: System MUST monitor GPU worker health status via live listener (not static polling) before dispatching work
- **FR-015**: System MUST wait for GPU worker to report ready status before processing photos during cold start

### Key Entities

- **Detection**: A detected deer instance within a photo, including bounding box coordinates (pixel values), confidence score, and optionally antler bounding box with its confidence score
- **Processing Status**: The current state of photo analysis (pending, processing, completed, failed) with timestamps and error information if applicable
- **Analysis Source**: Identifier for which detection method produced results, enabling comparison and debugging across detection versions
- **Worker Status**: Live health state of the GPU processing worker (cold, warming, ready, error) monitored via listener pattern

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: System detects deer with 90%+ recall on photos where deer are present and reasonably visible (not tiny/distant)
- **SC-002**: System achieves less than 5% false positive rate on photos without deer
- **SC-003**: Batch processing of 100 photos completes within 15 minutes
- **SC-004**: Individual photo processing completes within 30 seconds on average
- **SC-005**: Users can view detection results for processed photos within 2 seconds of page load
- **SC-006**: Antler regions are detected on 80%+ of photos where antlers are clearly visible
- **SC-007**: Processing failure rate is below 2% for valid image files
- **SC-008**: Failed photos can be retried with a single click, and 95% of retries succeed

## Assumptions

- Users upload standard trail camera image formats (JPEG, PNG)
- Photos are taken from typical trail camera distances (10-50 feet)
- Deer in photos are reasonably visible (not completely obscured)
- Users have modern browsers capable of displaying image overlays
- Internet connectivity is stable enough to upload photos and receive results
- The GPU processing service will have acceptable uptime (95%+)
- No batch size limits enforced during development (to be configured for production)

## Clarifications

### Session 2025-12-12

- Q: What happens to existing Gemini detections when SAM3 is deployed? → A: Feature flag - Use environment variable to switch between Gemini/SAM3 at deployment time
- Q: Is there a maximum batch size limit for photo uploads? → A: No limit for development; configurable later for production
- Q: How should low-confidence detections be handled? → A: Store all detections; filter UI display at confidence >= 0.3
- Q: How long should the system wait before timing out a GPU worker request? → A: 60 seconds; show user message explaining why processing failed or is delayed
- Q: How should GPU worker cold starts be handled? → A: Health check with live status monitoring (listener pattern); no static waiting

## Dependencies

- External GPU processing service must be operational and accessible
- Image storage service must be available for signed URL generation
- Background job processing system must be running
- Database must support storing bounding box coordinates efficiently
