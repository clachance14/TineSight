# Feature Specification: Trophy Fingerprint

**Feature Branch**: `011-trophy-fingerprint`
**Created**: 2025-12-21
**Updated**: 2025-12-26
**Status**: Draft
**Input**: User description: "Add AI-powered B&C scoring and antler fingerprinting for trophy bucks. When a detection is classified as trophy, auto-trigger detailed scoring. Generate an 'Antler Print' fingerprint based on measurements and ratios. Use prints to enhance deer matching, cluster unassigned trophy detections, scan for matches after deer creation, and provide a trophy dashboard with batch operations. Display both similarity scores AND full measurements to users."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trophy Buck Gets Scored and Fingerprinted (Priority: P1)

When a photo is analyzed and a buck is classified as "trophy" tier, the system automatically generates a detailed B&C score and antler fingerprint. The fingerprint contains calibrated measurements (spread, beams, tines, mass), a score estimate, and derived ratios for matching.

**Why this priority**: This is the core capability that enables all downstream re-identification. Without generating fingerprints, no matching improvements are possible.

**Independent Test**: Can be fully tested by uploading a trail cam photo of a trophy buck and verifying that a fingerprint is generated and stored with measurements.

**Acceptance Scenarios**:

1. **Given** a photo with a trophy-class buck is uploaded, **When** Stage 2 analysis classifies it as "trophy", **Then** the system queues fingerprint generation for that detection
2. **Given** fingerprint generation is queued, **When** the AI analyzes the deer crop, **Then** a structured fingerprint with B&C measurements and identifying features is stored
3. **Given** a fingerprint is generated, **When** the analysis completes, **Then** the fingerprint includes:
   - Absolute measurements (spread, beams, tines, mass, gross/net score)
   - Derived ratios (G2:G3, beam symmetry, spread:beam ratio)
   - Distinctive features (drop tine, split G2, kicker points)
   - Score class (120s, 140s, 160s, 180s, 200s, World Class)
   - Confidence score

---

### User Story 2 - Enhanced Matching with Fingerprints (Priority: P1)

When comparing a new buck detection against the deer catalog, the system includes fingerprint data in the comparison. The match review shows both visual confidence AND antler print similarity with full measurement details.

**Why this priority**: This is the core user-facing payoff of fingerprinting - improved re-identification accuracy with explainable results.

**Independent Test**: Can be tested by uploading a photo of a previously cataloged buck and verifying the match suggestion shows measurement comparisons alongside visual confidence.

**Acceptance Scenarios**:

1. **Given** catalog deer have fingerprints, **When** a new buck detection is compared, **Then** the comparison includes fingerprint data
2. **Given** fingerprint data is available, **When** presenting match candidates, **Then** the UI displays:
   - Visual match percentage
   - Antler print match percentage
   - Side-by-side measurement table (spread, points, beams, tines, ratios)
   - Distinctive feature comparison
3. **Given** measurements differ between detection and catalog deer, **When** reviewing a match, **Then** user can see exactly which measurements match and which differ
4. **Given** a catalog deer has no fingerprint, **When** comparing against that deer, **Then** the system shows visual confidence only

---

### User Story 3 - Post-Creation Scan (Priority: P2)

When a user creates a deer profile from a detection, the system scans all other unassigned trophy detections to find additional photos that might be the same buck based on antler print similarity.

**Why this priority**: Enables users to quickly build complete deer profiles from bulk uploads without manually reviewing each photo.

**Independent Test**: Can be tested by uploading 10 photos of the same buck, creating a deer from one, and verifying the system suggests the other 9 as matches.

**Acceptance Scenarios**:

1. **Given** a user creates a deer profile from a detection with a fingerprint, **When** the profile is saved, **Then** the system scans unassigned trophy detections for matches
2. **Given** matching detections are found (similarity above 85%), **When** the scan completes, **Then** match candidates are created for user review
3. **Given** matches are found after deer creation, **When** user views the deer profile, **Then** they see "X possible additional sightings found"
4. **Given** no matching detections are found, **When** the scan completes, **Then** no action is taken and user is not notified

---

### User Story 4 - Auto-Clustering of Unassigned Detections (Priority: P2)

When multiple trophy detections are uploaded without any deer in the catalog, the system clusters them by antler print similarity. Users can then name clusters to create deer profiles in bulk.

**Why this priority**: Addresses the "cold start" problem when users upload hundreds of photos before naming any deer.

**Independent Test**: Can be tested by uploading 50 photos containing 5 different trophy bucks, verifying the system groups them into approximately 5 clusters.

**Acceptance Scenarios**:

1. **Given** multiple unassigned trophy detections with fingerprints exist, **When** clustering runs, **Then** detections with 85%+ similarity are grouped together
2. **Given** clusters are created, **When** user views the trophy dashboard, **Then** they see "Found ~5 distinct trophy bucks across 50 photos" (example)
3. **Given** a cluster exists, **When** user names the cluster, **Then** a deer profile is created with all clustered detections linked
4. **Given** user disagrees with clustering, **When** they review a cluster, **Then** they can:
   - Merge two clusters (combine into one)
   - Split a cluster (move detections to different cluster)
   - Dismiss a cluster (mark as "not same buck")
5. **Given** a detection doesn't match any cluster, **When** clustering completes, **Then** it appears in "Unclustered" section

---

### User Story 5 - Trophy Bucks Dashboard (Priority: P2)

Users can access a dedicated trophy dashboard that shows all trophy-class detections organized by status: assigned to deer, pending matches, suggested clusters, and unclustered.

**Why this priority**: Provides a centralized workflow for managing high-value trophy bucks, the core value proposition of the product.

**Independent Test**: Can be tested by accessing the dashboard and verifying all trophy detections are correctly categorized and actionable.

**Acceptance Scenarios**:

1. **Given** trophy detections exist in various states, **When** user opens trophy dashboard, **Then** they see sections:
   - **Assigned**: Trophy detections linked to deer profiles
   - **Pending Matches**: Has match candidates awaiting review
   - **Suggested Clusters**: Auto-grouped by antler print
   - **Unclustered**: No matches, not yet named
2. **Given** pending matches exist for multiple deer, **When** viewing dashboard, **Then** matches are grouped by deer: "Wide Boy: 12 pending"
3. **Given** user clicks a deer's pending matches, **When** review opens, **Then** they can review matches one-by-one or use batch actions

---

### User Story 6 - Deer Profile Antler Print Display (Priority: P2)

The deer profile page displays the antler print data including score class, measurements, ratios, and distinctive features.

**Why this priority**: Helps users understand their trophy bucks' characteristics and provides validation that the fingerprint captured the right information.

**Independent Test**: Can be tested by viewing a deer profile with a fingerprint and verifying all measurement data is displayed.

**Acceptance Scenarios**:

1. **Given** a deer has a fingerprint, **When** viewing the deer profile, **Then** an "Antler Print" card displays:
   - Score class badge (e.g., "160s")
   - Gross/net score
   - Point count (total and per side)
   - Spread, beam lengths
   - Key ratios (G2:G3, symmetry)
   - Distinctive features
2. **Given** multiple sightings exist for a deer, **When** viewing the profile, **Then** user sees print consistency: "8/10 sightings match reference print within 5%"

---

### User Story 7 - Batch Match Operations (Priority: P3)

Users can confirm or reject multiple match candidates at once rather than reviewing each individually.

**Why this priority**: Efficiency improvement for users with many pending matches, but individual review still works.

**Independent Test**: Can be tested by accumulating 10 pending matches for one deer and using batch confirm to accept all.

**Acceptance Scenarios**:

1. **Given** multiple pending matches exist for one deer, **When** user views pending group, **Then** they see "Accept all 12" and "Reject all" buttons
2. **Given** user clicks "Accept all", **When** confirmation is shown, **Then** all detections are linked to the deer and match candidates marked as confirmed
3. **Given** user wants selective batch action, **When** they select specific matches, **Then** they can batch confirm/reject only the selected ones

---

### User Story 8 - Named Buck Gets Fingerprinted (Priority: P3)

When a user names any buck (not just trophy-tier), a fingerprint is generated from the reference photo if one doesn't already exist.

**Why this priority**: Extends fingerprinting beyond auto-detected trophy bucks to user-selected bucks of any tier.

**Independent Test**: Can be tested by naming a "standard" tier buck and verifying a fingerprint is generated.

**Acceptance Scenarios**:

1. **Given** a user names a buck that already has a fingerprint (trophy-tier), **When** the profile is saved, **Then** the existing fingerprint is used
2. **Given** a user names a buck without a fingerprint, **When** the profile is saved, **Then** fingerprint generation is queued
3. **Given** fingerprint generation is queued, **When** it completes, **Then** the deer profile is updated with the fingerprint

---

### User Story 9 - Fingerprint Regeneration (Priority: P3)

When a user changes the primary/reference photo for a named deer, the system regenerates the fingerprint from the new photo.

**Why this priority**: Edge case for maintaining data quality when users change reference photos.

**Independent Test**: Can be tested by changing a deer's reference photo and verifying a new fingerprint replaces the old one.

**Acceptance Scenarios**:

1. **Given** a user changes the reference detection for a deer, **When** the change is saved, **Then** the old fingerprint is cleared and regeneration is queued
2. **Given** fingerprint regeneration completes, **Then** the deer record is updated with the new fingerprint and timestamp

---

### Edge Cases

- **Poor image quality**: Fingerprint generation should still complete but with lower confidence scores. System uses available measurements and documents uncertainty.
- **Extreme viewing angle**: Fingerprint includes an "angle_impact" field documenting how the viewing angle affects measurement reliability. Matching uses ratios (more stable) over absolutes.
- **Broken tine mid-season**: Low antler print match + high visual match triggers a flag: "Possible broken tine - verify visually". User makes final confirmation.
- **AI service failure**: Task retries up to 2 times with exponential backoff. If all retries fail, the detection is created without a fingerprint (graceful degradation).
- **Mixed fingerprint availability**: Comparison uses fingerprint data where available and falls back to visual-only for deer without fingerprints.
- **Same buck, multiple cameras same night**: System correctly clusters these as same buck based on nearly identical prints.
- **User misidentification correction**: When user unlinks a detection from a deer, system offers to re-run matching or create a new deer.

## Requirements *(mandatory)*

### Functional Requirements

**Scoring & Fingerprinting**
- **FR-001**: System MUST automatically trigger fingerprint generation when Stage 2 analysis classifies a deer as "trophy" tier
- **FR-002**: System MUST use anatomical calibration for measurements (ear = 6.5-7 inches, ear spread = 16-17 inches, eye = ~2 inches)
- **FR-003**: System MUST calculate B&C-style scoring (gross score, deductions, net score, score class)
- **FR-004**: System MUST compute derived ratios (G2:G3, beam symmetry, spread:beam) for angle-invariant matching
- **FR-005**: System MUST extract distinctive identifying features (drop tines, split G2, kicker points, beam characteristics)
- **FR-006**: System MUST store fingerprints on the detection record
- **FR-007**: System MUST NOT block the main analysis pipeline waiting for fingerprint generation

**Enhanced Matching**
- **FR-008**: System MUST include fingerprint data in comparison prompts when available
- **FR-009**: System MUST compute and store antler print similarity score alongside visual confidence
- **FR-010**: System MUST fall back to visual-only comparison when fingerprints are unavailable

**Post-Creation Scan**
- **FR-011**: System MUST scan unassigned trophy detections when a deer profile is created
- **FR-012**: System MUST create match candidates for detections with 85%+ similarity

**Clustering**
- **FR-013**: System MUST cluster unassigned trophy detections by fingerprint similarity
- **FR-014**: System MUST allow users to name, merge, split, or dismiss clusters
- **FR-015**: System MUST create deer profiles with all linked detections when user names a cluster

**Dashboard & Display**
- **FR-016**: System MUST provide a trophy dashboard with Assigned, Pending, Clusters, and Unclustered sections
- **FR-017**: System MUST display both similarity score AND full measurements in match review
- **FR-018**: System MUST display antler print data on deer profile pages

**Batch Operations**
- **FR-019**: System MUST support batch confirmation of match candidates
- **FR-020**: System MUST support batch rejection of match candidates

**Fingerprint Lifecycle**
- **FR-021**: System MUST generate fingerprint when user names any buck (if not already exists)
- **FR-022**: System MUST regenerate fingerprint when reference photo changes

### Key Entities

- **Trophy Score**: B&C-style scoring data including calibration (scale used, angle impact), raw measurements (spread, beams, tines, mass), calculated scores (gross, net, deductions), score class, and confidence
- **Antler Print**: Structural fingerprint containing absolute measurements, derived ratios, distinctive features, and confidence. Stored on detections. Used for matching.
- **Cluster**: A grouping of unassigned trophy detections believed to be the same buck based on antler print similarity. Can be named (creating deer), merged, split, or dismissed.
- **Match Candidate**: A potential link between a detection and a deer, now enhanced with antler_print_similarity in addition to visual confidence

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Trophy-tier bucks receive fingerprints within 30 seconds of classification completing
- **SC-002**: Match review displays both visual and antler print similarity for 100% of fingerprinted comparisons
- **SC-003**: System correctly identifies returning trophy bucks with 85%+ accuracy when fingerprints are available (up from 70% visual-only)
- **SC-004**: Users can complete bulk upload of 100 trophy photos and have them auto-clustered within 5 minutes
- **SC-005**: Users can batch-confirm 10+ matches in under 10 seconds
- **SC-006**: Post-creation scan finds 90%+ of matching detections in the unassigned pool
- **SC-007**: Trophy dashboard loads with correct categorization for 1000+ detections in under 3 seconds
- **SC-008**: Users report higher confidence in match suggestions when measurements are displayed

## Assumptions

- Vision AI can reliably extract antler measurements from trail camera photos when given the anatomical calibration prompt
- The B&C scoring methodology translates well to AI-based estimation from single photos
- Trophy-tier bucks represent the highest-value targets for re-identification (justifying the additional AI cost)
- Anatomical calibration (ear = 6.5-7 inches) provides sufficient accuracy for comparative matching (not official scoring)
- Fingerprint data is useful for AI comparison even when measurements have 10-20% variance
- 85% similarity threshold provides good balance between false positives and false negatives for clustering
- Same-season matching means absolute measurements are reliable (antlers don't change within season)
- Users prefer seeing detailed measurements over just a similarity percentage

## Dependencies

- Existing Stage 2 analysis pipeline (classifies deer as trophy/standard/basket/spike)
- Existing deer naming flow (CreateDeerModal, createDeer service)
- Existing deer comparison job (compare-deer trigger)
- Existing match review UI (match-review-modal)
- Vision AI with structured output support (Gemini)
