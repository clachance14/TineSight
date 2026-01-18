# Feature Specification: 10K Photo Bulk Upload

**Feature Branch**: `012-bulk-upload`
**Created**: 2025-12-26
**Status**: Draft
**Input**: Enable 10K photo bulk upload from SD cards with streaming processing, Web Worker for memory isolation, resumable uploads, and real-time progress visualization

## Problem Statement

Hunting lease operators accumulate thousands of trail camera photos on SD cards. When they first sign up for TineSight or collect a new batch of SD cards, they need to upload large volumes of photos (up to 10,000) in a single session. The current upload system crashes browsers at this scale due to memory constraints and provides poor user experience due to sequential processing.

**Current State:**
- Browser crashes when selecting 5,000+ photos due to memory exhaustion
- Users must wait for all uploads to complete before AI processing begins
- No resume capability if browser crashes or closes
- 60-second signed URL expiry causes failures on slow rural connections

**Desired State:**
- Users can upload 10,000 photos without browser instability
- AI processing starts immediately as photos upload (streaming)
- First processed photo visible within 20 seconds of starting
- Comprehensive progress visibility and debug logging

## User Scenarios & Testing

### User Story 1 - First-Time Bulk Import (Priority: P1)

A new hunting lease operator signs up for TineSight and wants to import their entire collection of trail camera photos from the past season. They have 8,000+ photos across multiple SD cards that they want to dump into the system and start discovering bucks.

**Why this priority**: This is the core onboarding experience. New users with large photo libraries represent the highest-value customers. A smooth first import creates lasting positive impression.

**Independent Test**: Can be fully tested by selecting a folder with 1,000+ photos and verifying all photos appear in gallery with deer detections completed.

**Acceptance Scenarios**:

1. **Given** a user is on the upload page with an SD card connected, **When** they select a folder containing 10,000 photos, **Then** the browser remains responsive and files begin uploading immediately
2. **Given** uploads are in progress, **When** the first 50 photos complete uploading, **Then** AI processing begins automatically without waiting for remaining uploads
3. **Given** AI processing is running, **When** the first photo completes analysis, **Then** the user can view it in the gallery with deer detection results (within 20 seconds of upload start)
4. **Given** uploads and processing are running in parallel, **When** the user navigates to the Photos gallery, **Then** they see photos appearing with deer badges as each completes processing

---

### User Story 2 - Progress Visibility (Priority: P1)

Users uploading large batches need clear visibility into what's happening. They need to know how many files have uploaded, how many are being processed, and whether any have failed.

**Why this priority**: Without progress visibility, users have no confidence the system is working. This is essential for the P1 upload flow to be usable.

**Independent Test**: Can be tested by uploading 100+ photos and verifying progress bars update in real-time for both upload and processing stages.

**Acceptance Scenarios**:

1. **Given** uploads are in progress, **When** viewing the upload page, **Then** user sees upload progress (e.g., "Uploading: 2,400 / 10,000")
2. **Given** processing is running, **When** viewing the upload page, **Then** user sees processing progress (e.g., "Analyzing: 1,800 / 10,000")
3. **Given** some uploads fail, **When** the batch completes, **Then** user sees count of failed files with option to retry
4. **Given** user attempts to close the browser tab during upload, **When** the close action is triggered, **Then** a warning appears asking to confirm abandonment

---

### User Story 3 - Slow Connection Tolerance (Priority: P2)

Rural hunting lease operators often have slow or unreliable internet connections (satellite, mobile hotspot). The system must handle multi-minute upload times per file without failures.

**Why this priority**: Core target users are rural operators. Failing on slow connections would exclude the primary market.

**Independent Test**: Can be tested by throttling network to 1Mbps and verifying 5MB files upload successfully.

**Acceptance Scenarios**:

1. **Given** user has slow internet connection, **When** uploading large (5MB+) photos, **Then** uploads complete successfully even if individual files take several minutes
2. **Given** upload credentials are about to expire, **When** the expiry approaches, **Then** credentials are refreshed proactively before failure occurs
3. **Given** a temporary network interruption, **When** connection resumes, **Then** failed uploads retry automatically up to 3 times

---

### User Story 4 - Debug Logging for Support (Priority: P3)

When users encounter issues with bulk uploads, support needs detailed logs to diagnose problems. Users should be able to easily share console output.

**Why this priority**: Essential for supporting the feature, but not part of core user flow.

**Independent Test**: Can be tested by enabling debug mode and verifying structured log output appears in console during upload.

**Acceptance Scenarios**:

1. **Given** debug mode is enabled, **When** upload is in progress, **Then** structured logs appear in browser console with timestamps, phase, and metrics
2. **Given** an error occurs, **When** the error is logged, **Then** the log includes file name, error message, and retry status
3. **Given** upload completes, **When** viewing logs, **Then** summary shows total files, success/fail counts, peak memory usage, and total duration

---

### Edge Cases

- What happens when user selects a folder with 50,000+ photos? System displays warning about expected processing time but allows upload to proceed.
- How does system handle mixed file types in folder? System filters to supported image types (JPG, JPEG, PNG, HEIC, WebP) and ignores others silently.
- What happens if browser crashes mid-upload? Current phase: user must restart upload. Future phase: IndexedDB resume capability.
- How does system handle duplicate photos? Current phase: duplicates are uploaded. Future phase: content hash deduplication skips duplicates.
- What happens when Gemini API rate limits are hit? Background jobs queue and retry with exponential backoff; processing continues at reduced rate.
- What happens if user's Gemini tier changes mid-upload? Processing adapts to new rate limits automatically.

## Requirements

### Functional Requirements

**Memory & Browser Stability:**
- **FR-001**: System MUST process photos using a Web Worker to prevent main thread blocking during EXIF extraction (thumbnails generated server-side)
- **FR-002**: System MUST iterate through selected files in chunks of 25 to prevent memory exhaustion
- **FR-003**: Browser memory usage MUST remain under 500MB when uploading 10,000 photos

**Upload Flow:**
- **FR-004**: System MUST support folder selection in addition to individual file selection
- **FR-005**: System MUST upload files in parallel (5 concurrent uploads) with configurable chunk sizes
- **FR-006**: System MUST request fresh signed URLs per chunk of 25 files, each with minimum 5-minute validity to accommodate slow connections
- **FR-007**: System MUST automatically retry failed uploads up to 3 times with increasing delays between attempts
- **FR-017**: System MUST check selected files against already-uploaded files (by filename + file size) and skip duplicates, displaying count of skipped files to user

**Streaming Processing:**
- **FR-008**: System MUST trigger AI processing after each chunk of 25 files uploads (not waiting for entire batch)
- **FR-009**: System MUST allow users to view and browse processed photos while remaining uploads continue
- **FR-010**: System MUST update photo gallery in real-time via Supabase Realtime (WebSocket) as AI processing completes
- **FR-016**: System MUST generate thumbnails server-side (Trigger.dev) as scaled versions of the entire photo (not cropped)

**Progress & Feedback:**
- **FR-011**: System MUST display separate progress indicators for upload stage and processing stage
- **FR-012**: System MUST display count of failed files with ability to view error details
- **FR-013**: System MUST show warning when user attempts to close browser during active upload
- **FR-014**: System MUST provide structured console logging for debugging (timestamps, phases, metrics)

**Configuration:**
- **FR-015**: System MUST expose configurable constants for chunk size, parallel uploads, credential validity duration, and processing trigger size

### Key Entities

- **Upload Session**: Represents an entire bulk upload operation; tracks total files, uploaded count, processed count, failed count, and overall status
- **Upload Chunk**: A subset of files (25) grouped for processing; tracks individual file statuses within the chunk
- **File Status**: Individual file tracking; includes upload status (pending/uploading/uploaded/failed), processing status, error details if any
- **Upload Log Entry**: Structured log record; contains timestamp, phase (init/hash/upload/process/complete/error), event description, and relevant metrics

## Success Criteria

### Measurable Outcomes

- **SC-001**: Users can select and begin uploading a folder with 10,000 photos without browser crash or freeze
- **SC-002**: First processed photo (with deer detection results) is visible within 20 seconds of upload start
- **SC-003**: Browser memory usage stays under 500MB during 10,000 photo upload
- **SC-004**: Upload of 10,000 photos (approximately 30GB) completes in under 15 minutes on a 100Mbps connection
- **SC-005**: AI processing of 10,000 photos completes in under 70 minutes
- **SC-006**: Upload success rate exceeds 99% on stable connections
- **SC-007**: Failed uploads are automatically recovered at 95%+ rate through retry mechanism
- **SC-008**: Debug logs contain sufficient detail to diagnose any upload failure without additional information gathering

## Assumptions

- User is on a modern browser (Chrome, Firefox, Edge, Safari 2023+) that supports worker threads and folder selection
- User has sufficient storage quota for their upload volume
- User has AI processing service access with standard rate limits for reasonable processing times
- Photos are standard trail camera formats (JPEG, PNG, HEIC) with typical 2-5MB file sizes
- User has stable-enough connection to maintain uploads (with tolerance for brief interruptions)

## Out of Scope (Future Phases)

- Resume capability after browser crash using local storage (Phase 2)
- Content hash deduplication for renamed files (Phase 2) - Phase 1 uses filename+size matching
- Background upload continuation when browser tab closes (Phase 3)
- Per-user rate limit coordination across concurrent users (Phase 3)
- Mobile-optimized upload experience (Future)

## Clarifications

### Session 2025-12-26

- Q: How should credentials be refreshed when they approach expiration during long-running uploads? → A: Fresh signed URL per chunk (25 files)
- Q: Which worker type should be used for EXIF extraction and thumbnail generation? → A: Web Worker (standard, EXIF only - thumbnails server-side)
- Q: How should the gallery receive real-time updates as AI processing completes? → A: Supabase Realtime (WebSocket subscription)
- Q: Where should thumbnails be generated? → A: Server-side (Trigger.dev); thumbnail is entire photo scaled to fit (not cropped)
- Q: What happens on page refresh during upload? → A: Lose client state; already-uploaded files persist; add filename+size dedup so users can re-select entire folder to resume
