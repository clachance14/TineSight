# Feature Specification: Gemini Deer Analysis Pipeline

**Feature Branch**: `005-gemini-deer-pipeline`
**Created**: 2025-12-09
**Status**: Draft
**Input**: User description: "Migrate from Replicate to Gemini for deer detection and re-identification. Create Gemini client, update detection pipeline to use vision analysis, and implement on-demand deer comparison for catalog matching."

## User Scenarios & Testing

### User Story 1 - Bulk Photo Analysis (Priority: P1)

Lease operators upload thousands of trail camera photos and need AI to automatically analyze each one, identifying which photos contain deer, extracting species/sex/point count, and storing head bounding boxes for later cropping.

**Why this priority**: This is the foundation of the entire pipeline. Without automatic photo analysis, users cannot build a deer catalog or perform matching. Every other feature depends on this.

**Independent Test**: Upload 10 photos (mix of deer, empty, and other wildlife). Verify each photo receives analysis results including deer presence, species, sex, and point count where applicable.

**Acceptance Scenarios**:

1. **Given** a user uploads a batch of trail camera photos, **When** the batch processing completes, **Then** each photo has analysis results stored (deer_present, deer_count, analysis_notes).

2. **Given** a photo contains a buck, **When** analysis completes, **Then** the system stores species (whitetail/mule_deer), sex (buck), antler_points count, age_class, distinguishing_features, and head bounding box coordinates.

3. **Given** a photo contains multiple deer, **When** analysis completes, **Then** the system creates separate detection records for each deer with individual attributes.

4. **Given** a photo contains no deer, **When** analysis completes, **Then** the photo is marked has_deer=false with deer_count=0.

5. **Given** the AI cannot determine certain attributes, **When** analysis completes, **Then** those fields are set to "unknown" rather than omitted.

---

### User Story 2 - Triage Dashboard (Priority: P2)

After bulk analysis, lease operators need to quickly filter and sort through results to find the trophy bucks worth cataloging. They want to filter by species, sex, and point count to focus on high-value deer.

**Why this priority**: Without filtering, users are overwhelmed by hundreds of photos. The triage dashboard is essential for making analysis results actionable.

**Independent Test**: After analyzing 100 photos, filter to show only bucks with 10+ points. Verify the filtered list shows only matching detections.

**Acceptance Scenarios**:

1. **Given** a batch has been analyzed, **When** the user views the triage dashboard, **Then** they see a summary showing total photos, deer count breakdown (bucks/does/unknown), and empty photo count.

2. **Given** analyzed photos exist, **When** the user clicks "10+ Points" filter, **Then** only detections with antler_points >= 10 are displayed.

3. **Given** filtered results are displayed, **When** the user clicks a detection, **Then** they see the full photo with the head crop highlighted.

4. **Given** empty photos exist in a batch, **When** the user clicks "Archive Empty Photos", **Then** all photos with has_deer=false are archived (hidden from default views).

---

### User Story 3 - Buck Catalog Building (Priority: P3)

Lease operators want to create named profiles for trophy bucks they want to track across the season. They select a detection and assign it a name, creating a catalog entry with that detection as the reference photo.

**Why this priority**: The deer catalog is the core value proposition - tracking individual deer over time. Without named profiles, there's nothing to match against.

**Independent Test**: Select a buck detection, click "Name Deer", enter "Big 12", and verify a new catalog entry appears with that name and the detection as reference.

**Acceptance Scenarios**:

1. **Given** a user views a buck detection, **When** they click "Name Deer", **Then** a modal appears with a name input field and optional notes field.

2. **Given** the user enters a name and clicks save, **When** the deer is created, **Then** a new deer profile exists with the name, notes, and that detection marked as is_reference=true.

3. **Given** a deer profile exists, **When** viewing the deer catalog, **Then** the deer appears with its reference photo head crop as the thumbnail.

4. **Given** a detection is already assigned to a deer, **When** viewing that detection, **Then** the "Name Deer" button is replaced with the assigned deer's name.

---

### User Story 4 - On-Demand Matching (Priority: P4)

Once a catalog exists, lease operators want to find which new detections might be the same deer they've already cataloged. They trigger a matching process that compares unassigned buck detections against the catalog.

**Why this priority**: This is the re-identification feature that differentiates TineSight - "This is the same buck from last week." Depends on having a catalog (P3).

**Independent Test**: With 3 named deer in catalog and 5 unassigned buck detections, trigger matching. Verify match candidates are created with AI reasoning.

**Acceptance Scenarios**:

1. **Given** the user has named deer in their catalog, **When** they click "Find Matches Against Catalog", **Then** the system compares all unassigned buck detections against catalog deer.

2. **Given** the comparison runs, **When** a match is found, **Then** a match candidate record is created with best_match deer_id, confidence score (0-100), and AI reasoning text.

3. **Given** multiple possible matches exist, **When** comparison completes, **Then** the system stores alternative possibilities with their confidence scores.

4. **Given** a detection doesn't match any catalog deer, **When** comparison completes, **Then** the detection is flagged as is_likely_new_deer=true.

---

### User Story 5 - Match Review UI (Priority: P5)

Lease operators review AI match suggestions and confirm, correct, or create new profiles. This human-in-the-loop step ensures accuracy and builds training data for future improvements.

**Why this priority**: AI suggestions require human confirmation before taking action on critical data (per constitution). Depends on matching (P4).

**Independent Test**: Review a match suggestion, confirm it's correct. Verify the detection is linked to the suggested deer and removed from the review queue.

**Acceptance Scenarios**:

1. **Given** match candidates exist, **When** the user opens match review, **Then** they see side-by-side comparison of new detection and suggested match with AI reasoning.

2. **Given** the user agrees with the AI suggestion, **When** they click "Confirm", **Then** the detection is linked to the suggested deer and added to its sighting history.

3. **Given** the user disagrees with the suggestion, **When** they select a different deer from dropdown and click "Correct", **Then** the detection is linked to their selected deer instead.

4. **Given** the detection is a new deer not in catalog, **When** the user enters a name and clicks "Create New", **Then** a new deer profile is created with this detection as reference.

5. **Given** the user is uncertain, **When** they click "Skip for Later", **Then** the match candidate remains pending for future review.

---

### User Story 6 - Pipeline Cleanup & Migration (Priority: P6)

The existing Replicate-based pipeline must be removed and replaced with the Gemini pipeline. All legacy detection data should be cleared for a fresh start.

**Why this priority**: Cleanup must happen after new pipeline is working to ensure no disruption. This is a one-time migration task.

**Independent Test**: After migration, verify no Replicate API calls occur and no legacy Trigger.dev jobs exist.

**Acceptance Scenarios**:

1. **Given** the Gemini pipeline is implemented, **When** migration runs, **Then** legacy Replicate jobs are deleted (detect-animals.ts, generate-embedding.ts, find-matches.ts, compute-quality.ts, regenerate-embedding.ts).

2. **Given** migration runs, **When** data cleanup executes, **Then** all existing detection, embedding, ROI, and match candidate records are removed.

3. **Given** migration completes, **When** a photo is uploaded, **Then** processing uses the new Gemini analysis job.

4. **Given** migration completes, **When** searching codebase, **Then** no references to Replicate client or models remain.

---

### Edge Cases

- What happens when Gemini API returns an error during batch processing?
  - Individual photo is marked as failed with error message; batch continues processing other photos

- What happens when a photo is too dark/blurry for reliable analysis?
  - System returns low confidence scores and analysis_notes explaining quality issues

- What happens when a user tries to name a deer with a name already in their catalog?
  - System warns user and suggests appending a number or choosing different name

- What happens when matching runs with an empty catalog?
  - System shows message "Add deer to your catalog first" and disables matching button

- What happens when a detection's head crop is partially out of frame?
  - System still stores available bounding box; UI clips to visible area

## Requirements

### Functional Requirements

- **FR-001**: System MUST analyze photos using Gemini vision API to detect deer presence
- **FR-002**: System MUST extract species (whitetail, mule_deer, elk, unknown), sex (buck, doe, fawn, unknown), antler points count, and age class from deer photos
- **FR-003**: System MUST store head bounding box coordinates for each detected deer
- **FR-004**: System MUST store AI confidence score (0-100) for each analysis
- **FR-005**: System MUST store distinguishing features description when available
- **FR-006**: Users MUST be able to filter detections by point count ranges (All, 10+, 8-9, 6-7, <6)
- **FR-007**: Users MUST be able to filter detections by sex (All, Bucks, Does, Unknown)
- **FR-008**: Users MUST be able to archive empty photos (has_deer=false) in bulk
- **FR-009**: Users MUST be able to create named deer profiles from detections
- **FR-010**: System MUST mark the originating detection as reference when creating deer profile
- **FR-011**: System MUST compare unassigned buck detections against catalog on user request
- **FR-012**: System MUST return match confidence, reasoning, and alternative possibilities
- **FR-013**: Users MUST be able to confirm, correct, or reject AI match suggestions
- **FR-014**: Users MUST be able to create new deer profiles directly from match review
- **FR-015**: System MUST remove legacy Replicate pipeline code during migration
- **FR-016**: System MUST clear existing detection data for fresh start

### Key Entities

- **Photo/Image**: Trail camera photo uploaded by user; has analysis status and results
- **Detection**: Individual deer detected within a photo; has species, sex, points, head bbox
- **Deer**: Named profile in user's catalog; has reference detection, sighting history
- **Match Candidate**: AI-suggested match between detection and catalog deer; has confidence and reasoning

## Success Criteria

### Measurable Outcomes

- **SC-001**: Users can process 1,000 photos in under 15 minutes of wall-clock time (single batch upload, measured from upload complete to all analyses stored)
- **SC-002**: Processing cost stays under $0.25 per 1,000 photos analyzed (Gemini API cost only; excludes storage and compute infrastructure)
- **SC-003**: Users can filter to high-point bucks (10+ points) in 2 clicks from any photos view
- **SC-004**: 80% of correct AI match suggestions are confirmed in 3 clicks or fewer
- **SC-005**: Users can build a catalog of 5+ named deer from a single batch upload
- **SC-006**: No Replicate dependencies remain in codebase after migration
- **SC-007**: Match review provides sufficient context (side-by-side photos, AI reasoning) for confident user decisions
