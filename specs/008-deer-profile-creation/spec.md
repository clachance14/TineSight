# Feature Specification: Deer Profile Creation

**Feature Branch**: `008-deer-profile-creation`
**Created**: 2025-12-12
**Status**: Draft
**Input**: User description: "Enable users to create a deer profile from a reference detection and then view/manage that deer profile in a dedicated detail page"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create Deer Profile from Detection (Priority: P1)

A hunting lease operator is reviewing trail camera photos and spots a notable buck. They want to start tracking this deer across future sightings by creating a profile for it.

**Why this priority**: This is the core action that enables the entire deer tracking feature. Without the ability to create deer profiles from detections, users cannot begin building their buck catalog. This directly supports the product's north star metric of "First Buck Re-Identified."

**Independent Test**: Can be fully tested by uploading a photo with a detected buck, selecting the detection, clicking "Create Deer Profile", entering a name, and verifying the deer profile is created and accessible.

**Acceptance Scenarios**:

1. **Given** a photo with a detected buck that is not yet assigned to any deer profile, **When** the user selects the detection and clicks "Create Deer Profile", **Then** a modal appears allowing them to enter a name and optional notes for the deer.

2. **Given** the Create Deer Profile modal is open with a valid name entered, **When** the user submits the form, **Then** a new deer profile is created with the selected detection as the reference image, and the user is redirected to the deer detail page.

3. **Given** a photo with a detected buck that is already assigned to a deer profile, **When** the user views the detection, **Then** the "Create Deer Profile" option is not available (the deer is already being tracked).

4. **Given** a photo with a detection classified as something other than a buck (e.g., doe, turkey, vehicle), **When** the user views the detection, **Then** the "Create Deer Profile" option is not available.

---

### User Story 2 - View Deer Profile Detail Page (Priority: P1)

After creating a deer profile, the user wants to view the deer's information and see all sightings (photos where this deer has been detected).

**Why this priority**: This completes the create-and-view cycle. Without a detail page, creating profiles provides no value since users can't review them. This story is co-equal with P1 creation.

**Independent Test**: Can be fully tested by navigating directly to a deer profile URL and verifying that the deer's name, notes, reference photo, and sightings are displayed.

**Acceptance Scenarios**:

1. **Given** a deer profile exists, **When** the user navigates to the deer detail page, **Then** they see the deer's name, optional notes, and the reference detection thumbnail.

2. **Given** a deer profile has multiple sightings (detections linked to it), **When** the user views the deer detail page, **Then** they see a grid of sighting thumbnails with capture dates, each linking back to the source photo.

3. **Given** a deer profile exists with only the reference detection, **When** the user views the deer detail page, **Then** they see the reference detection and a message indicating no additional sightings have been recorded yet.

---

### User Story 3 - Edit Deer Profile Information (Priority: P2)

A user wants to update the name or notes of an existing deer profile (e.g., they initially named it "Big Buck" but later want to call it "12-Point Charlie").

**Why this priority**: Editing is a secondary action that improves usability but isn't required for the core tracking workflow.

**Independent Test**: Can be fully tested by navigating to a deer detail page, editing the name/notes fields, saving, and verifying the changes persist.

**Acceptance Scenarios**:

1. **Given** the user is viewing a deer detail page, **When** they click an edit control, **Then** they can modify the deer's name and notes.

2. **Given** the user has modified the deer's name and/or notes, **When** they save the changes, **Then** the updated information is persisted and displayed on the page.

3. **Given** the user is editing a deer profile, **When** they try to save without a name (empty name field), **Then** validation prevents saving and shows an error message.

---

### User Story 4 - Navigate from Deer Catalog to Deer Detail (Priority: P2)

A user browsing the deer catalog wants to quickly access a specific deer's detail page to review its sightings.

**Why this priority**: Improves navigation flow but users can still access deer profiles via direct links from photo detections.

**Independent Test**: Can be fully tested by navigating to the deer catalog page and clicking on a deer card to reach its detail page.

**Acceptance Scenarios**:

1. **Given** the user is on the deer catalog page, **When** they click on a deer card, **Then** they are navigated to that deer's detail page.

---

### Edge Cases

- What happens when a user tries to create a deer profile with a name that already exists in their catalog? System allows duplicate names (names are descriptive labels, not unique identifiers).
- What happens if the reference detection's source photo is deleted? The deer profile remains but displays a placeholder for the missing reference image.
- What happens when viewing a deer detail page for a deer that doesn't exist or belongs to another account? System shows a "Deer not found" error and the user cannot access profiles they don't own.
- What happens if a user tries to create a deer profile while offline? The system shows an error indicating the operation requires connectivity.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to create a deer profile by selecting an unassigned buck detection and providing a name.
- **FR-002**: System MUST associate the selected detection as the "reference detection" for the new deer profile.
- **FR-003**: System MUST mark the reference detection as linked to the deer profile (preventing duplicate profile creation from the same detection).
- **FR-004**: System MUST redirect users to the deer detail page after successful profile creation.
- **FR-005**: System MUST provide a dedicated deer detail page displaying the profile's name, notes, reference image, and sightings count.
- **FR-006**: System MUST display sightings (linked detections) on the deer detail page as a paginated visual grid (20 per page) with thumbnails and capture dates.
- **FR-007**: System MUST allow users to navigate from a sighting thumbnail to the source photo's detail page.
- **FR-008**: System MUST allow users to edit the name and notes of an existing deer profile.
- **FR-009**: System MUST only show the "Create Deer Profile" option for buck detections that are not already assigned to a deer.
- **FR-010**: System MUST enforce data isolation so users can only view and manage deer profiles within their own account.
- **FR-011**: System MUST validate that deer profile names are non-empty before saving.
- **FR-012**: System MUST allow users to navigate from the deer catalog to individual deer detail pages.

### Key Entities

- **Deer Profile**: Represents a tracked buck with a name, optional notes, and a reference detection. Has multiple sightings over time.
- **Detection**: A region in a photo identified as containing an animal. Can be linked to a deer profile (as reference or sighting). Has classification (buck, doe, etc.).
- **Sighting**: A detection that has been linked to a specific deer profile, representing an observation of that deer at a specific time and location.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create a deer profile from a detection in under 30 seconds (from clicking "Create Deer Profile" to viewing the new deer detail page).
- **SC-002**: 100% of deer profiles display their reference detection thumbnail and all linked sightings on the detail page.
- **SC-003**: Users can navigate from any sighting on a deer detail page to the source photo in one click.
- **SC-004**: Users attempting to access deer profiles they don't own receive appropriate access denied feedback (no data leakage).
- **SC-005**: System maintains data consistency: every deer profile has exactly one reference detection, and every linked detection appears in its deer's sightings.

## Assumptions

- The detection classification system reliably identifies "buck" vs other animal types, making the "Create Deer Profile" CTA conditional on classification.
- The existing API endpoints (`POST /api/deer`, `GET /api/deer/[id]`, `PATCH /api/deer/[id]`) function correctly with minor alignment to the database schema.
- Users understand that creating a deer profile is the first step to tracking a buck across multiple sightings (future AI re-identification will automatically link new sightings).
- The notes field is optional and free-form text (no structured metadata required for V1).
- Duplicate deer names are allowed since users may have multiple deer with similar descriptions.

## Scope Boundaries (Out of Scope for V1)

- Manually adding additional detections/photos to an existing deer profile (automatic re-identification will handle this).
- Deleting deer profiles (can be added later).
- Bulk operations on deer profiles.
- Exporting deer profile data.
- Sharing deer profiles with other users.

## Clarifications

### Session 2025-12-12

- Q: How should the sightings grid handle large numbers of sightings? → A: Paginate (show 20 per page with navigation)
