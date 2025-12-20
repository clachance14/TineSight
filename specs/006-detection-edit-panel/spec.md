# Feature Specification: Detection Editing Side Panel

**Feature Branch**: `006-detection-edit-panel`
**Created**: 2025-12-10
**Status**: Draft
**Input**: User description: "Add a side panel for editing detection data when clicking on a bounding box or detection card. Replace current ROI-on-click behavior with a data editing interface."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Edit Detection Classification (Priority: P1)

A hunting lease operator reviews AI-detected deer in their trail cam photos and corrects misclassified detections. The AI may incorrectly identify sex, antler point count, or age class, and the operator needs to fix these errors to maintain accurate deer catalog data.

**Why this priority**: Core feature - operators cannot trust their deer catalog if they cannot correct AI mistakes. This is the fundamental value proposition of the editing panel.

**Independent Test**: Can be fully tested by clicking a detection, editing any field, saving, and verifying the changes persist on page reload.

**Acceptance Scenarios**:

1. **Given** a photo with one or more deer detections, **When** the operator clicks on a bounding box, **Then** a side panel slides in from the right displaying the detection's current data.
2. **Given** the edit panel is open, **When** the operator changes the sex from "doe" to "buck" and clicks Save, **Then** the detection record updates and the panel shows a success indicator.
3. **Given** the edit panel is open, **When** the operator changes antler points from 6 to 8 and clicks Save, **Then** the new value persists and displays correctly.
4. **Given** the edit panel is open with unsaved changes, **When** the operator clicks the close button, **Then** the panel closes (no unsaved changes warning for MVP).

---

### User Story 2 - Delete False Positive Detection (Priority: P1)

A hunting lease operator encounters detections that are not actually deer (branches, shadows, other animals). They need to remove these false positives to keep their photo library accurate.

**Why this priority**: Equal priority with editing - false positives clutter the interface and waste operator time. Clean data is essential.

**Independent Test**: Can be fully tested by clicking a false positive detection, clicking Delete, confirming, and verifying it disappears from both the overlay and detection cards.

**Acceptance Scenarios**:

1. **Given** the edit panel is open for a detection, **When** the operator clicks the Delete button, **Then** a confirmation dialog appears asking "Delete this detection?"
2. **Given** the delete confirmation dialog is shown, **When** the operator confirms deletion, **Then** the detection disappears from the photo overlay and detection card list.
3. **Given** a detection has been deleted, **When** the operator views the same photo later, **Then** the deleted detection remains hidden (soft delete persists).

---

### User Story 3 - Click Detection Card to Edit (Priority: P2)

An operator reviewing multiple detections prefers to use the detection cards below the photo rather than clicking small bounding boxes. Clicking a card should open the same edit panel.

**Why this priority**: Usability enhancement - provides an alternative interaction path that may be easier for some users, especially on smaller screens.

**Independent Test**: Can be tested by clicking a detection card and verifying the same edit panel opens as when clicking the bounding box.

**Acceptance Scenarios**:

1. **Given** a photo with detection cards displayed below, **When** the operator clicks a detection card, **Then** the edit panel opens for that detection.
2. **Given** the edit panel is open from clicking a bounding box, **When** the operator clicks a different detection card, **Then** the panel switches to show that detection's data.

---

### User Story 4 - Add Distinguishing Features (Priority: P2)

An operator notices unique identifying marks on a deer that the AI mentioned or missed. They want to augment the distinguishing features text to help with future identification.

**Why this priority**: Enhances re-identification value but not critical for basic data correction workflow.

**Independent Test**: Can be tested by editing the distinguishing features text field and verifying it saves correctly.

**Acceptance Scenarios**:

1. **Given** the edit panel is open showing AI-generated distinguishing features "large body, dark antlers", **When** the operator appends ", notched right ear" and saves, **Then** the full text persists.
2. **Given** the edit panel is open with empty distinguishing features, **When** the operator adds "Drop tine on left side" and saves, **Then** the text is saved successfully.

---

### Edge Cases

- What happens when the operator clicks a detection while the panel is already open for a different detection? Panel content switches to new detection immediately.
- How does the system handle network errors during save? Show error message, keep panel open with data, allow retry.
- What happens if the detection no longer exists when saving? Show "detection no longer exists" message and close panel.
- How does the panel behave on mobile/narrow screens? Panel becomes full-width overlay.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a side panel when a user clicks on a detection bounding box
- **FR-002**: System MUST display the same side panel when a user clicks on a detection card
- **FR-003**: Side panel MUST show a cropped thumbnail of the detection area
- **FR-004**: Side panel MUST allow editing of sex (buck/doe/fawn/unknown dropdown)
- **FR-005**: Side panel MUST allow editing of antler points (number input, 0-30 range)
- **FR-006**: Side panel MUST allow editing of age class (young/mature/old/unknown dropdown)
- **FR-007**: Side panel MUST allow editing of species (whitetail/mule_deer/elk/unknown dropdown)
- **FR-008**: Side panel MUST allow editing of distinguishing features (text area)
- **FR-009**: Side panel MUST have an explicit Save button to persist changes
- **FR-010**: Side panel MUST have a Delete button that triggers a confirmation dialog
- **FR-011**: System MUST soft-delete detections (hide from views, retain in database)
- **FR-012**: System MUST filter out soft-deleted detections from all normal views
- **FR-013**: Side panel MUST have a close button (X) to dismiss
- **FR-014**: System MUST remove ROI selection UI from the current click behavior

### Key Entities

- **Detection**: AI-detected deer instance within a photo. Key attributes: sex, antler_points, age_class, species, distinguishing_features, confidence, deleted_at (for soft delete)
- **Photo/Image**: Container for detections. One photo may have multiple detections.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Operators can correct a detection classification in under 30 seconds (click, edit, save)
- **SC-002**: Operators can delete a false positive in under 10 seconds (click, delete, confirm)
- **SC-003**: 100% of detection edits persist correctly across page reloads
- **SC-004**: Deleted detections remain hidden from all normal views indefinitely
- **SC-005**: Panel opens within 500ms of clicking a detection
- **SC-006**: Both bounding box clicks and detection card clicks open the same editing experience

## Assumptions

- Operators have already uploaded photos and AI has processed them (detections exist)
- The existing detection data model supports all editable fields
- Users understand dropdown options (sex, age class, species values)
- Network connectivity is generally reliable (offline editing not in scope)
- ROI selection functionality will be re-added in a future phase if needed

## Out of Scope

- ROI (Region of Interest) selection UI (removed, may return in Phase 2)
- Deer profile linking/creation (Phase 2 feature)
- Restoring deleted detections (Phase 2 feature)
- Batch editing multiple detections at once
- Undo/redo functionality
- Offline editing capability
