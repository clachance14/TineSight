# Feature Specification: Photo Location

**Feature Branch**: `010-photo-location`
**Created**: 2025-12-19
**Status**: Draft
**Input**: User description: "Add location data to photo uploads with Mapbox map picker, allowing users to specify where photos were taken"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Set Location During Upload (Priority: P1)

As a hunting lease operator uploading trail camera photos, I want to specify the location where photos were taken on a map, so I can track where deer are spotted on my property.

**Why this priority**: Location tagging is the core value proposition - without it, users cannot track deer locations across their property. This is the foundational functionality.

**Independent Test**: Can be fully tested by uploading photos, setting a pin location on the map, and verifying the location data is saved with the batch.

**Acceptance Scenarios**:

1. **Given** I have selected photos to upload, **When** I drop files onto the uploader, **Then** a location picker modal appears before upload begins
2. **Given** the location picker modal is open, **When** I click anywhere on the map, **Then** a pin is placed at that location
3. **Given** I have placed a pin on the map, **When** I enter an area name and click "Confirm Location", **Then** the modal closes and the location is associated with my upload
4. **Given** I have set a location, **When** the upload completes, **Then** all photos in the batch inherit the location data

---

### User Story 2 - Skip Location Setting (Priority: P1)

As a hunting lease operator who wants to quickly upload photos, I want the option to skip location tagging, so I can upload photos without being blocked when I do not know or care about the location.

**Why this priority**: Equal priority with P1 above - users must not be forced to set location. This prevents the feature from becoming a blocker.

**Independent Test**: Can be fully tested by uploading photos, clicking "Skip" in the location picker, and verifying upload proceeds normally with null location values.

**Acceptance Scenarios**:

1. **Given** the location picker modal is open, **When** I click "Skip - Upload without location", **Then** the modal closes and upload proceeds
2. **Given** I skipped location setting, **When** the upload completes, **Then** photos are saved with null location data

---

### User Story 3 - Filter Photos by Area (Priority: P2)

As a hunting lease operator viewing my photo library, I want to filter photos by the area where they were taken, so I can see all photos from a specific location on my property.

**Why this priority**: Filtering by area enables the primary use case of tracking deer by location. Depends on P1 to have location data to filter.

**Independent Test**: Can be fully tested by navigating to photos page, selecting an area from the dropdown, and verifying only photos from that area are displayed.

**Acceptance Scenarios**:

1. **Given** I have uploaded photos with location data, **When** I view the photos page, **Then** I see an "Area" filter dropdown containing my named areas
2. **Given** I select an area from the dropdown, **When** the filter is applied, **Then** only photos from batches with that area name are displayed
3. **Given** some photos have no location, **When** I select "No Area Assigned", **Then** only photos without location data are displayed
4. **Given** I have active area filter, **When** I select "All Areas", **Then** all photos are displayed regardless of location

---

### User Story 4 - Set Camera Direction (Priority: P3)

As a hunting lease operator setting photo location, I want to optionally specify which compass direction the camera was facing, so I have additional context about camera orientation.

**Why this priority**: This is enhancement information - useful but not essential for core functionality.

**Independent Test**: Can be fully tested by setting location with compass direction selected and verifying the direction is saved with the batch.

**Acceptance Scenarios**:

1. **Given** the location picker modal is open, **When** I click a compass direction button (N, NE, E, SE, S, SW, W, NW), **Then** that direction is selected and highlighted
2. **Given** I have selected a direction, **When** I click the same direction again, **Then** the selection is cleared
3. **Given** I confirm location with a direction selected, **When** viewing the batch data, **Then** the compass direction (0-360 degrees) is stored

---

### User Story 5 - Add Direction Notes (Priority: P3)

As a hunting lease operator setting photo location, I want to optionally add free-text notes about camera direction, so I can describe the camera orientation in my own words.

**Why this priority**: This is supplementary information for users who want more descriptive context.

**Independent Test**: Can be fully tested by setting location with direction notes and verifying the notes are saved with the batch.

**Acceptance Scenarios**:

1. **Given** the location picker modal is open, **When** I enter text in the direction notes field, **Then** the text is captured
2. **Given** I have entered direction notes, **When** I confirm location, **Then** the notes are saved with the batch

---

### Edge Cases

- What happens when the user closes the modal by clicking outside? The modal should be skipped (same as clicking "Skip").
- What happens when the user clicks the map without entering an area name? The "Confirm Location" button should remain disabled.
- What happens when the user selects multiple areas from different uploads? Each batch maintains its own independent location data.
- What happens when there are no areas to filter? The Area dropdown should not appear in the filters.
- How does the system handle very long area names? Area names should be stored as text without arbitrary length limits.
- What happens if the map fails to load due to network issues? Users should see a clear error state and still have the option to skip.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a location picker modal when users drop files onto the uploader
- **FR-002**: System MUST allow users to place a pin on an interactive map by clicking
- **FR-003**: System MUST allow users to move the pin by clicking a different location
- **FR-004**: System MUST require an area name before confirming a location
- **FR-005**: System MUST allow users to skip location setting and proceed with upload
- **FR-006**: System MUST save location data (latitude, longitude, area name) at the batch level
- **FR-007**: System MUST optionally capture compass direction (0-360 degrees)
- **FR-008**: System MUST optionally capture free-text direction notes
- **FR-009**: System MUST provide map style toggle between satellite and topographic views
- **FR-010**: System MUST display coordinates of the selected pin location
- **FR-011**: System MUST allow filtering photos by area name on the photos page
- **FR-012**: System MUST provide "No Area Assigned" filter option for photos without location
- **FR-013**: System MUST display the area filter dropdown only when at least one area exists
- **FR-014**: System MUST invalidate area cache when new uploads with location are completed
- **FR-015**: System MUST provide autocomplete suggestions from existing area names as user types, while allowing creation of new area names

### Key Entities

- **Processing Batch**: Represents a group of photos uploaded together. Extended with location fields: latitude, longitude, area name, compass direction, and direction notes. All photos in a batch share the same location.
- **Area Name**: User-defined label for a location (e.g., "North Ridge", "Creek Bottom"). Used for filtering and organization. Multiple batches can share the same area name.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can set a photo location in under 30 seconds (click map, enter name, confirm)
- **SC-002**: Users can skip location setting in under 3 seconds (single click)
- **SC-003**: 100% of photos in a batch inherit the batch's location data
- **SC-004**: Area filter returns accurate results - only photos from matching batches are displayed
- **SC-005**: Map loads and is interactive within 2 seconds on standard internet connection
- **SC-006**: Users can switch between satellite and topographic map views instantly

## Clarifications

### Session 2025-12-19

- Q: When a user enters an area name that already exists, should the system suggest/autocomplete existing names? → A: Autocomplete - show dropdown of existing area names as user types, allow new entries

## Assumptions

- **A-001**: Location is tied to batch (not individual photos or cameras) because cameras can move between uploads
- **A-002**: Mapbox is the mapping provider (requires user to have Mapbox access token)
- **A-003**: Default map center is US geographic center (Texas) at zoom level 4
- **A-004**: Compass directions are represented as 8 cardinal/intercardinal points (N, NE, E, SE, S, SW, W, NW)
- **A-005**: Coordinates are stored with 6 decimal places of precision (approximately 11cm accuracy)
- **A-006**: The location picker modal appears after file processing but before upload begins
