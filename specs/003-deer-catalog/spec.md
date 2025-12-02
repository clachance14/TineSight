# Feature Specification: Deer Catalog

**Feature Branch**: `003-deer-catalog`
**Created**: 2025-12-01
**Status**: Draft
**MVP Phase**: 3 (Deer Catalog)
**Depends On**: `002-photo-pipeline` (photos with detections)

## Product Context

This feature implements **Phase 3** of the TineSight MVP as defined in the [Product Vision](../../.specify/memory/product-vision.md).

| Aspect | Summary |
|--------|---------|
| **Problem** | Users can't track individual deer across photos without manual organization |
| **This Feature** | Create profiles for individual deer, name them, attach photos |
| **Value Delivered** | Organized catalog of identified deer on property |
| **Next Phase** | AI Re-identification (004) - automatic matching to catalog |

---

## User Scenarios & Testing

### User Story 1 - Create Deer Profile (Priority: P1)

Users can create a profile for an individual deer they've identified in their photos.

**Why this priority**: This is the foundation of the deer catalog. Users must be able to register deer they recognize before AI can help match them.

**Independent Test**: Can be fully tested by viewing a photo with a detected deer, clicking "Create Profile", entering a name, and verifying the deer appears in the Deer catalog page.

**Acceptance Scenarios**:

1. **Given** a photo with a detected deer, **When** user clicks on the detection, **Then** they see an option to "Create New Deer Profile"
2. **Given** the create profile flow, **When** user enters a name (e.g., "Split Brow"), **Then** a new deer profile is created with that photo as the primary image
3. **Given** a new deer profile, **When** creation completes, **Then** the detection is linked to that deer profile
4. **Given** a user creating a profile, **When** they optionally add notes, **Then** the notes are saved with the profile
5. **Given** a user creating a profile, **When** they leave the name blank, **Then** a placeholder name is assigned (e.g., "Buck #7")
6. **Given** multiple detections in one photo, **When** user creates profiles, **Then** each detection can be assigned to a different deer

---

### User Story 2 - View Deer Profile (Priority: P1)

Users can view a deer's profile with all associated photos and sighting history.

**Why this priority**: The profile page is where value accumulates. Users see their deer's history and can verify the catalog is accurate.

**Independent Test**: Can be fully tested by creating a deer with multiple photos attached, navigating to the Deer page, clicking on the deer, and verifying all photos appear in chronological order.

**Acceptance Scenarios**:

1. **Given** a deer profile exists, **When** user navigates to the Deer page, **Then** they see a grid of all deer profiles with primary photo and name
2. **Given** the deer grid, **When** user clicks on a deer, **Then** they see the full profile page
3. **Given** a deer profile page, **When** viewing the profile, **Then** user sees: name, primary photo, all associated photos in a gallery, first/last seen dates
4. **Given** a deer with multiple photos, **When** viewing the gallery, **Then** photos are sorted by capture date (newest first or oldest first, toggleable)
5. **Given** a deer profile, **When** user views sighting summary, **Then** they see total sighting count and date range
6. **Given** the deer grid, **When** many deer exist, **Then** user can search/filter by name

---

### User Story 3 - Edit Deer Profile (Priority: P1)

Users can update a deer's name, notes, and status.

**Why this priority**: Users need to refine their catalog as they learn more about the deer. Names may change, deer may be harvested.

**Independent Test**: Can be fully tested by opening a deer profile, changing the name, adding notes, changing status to "Harvested", and verifying changes persist.

**Acceptance Scenarios**:

1. **Given** a deer profile page, **When** user clicks "Edit", **Then** they can modify the deer's name
2. **Given** edit mode, **When** user changes the name and saves, **Then** the new name appears throughout the app
3. **Given** a deer profile, **When** user adds or edits notes, **Then** the notes are saved and visible on the profile
4. **Given** a deer profile, **When** user changes status to "Harvested", **Then** the deer is marked as harvested with the date
5. **Given** a deer profile, **When** user changes status to "Target", **Then** the deer is highlighted in lists/views
6. **Given** edit mode, **When** user selects a different primary photo, **Then** the new photo becomes the profile thumbnail

---

### User Story 4 - Attach Photos to Deer (Priority: P1)

Users can manually associate additional photos with an existing deer profile.

**Why this priority**: Before AI re-identification works well, users need to manually build up photo associations. This teaches the model and builds the catalog.

**Independent Test**: Can be fully tested by opening a photo with an unassigned detection, clicking the detection, selecting "Assign to Existing Deer", choosing a deer, and verifying the photo appears in that deer's gallery.

**Acceptance Scenarios**:

1. **Given** a photo with an unassigned detection, **When** user clicks the detection, **Then** they see options: "Create New Profile" or "Assign to Existing Deer"
2. **Given** "Assign to Existing Deer" selected, **When** user views the picker, **Then** they see a searchable list of existing deer with thumbnails
3. **Given** the deer picker, **When** user selects a deer, **Then** the detection is linked to that deer and the photo appears in the deer's gallery
4. **Given** a detection already assigned to a deer, **When** user views the detection, **Then** they see which deer it's assigned to with a link to the profile
5. **Given** a detection assigned incorrectly, **When** user clicks "Reassign", **Then** they can move it to a different deer or unassign it
6. **Given** a detection being assigned, **When** the system has AI suggestions, **Then** suggested matches appear at the top of the picker (Phase 4 integration)

---

### User Story 5 - Deer Catalog Overview (Priority: P1)

Users can see a summary of all deer on their property.

**Why this priority**: The catalog overview is what lease operators show to clients. It demonstrates property value.

**Independent Test**: Can be fully tested by creating 10+ deer profiles, navigating to the Deer page, and verifying the grid shows all deer with stats.

**Acceptance Scenarios**:

1. **Given** multiple deer profiles exist, **When** user views the Deer page, **Then** they see a grid of deer cards with thumbnail, name, and sighting count
2. **Given** the deer grid, **When** user applies status filter (Watching/Target/Harvested), **Then** only deer with that status are shown
3. **Given** the deer grid, **When** user sorts by "Most Recent Sighting", **Then** deer are ordered by last seen date
4. **Given** the deer grid, **When** user sorts by "Most Sightings", **Then** deer are ordered by total photo count
5. **Given** the deer catalog, **When** user views summary stats, **Then** they see: total deer count, buck count, active in last 30 days
6. **Given** no deer profiles exist, **When** user views the Deer page, **Then** they see an empty state with guidance to add their first deer

---

### Edge Cases

- What if user tries to delete a deer with many photos? (Confirm dialog, photos become unassigned)
- What if two deer profiles are actually the same deer? (Merge profiles feature - P2)
- What if a deer's antlers look different across seasons? (Notes for user, AI handles via embeddings)
- What if user wants to track does (not just bucks)? (Supported - "buck" is terminology, system handles any deer)

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST allow creating deer profiles with name and optional notes
- **FR-002**: System MUST assign a primary photo to each deer profile
- **FR-003**: System MUST display all photos associated with a deer in a gallery
- **FR-004**: System MUST track first seen and last seen dates automatically
- **FR-005**: System MUST allow editing deer name, notes, and status
- **FR-006**: System MUST support deer statuses: Watching (default), Target, Harvested
- **FR-007**: System MUST allow assigning photo detections to existing deer profiles
- **FR-008**: System MUST allow reassigning or unassigning detections
- **FR-009**: System MUST display deer catalog as a filterable, sortable grid
- **FR-010**: System MUST show deer sighting counts and date ranges
- **FR-011**: System MUST allow searching deer by name
- **FR-012**: System MUST enforce data isolation (users only see their own deer)

### Non-Functional Requirements

- **NFR-001**: Deer catalog page SHOULD load in under 2 seconds with 100 deer
- **NFR-002**: Deer profile page SHOULD load in under 2 seconds with 500 photos
- **NFR-003**: Search results SHOULD appear as user types (debounced)

### Key Entities

- **Deer**: Individual identified deer (name, notes, status, first_seen, last_seen, primary_photo)
- **Detection**: Links to deer profile via deer_id foreign key

---

## Success Criteria

- **SC-001**: Users can create, view, and edit deer profiles
- **SC-002**: Users can attach multiple photos to a single deer profile
- **SC-003**: Deer catalog displays accurate sighting counts and dates
- **SC-004**: Users can filter and sort the deer catalog
- **SC-005**: Users can search for deer by name
- **SC-006**: Deer status changes (Harvested) are tracked with dates

---

## Assumptions

- Users can visually recognize individual deer (especially bucks by antler pattern)
- Most users will have <200 deer profiles (performance optimization threshold)
- Photo-to-deer assignments are many-to-one (each detection belongs to one deer)

## Out of Scope

- AI-suggested deer matches (Phase 4: AI Re-identification)
- Merge duplicate deer profiles (P2 feature)
- Deer family relationships / lineage tracking
- Antler score calculations
- Age estimation
- Export/share deer catalog (future feature)

## Dependencies

- `001-saas-foundation`: Authentication, user profiles
- `002-photo-pipeline`: Photos with detections to assign
