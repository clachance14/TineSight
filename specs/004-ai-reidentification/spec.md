# Feature Specification: AI Re-identification

**Feature Branch**: `004-ai-reidentification`
**Created**: 2025-12-01
**Status**: Draft
**MVP Phase**: 4 (AI Re-identification - Core Differentiator)
**Depends On**: `003-deer-catalog` (deer profiles to match against)

## Product Context

This feature implements **Phase 4** of the TineSight MVP as defined in the [Product Vision](../../.specify/memory/product-vision.md).

| Aspect | Summary |
|--------|---------|
| **Problem** | Users can't reliably tell if a deer in a new photo is the same as one seen before |
| **This Feature** | AI analyzes antler patterns to suggest "This is the same deer as Buck #5" |
| **Value Delivered** | **Core differentiator** - automatic buck re-identification no competitor does well |
| **North Star** | First Buck Re-Identified (user confirms AI match) |

**This is the feature that makes TineSight unique.** Buck re-identification is the "aha moment" that proves the product's value.

---

## User Scenarios & Testing

### User Story 1 - AI Match Suggestions (Priority: P1)

When viewing an unassigned deer detection, users see AI suggestions for which existing deer it might be.

**Why this priority**: This is the core value proposition. AI doing the recognition work is what saves time and enables accurate tracking.

**Independent Test**: Can be fully tested by having 5+ deer profiles with photos, uploading a new photo of a known deer, waiting for processing, and verifying AI suggests the correct deer with high confidence.

**Acceptance Scenarios**:

1. **Given** a photo with an unassigned buck detection, **When** user views the detection, **Then** they see a "Suggested Matches" section with up to 5 candidate deer profiles
2. **Given** suggested matches exist, **When** viewing the list, **Then** each suggestion shows: deer name, thumbnail comparison, confidence percentage
3. **Given** a high-confidence match (>80%), **When** user views suggestions, **Then** the top match is highlighted as "Likely Match"
4. **Given** suggestions displayed, **When** user clicks a suggested deer, **Then** they see a side-by-side comparison of the new photo and existing profile photos
5. **Given** no good matches found, **When** AI confidence is low (<50% for all), **Then** user sees "No strong matches found - this may be a new deer"
6. **Given** a newly uploaded batch, **When** processing completes, **Then** all detections have match suggestions calculated

---

### User Story 2 - Confirm AI Match (Priority: P1)

Users can confirm an AI-suggested match with one click, linking the detection to the suggested deer.

**Why this priority**: The human-in-the-loop confirmation is what makes the system trustworthy and teaches the model.

**Independent Test**: Can be fully tested by viewing a detection with suggestions, clicking "Confirm" on the correct match, and verifying the detection is now linked to that deer's profile.

**Acceptance Scenarios**:

1. **Given** an AI suggestion displayed, **When** user clicks "Confirm Match", **Then** the detection is immediately linked to that deer profile
2. **Given** a confirmed match, **When** user views the deer profile, **Then** the new photo appears in the gallery
3. **Given** a confirmed match, **When** the system processes the confirmation, **Then** the match is used to improve future suggestions (embedding updated)
4. **Given** a detection with suggestions, **When** user sees the correct deer but wrong confidence shown, **Then** confirming still works correctly
5. **Given** multiple unassigned detections, **When** user confirms one, **Then** they're automatically shown the next unassigned detection (flow optimization)

---

### User Story 3 - Reject AI Match (Priority: P1)

Users can reject incorrect AI suggestions and either pick a different deer or create a new profile.

**Why this priority**: AI will make mistakes. Users must be able to correct errors, and corrections improve future accuracy.

**Independent Test**: Can be fully tested by viewing a detection with an incorrect top suggestion, clicking "Not This Deer", selecting the correct deer or creating new, and verifying the correction is applied.

**Acceptance Scenarios**:

1. **Given** an incorrect AI suggestion, **When** user clicks "Not This Deer", **Then** the suggestion is dismissed and remaining suggestions are shown
2. **Given** all suggestions rejected, **When** no more suggestions remain, **Then** user sees options: "Search for Deer" or "Create New Profile"
3. **Given** a rejected suggestion, **When** rejection is recorded, **Then** the system learns from the correction (negative training signal)
4. **Given** the correct deer exists but wasn't suggested, **When** user searches and selects it, **Then** the detection is linked correctly
5. **Given** this is a genuinely new deer, **When** user clicks "Create New Profile", **Then** they flow into profile creation with this photo as primary

---

### User Story 4 - Batch Confirmation Flow (Priority: P1)

Users can quickly review and confirm multiple AI suggestions in sequence.

**Why this priority**: This addresses "teaching fatigue" - the critical friction point. Batch confirmation makes the initial teaching phase faster.

**Independent Test**: Can be fully tested by uploading 20 photos with some matching existing deer, entering batch review mode, confirming/rejecting matches rapidly, and verifying all assignments are correct.

**Acceptance Scenarios**:

1. **Given** multiple unassigned detections with suggestions, **When** user enters "Review Matches" mode, **Then** they see a streamlined interface for rapid confirmation
2. **Given** review mode, **When** viewing a suggestion, **Then** user can Confirm (Enter/Right), Reject (Left), or Skip (Down) with keyboard
3. **Given** review mode, **When** user confirms a match, **Then** the next detection auto-loads without page refresh
4. **Given** a batch of similar photos, **When** AI groups them as "probably same deer", **Then** user can confirm all at once ("These are all Buck #5")
5. **Given** batch review, **When** user completes the queue, **Then** they see a summary: "Confirmed 15, Created 3 new, Skipped 2"
6. **Given** batch review, **When** user wants to pause, **Then** they can exit and resume later (progress saved)

---

### User Story 5 - Model Training Progress (Priority: P1)

Users see how trained the model is and understand that accuracy improves with more confirmations.

**Why this priority**: This addresses teaching fatigue by showing progress. Users understand the "cold start" phase and see light at the end of the tunnel.

**Independent Test**: Can be fully tested by starting with 0 deer, adding 10 deer with 3+ photos each, and seeing the progress indicator improve from "Getting Started" to "Well Trained".

**Acceptance Scenarios**:

1. **Given** the dashboard or deer page, **When** user views the training status, **Then** they see a progress indicator (e.g., "Model trained on 12 bucks")
2. **Given** few deer profiles (<5), **When** viewing status, **Then** user sees "Getting Started - add more deer for better matching"
3. **Given** moderate training (5-15 deer), **When** viewing status, **Then** user sees "Learning - matching improving"
4. **Given** good training (15+ deer, 50+ confirmations), **When** viewing status, **Then** user sees "Well Trained - high accuracy matching"
5. **Given** a new confirmation, **When** training updates, **Then** user sees brief celebration ("Nice! Model is learning")
6. **Given** the first successful re-identification, **When** user confirms, **Then** they see a special celebration ("First Re-ID! The magic is working")

---

### User Story 6 - Confidence Scoring (Priority: P1)

AI provides confidence scores for each match suggestion to help users trust and understand the system.

**Why this priority**: Transparency builds trust. Users should know when AI is confident vs. guessing.

**Independent Test**: Can be fully tested by viewing suggestions with varying confidence levels and verifying scores correlate with match quality.

**Acceptance Scenarios**:

1. **Given** a match suggestion, **When** displayed, **Then** it shows confidence percentage (e.g., "92% match")
2. **Given** high confidence (>80%), **When** displayed, **Then** confidence is shown in green with "Likely Match" label
3. **Given** medium confidence (50-80%), **When** displayed, **Then** confidence is shown in yellow with "Possible Match" label
4. **Given** low confidence (<50%), **When** displayed, **Then** confidence is shown in gray with "Uncertain" label
5. **Given** a side-by-side comparison, **When** user views it, **Then** they see which features contributed to the match (highlighted regions if possible)
6. **Given** user feedback over time, **When** AI learns, **Then** confidence calibration improves (high confidence = actually correct more often)

---

### Edge Cases

- What if deer looks different due to antler growth/shedding? (Embeddings account for seasonal variation; low confidence suggests "check carefully")
- What if photo quality is poor (night, blurry)? (Lower confidence scores, system notes "low quality image")
- What if same deer appears multiple times in one photo? (Each detection matched independently)
- What if user confirms wrong match? (Allow undo, negative signal not applied until confirmed for X hours)
- What if two deer profiles are actually the same deer? (Merge suggestion feature - P2)

---

## Requirements

### Functional Requirements

- **FR-001**: System MUST generate embeddings for each deer detection using antler pattern analysis
- **FR-002**: System MUST store embeddings in pgvector for similarity search
- **FR-003**: System MUST suggest up to 5 match candidates for each unassigned detection
- **FR-004**: System MUST calculate and display confidence scores for each suggestion
- **FR-005**: System MUST allow one-click confirmation of suggested matches
- **FR-006**: System MUST allow rejection of incorrect suggestions
- **FR-007**: System MUST use confirmations/rejections to improve future matching
- **FR-008**: System MUST support batch confirmation mode for rapid review
- **FR-009**: System MUST group similar photos for batch assignment
- **FR-010**: System MUST display training progress to users
- **FR-011**: System MUST celebrate first re-identification milestone
- **FR-012**: System MUST allow keyboard navigation in review mode

### Non-Functional Requirements

- **NFR-001**: Embedding generation SHOULD complete within 10 seconds per detection
- **NFR-002**: Similarity search SHOULD return results in under 500ms
- **NFR-003**: Top-5 accuracy SHOULD exceed 80% for deer with 3+ confirmed photos
- **NFR-004**: Batch confirmation mode SHOULD allow 20+ confirmations per minute

### Key Entities

- **DeerEmbedding**: Vector embedding for a deer detection (stored in pgvector)
- **MatchSuggestion**: Calculated match with deer_id, confidence, and feature highlights
- **Confirmation**: Record of user confirmation/rejection for model improvement

---

## Success Criteria

- **SC-001**: AI suggests correct deer in top 5 for >80% of known deer
- **SC-002**: Users can confirm AI matches with one click
- **SC-003**: Users can reject incorrect matches and select correct deer
- **SC-004**: Batch confirmation flow enables 20+ matches per minute
- **SC-005**: Training progress indicator accurately reflects model state
- **SC-006**: First re-identification is celebrated (milestone moment)

---

## Technical Approach

### Embedding Strategy

1. **MegaDetector** (or similar) for deer detection (already in Phase 2)
2. **Custom embedding model** trained on antler patterns for re-identification
3. **pgvector** for storing and searching embeddings efficiently

### Similarity Matching

```sql
-- Example similarity query
SELECT deer_id, 1 - (embedding <=> query_embedding) as similarity
FROM deer_embeddings
WHERE account_id = $account_id
ORDER BY embedding <=> query_embedding
LIMIT 5;
```

### Learning from Feedback

- Confirmed matches: Positive training signal, update deer's representative embedding
- Rejected matches: Negative training signal, adjust similarity thresholds
- New profiles: Add embedding to index for future matching

---

## Assumptions

- Antler patterns are sufficiently unique for identification
- Photo quality from game cameras is adequate for embedding generation
- Users can visually verify AI suggestions (deer photos are recognizable)
- pgvector performance is sufficient for expected deer counts (<500 per account)

## Out of Scope

- Age estimation from antlers
- Antler scoring (Boone & Crockett, Pope & Young)
- Cross-property deer matching
- Automatic model retraining (embeddings updated incrementally)
- Video analysis (photos only)

## Dependencies

- `002-photo-pipeline`: Deer detections with bounding boxes
- `003-deer-catalog`: Deer profiles to match against
- Replicate API: Embedding model for antler analysis
- pgvector: Vector similarity search in PostgreSQL
