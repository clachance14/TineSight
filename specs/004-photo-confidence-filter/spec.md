# Feature Specification: Photo Confidence Filter

**Feature Branch**: `004-photo-confidence-filter`
**Created**: 2025-12-07
**Status**: Draft
**Input**: User description: "Add photo confidence filter to hide low-quality and no-deer photos"

## Clarifications

### Session 2025-12-07

- Q: Should filter settings be encoded in the URL so users can bookmark or share filtered views? → A: Hybrid - Session memory for normal use + optional "Copy link" button to share current filters

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Filter Low-Confidence Photos (Priority: P1)

As a hunting lease operator, I want to automatically hide photos where AI detection confidence is below my chosen threshold, so I can focus on reviewing high-quality deer photos without wading through uncertain detections.

**Why this priority**: This is the core value proposition. Operators deal with thousands of photos and need to quickly find trophy bucks. Filtering out low-confidence detections dramatically reduces noise and saves time.

**Independent Test**: Can be fully tested by uploading photos with varying detection confidence levels and verifying that only photos meeting the threshold appear in the filtered view.

**Acceptance Scenarios**:

1. **Given** I am viewing my photo gallery, **When** I set the confidence threshold slider to 60%, **Then** only photos where at least one detection has 60%+ confidence are displayed
2. **Given** the confidence filter is set to 50%, **When** a photo has multiple detections (one at 40%, one at 70%), **Then** the photo is shown because one detection exceeds the threshold
3. **Given** the confidence filter is active, **When** I adjust the slider from 50% to 80%, **Then** the photo list immediately updates to reflect the new threshold

---

### User Story 2 - Default Quality View (Priority: P1)

As a hunting lease operator, I want filters to be ON by default when I open the photo gallery, so I immediately see a clean view of quality deer photos without manual setup.

**Why this priority**: First-time and returning users should see value immediately. A cluttered view with empty photos and low-confidence detections creates a poor first impression and frustration.

**Independent Test**: Can be fully tested by logging in and navigating to the photos page, verifying filters are pre-applied.

**Acceptance Scenarios**:

1. **Given** I am a logged-in user, **When** I navigate to the Photos page, **Then** the "Has Deer" filter is ON and confidence threshold is set to 50%
2. **Given** default filters are active, **When** I view the photo count, **Then** it shows the filtered count (not total count)
3. **Given** default filters are applied, **When** I want to see all photos, **Then** I can easily disable filters using clear controls

---

### User Story 3 - Adjustable Confidence Threshold (Priority: P2)

As a hunting lease operator, I want to adjust the confidence threshold using a slider control, so I can fine-tune filtering based on my current needs (strict for final review, relaxed for initial triage).

**Why this priority**: Different tasks require different confidence levels. Initial sorting might use 30% to catch marginal photos, while client presentations need 80%+ for certainty.

**Independent Test**: Can be fully tested by adjusting the slider and verifying the photo list updates accordingly.

**Acceptance Scenarios**:

1. **Given** I am viewing the filter panel, **When** I look at the confidence filter, **Then** I see a slider ranging from 0% to 100%
2. **Given** the slider is at 50%, **When** I drag it to 75%, **Then** the displayed percentage updates in real-time and photos filter accordingly
3. **Given** I want precise control, **When** I use the slider, **Then** it moves in 5% increments for easy targeting of common thresholds

---

### User Story 4 - Toggle Filter On/Off (Priority: P2)

As a hunting lease operator, I want to quickly enable or disable the confidence filter without losing my threshold setting, so I can compare filtered vs unfiltered views.

**Why this priority**: Users often need to toggle filters to verify they haven't missed important photos. Preserving settings reduces friction in this common workflow.

**Independent Test**: Can be fully tested by toggling the filter on/off and verifying the threshold value persists.

**Acceptance Scenarios**:

1. **Given** confidence filter is ON at 60%, **When** I toggle it OFF, **Then** all photos appear regardless of confidence
2. **Given** confidence filter is OFF, **When** I toggle it ON, **Then** my previous threshold (60%) is restored
3. **Given** the filter is OFF, **When** I view the active filters summary, **Then** confidence filter is not listed

---

### User Story 5 - Active Filter Visibility (Priority: P3)

As a hunting lease operator, I want to clearly see which filters are active and their values, so I always know why certain photos are hidden.

**Why this priority**: Transparency prevents confusion. Users must understand why they're seeing a subset of photos to trust the system.

**Independent Test**: Can be fully tested by applying filters and verifying the active filter chips display correctly.

**Acceptance Scenarios**:

1. **Given** confidence filter is active at 50%, **When** I look at the filter summary, **Then** I see a chip showing "Confidence: >=50%"
2. **Given** multiple filters are active, **When** I view the filter count badge, **Then** it accurately reflects the number of active filters
3. **Given** a filter chip is displayed, **When** I click its X button, **Then** that specific filter is removed

---

### Edge Cases

- **Photos with no detections**: When confidence filter is active, photos with zero detections are hidden (no detection = no detection above threshold)
- **Detections with null confidence**: Treated as 0% confidence; filtered out when any threshold > 0 is set
- **Empty filtered results**: When filter settings result in zero matching photos, display a helpful message explaining why and suggesting filter adjustments
- **Combined filters**: When both "Has Deer" AND confidence filters are active, both conditions must be satisfied for a photo to appear
- **Performance with large photo sets**: Filtering should remain responsive with 10,000+ photos

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a confidence threshold slider in the photo filter panel
- **FR-002**: System MUST allow users to set confidence threshold between 0% and 100% in 5% increments
- **FR-003**: System MUST filter photos using "any detection" logic - show photo if ANY detection meets or exceeds the threshold
- **FR-004**: System MUST apply default filters on page load: "Has Deer" = true, confidence threshold = 50%
- **FR-005**: System MUST allow users to toggle the confidence filter on/off without losing the threshold value
- **FR-006**: System MUST display active filter count and individual filter chips showing current settings
- **FR-007**: System MUST update the photo list immediately when filter settings change
- **FR-008**: System MUST treat null confidence values as 0% for filtering purposes
- **FR-009**: System MUST exclude photos with no detections when confidence filter is active
- **FR-010**: System MUST allow users to clear all filters and see all photos
- **FR-011**: System MUST provide a "Copy link" button that generates a shareable URL encoding current filter settings
- **FR-012**: System MUST restore filter settings when loading a page from a shared filter URL

### Key Entities

- **Photo (Image)**: A trail camera photo that may contain zero or more animal detections
- **Detection**: An AI-identified region in a photo with a confidence score (0-1) indicating certainty
- **Filter Settings**: User preferences for which photos to display, including status, deer detection, quality status, and confidence threshold

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can adjust confidence threshold in under 2 seconds
- **SC-002**: Photo list updates within 1 second after filter change
- **SC-003**: Default filters reduce initial photo count by at least 40% compared to unfiltered view (for typical photo sets with mixed content)
- **SC-004**: 95% of users can locate and use the confidence filter without documentation
- **SC-005**: Users report at least 30% time savings when reviewing photos with filters vs. manual scrolling through all photos
- **SC-006**: Filter state persists correctly across page navigations within the same session; shared filter links restore exact filter state when opened

## Assumptions

- AI detection confidence scores are already stored in the database (0-1 scale)
- Users have photos with varying detection confidence levels to filter
- The existing filter UI pattern (status, deer detection, quality status) provides a foundation to extend
- Users understand that higher confidence = more certain the AI detected an animal
- Default 50% threshold balances showing quality photos while not being overly restrictive
