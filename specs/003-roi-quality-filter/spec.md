# Feature Specification: ROI Selection & Quality Filtering

**Feature Branch**: `003-roi-quality-filter`
**Created**: 2025-12-02
**Status**: Draft
**Input**: User description: "ROI Selection Feature: Two-Stage Photo Quality Filtering - Add user-defined Region of Interest selection to improve deer re-identification quality"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Draw ROI Selection on Photo (Priority: P1)

As a hunting lease operator reviewing deer photos, I want to draw a box around the head and antlers area of a detected deer so that the system uses this specific region for identification instead of the full body.

**Why this priority**: The ROI selection is the foundational feature. Without the ability to define the identifying region (head + antlers), no quality filtering or improved embeddings are possible. This directly enables better buck re-identification accuracy.

**Independent Test**: Can be fully tested by uploading a photo with a detected deer, drawing a rectangle around the head/antlers area, and verifying the selection is saved and displayed correctly.

**Acceptance Scenarios**:

1. **Given** a photo with a MegaDetector detection displayed, **When** I click and drag on the photo, **Then** a rectangle is drawn following my cursor with visual feedback
2. **Given** I have drawn an ROI rectangle, **When** I release the mouse button, **Then** the ROI selection is displayed with distinct styling (different from the detection box)
3. **Given** I have an ROI selection displayed, **When** I click "Save ROI", **Then** the selection is persisted and associated with that detection
4. **Given** I have a saved ROI, **When** I return to the photo detail page, **Then** my previously saved ROI is displayed
5. **Given** I have a saved ROI, **When** I click "Clear ROI", **Then** the ROI is removed and I can draw a new one

---

### User Story 2 - Mark ROI as Reference (Priority: P2)

As a hunting lease operator, I want to mark certain ROI selections as "reference examples" so that the system knows what a good deer photo looks like for quality filtering.

**Why this priority**: Reference ROIs establish the "gold standard" for quality comparison. Without references, the system cannot automatically filter low-quality photos. This enables the learning/filtering system.

**Independent Test**: Can be tested by saving an ROI, toggling the "Mark as Reference" option, and verifying the reference status is persisted and the ROI is included in reference calculations.

**Acceptance Scenarios**:

1. **Given** I have a saved ROI on a detection, **When** I toggle "Mark as Reference" on, **Then** the ROI is flagged as a reference example
2. **Given** I have multiple detections with saved ROIs, **When** I mark some as references, **Then** only the marked ones are used for quality comparison
3. **Given** I have a reference ROI, **When** I toggle "Mark as Reference" off, **Then** the ROI is no longer used for quality comparison but remains saved
4. **Given** I have at least one reference ROI, **When** new photos are processed, **Then** the system can compare detections against my references

---

### User Story 3 - Regenerate Embedding from ROI (Priority: P2)

As a hunting lease operator, I want to regenerate the re-ID embedding using my selected ROI region so that the deer matching uses only the head and antlers (the identifying features) instead of the full body.

**Why this priority**: This directly improves re-identification accuracy by focusing embeddings on the distinguishing features. Equal priority with US2 as both are required for the full quality improvement system.

**Independent Test**: Can be tested by saving an ROI, clicking "Regenerate Embedding", and verifying a new embedding is generated from the cropped ROI region.

**Acceptance Scenarios**:

1. **Given** I have a saved ROI on a detection, **When** I click "Regenerate Embedding", **Then** the system triggers background processing to generate a new embedding
2. **Given** embedding regeneration is triggered, **When** processing completes, **Then** the old embedding is deleted and replaced with the new ROI-based embedding
3. **Given** a new embedding is generated from ROI, **When** match finding runs, **Then** the system uses the ROI-based embedding for similarity comparison
4. **Given** embedding regeneration fails, **When** I check the detection, **Then** I see an error message and the previous embedding (if any) is retained

---

### User Story 4 - Automatic Quality Filtering (Priority: P3)

As a hunting lease operator, I want the system to automatically filter out low-quality photos (distant deer, partial views, no visible antlers) so that I don't waste time reviewing poor photos and the system doesn't waste processing on them.

**Why this priority**: Quality filtering is the payoff feature that saves user time and processing costs. However, it depends on US1-US3 being implemented first to establish references and the comparison mechanism.

**Independent Test**: Can be tested by having at least one reference ROI, uploading new photos, and verifying that photos with low similarity to references are marked as low-quality and skipped for embedding generation.

**Acceptance Scenarios**:

1. **Given** I have reference ROIs saved, **When** new photos are processed through MegaDetector, **Then** each detection receives a quality score based on similarity to my references
2. **Given** a detection has a quality score below the low-quality threshold, **When** processing continues, **Then** embedding generation is skipped for that detection
3. **Given** a detection has a quality score above the high-quality threshold, **When** processing continues, **Then** embedding generation proceeds automatically
4. **Given** a detection has a quality score in the middle range, **When** processing continues, **Then** the detection is marked for manual review
5. **Given** fewer than 3 reference ROIs exist, **When** new photos are processed, **Then** all detections are marked for manual review (auto-filtering requires minimum 3 references)

---

### User Story 5 - Provide Quality Feedback (Priority: P3)

As a hunting lease operator, I want to provide feedback when rejecting a match so that the system can learn what types of photos to filter out in the future.

**Why this priority**: Feedback enables continuous improvement of the quality filtering system. This is enhancement-level priority as the core functionality works without it.

**Independent Test**: Can be tested by rejecting a match candidate and selecting a rejection reason from the provided options.

**Acceptance Scenarios**:

1. **Given** I am reviewing a match candidate, **When** I reject the match, **Then** I am prompted to select a rejection reason
2. **Given** rejection reasons are presented, **When** I select a reason (distant, partial view, no antlers, obstructed, wrong angle, blurry, other), **Then** my feedback is recorded
3. **Given** I select "other" as the reason, **When** prompted, **Then** I can optionally provide a text note
4. **Given** feedback is submitted, **When** the system processes new photos, **Then** feedback data is available for future filtering improvements

---

### Edge Cases

- What happens when a user tries to draw an ROI outside the detection bounding box? (Allow it - user may want to capture context)
- What happens when the ROI is extremely small (few pixels)? (Warn user but allow - they may have zoomed in)
- What happens when multiple detections exist on one photo? (Each detection has its own independent ROI)
- How does the system handle photos where MegaDetector found no deer? (ROI selection not available - no detection to attach to)
- What happens if all reference ROIs are deleted? (Quality filtering reverts to "manual review" for all new detections)
- What happens when embedding regeneration is triggered while previous processing is still running? (Queue the new request, don't duplicate)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to draw a rectangular region of interest on any photo with a detection
- **FR-002**: System MUST save ROI selections persistently, associated with the specific detection
- **FR-003**: System MUST display both the MegaDetector detection box and user-defined ROI with distinct visual styling
- **FR-004**: System MUST allow users to mark any saved ROI as a "reference" for quality comparison
- **FR-005**: System MUST allow users to trigger embedding regeneration from the ROI-cropped region
- **FR-006**: System MUST crop images to the ROI region before generating embeddings (when ROI exists)
- **FR-007**: System MUST compute a quality score for each detection based on similarity to reference ROIs
- **FR-008**: System MUST automatically skip embedding generation for detections below the low-quality threshold
- **FR-009**: System MUST automatically proceed with embedding generation for detections above the high-quality threshold
- **FR-010**: System MUST mark detections in the middle quality range for manual review
- **FR-011**: System MUST capture rejection feedback with categorized reasons when users reject match candidates
- **FR-012**: System MUST store quality feedback for future filtering improvements
- **FR-013**: System MUST require minimum 3 reference ROIs before activating auto-filtering; with fewer, all detections are marked for manual review
- **FR-014**: System MUST support touch input for ROI drawing on mobile devices

### Key Entities

- **Detection ROI**: User-defined region of interest for a detection, including coordinates (normalized), reference flag, and creator
- **Quality Score**: Numerical measure (0-1) indicating how similar a detection is to the user's reference ROIs
- **Quality Status**: Classification of a detection as high_quality, low_quality, or manual_review based on quality score
- **Quality Feedback**: User-provided rejection reason capturing why a photo/match was rejected, used for learning

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can draw and save an ROI selection in under 10 seconds
- **SC-002**: Users can mark an ROI as reference with a single action (one click/tap)
- **SC-003**: Embedding regeneration from ROI completes within 60 seconds of user request
- **SC-004**: System correctly identifies low-quality photos (distant, partial, no antlers) with 80% accuracy compared to user judgment
- **SC-005**: Low-quality photos are automatically filtered, reducing the number of photos requiring manual review by at least 40%
- **SC-006**: Re-identification accuracy improves by at least 20% when using ROI-based embeddings compared to full-body embeddings
- **SC-007**: 90% of users who upload deer photos successfully create at least one reference ROI within their first session
- **SC-008**: Quality feedback submission takes under 5 seconds per rejection
- **SC-009**: System processes quality scoring for new detections without adding more than 2 seconds to the detection pipeline
- **SC-010**: Mobile users can complete ROI selection with touch input as easily as desktop users (task completion rate within 10%)

## Clarifications

### Session 2025-12-02

- Q: Are reference ROIs per-user or shared globally? → A: Per-user only (development/training phase, current user trains their own model)
- Q: Minimum reference ROIs required before auto-filtering activates? → A: Minimum 3 references required
- Q: When regenerating embedding from ROI, replace or keep old? → A: Replace (delete old, keep only ROI-based embedding)

## Assumptions

- Reference ROIs are scoped per-user; each operator maintains their own quality baseline
- Users understand what "head and antlers" means for deer identification purposes
- The existing embedding model produces meaningful embeddings from cropped regions (not just full images)
- Quality scores based on embedding similarity correlate with human perception of photo quality
- Users will create enough reference ROIs (5-10) to enable meaningful quality filtering
- Initial quality thresholds (0.4 low, 0.7 high) can be adjusted based on user feedback
- The existing photo detail page can be extended to support ROI selection without major architectural changes
