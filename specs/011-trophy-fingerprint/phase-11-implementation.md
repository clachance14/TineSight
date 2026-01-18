# Phase 11 Implementation: Fingerprint Regeneration

**User Story**: US9 - Fingerprint Regeneration when Reference Photo Changes
**Priority**: P3
**Date**: 2025-12-27
**Status**: Complete

## Overview

When a user changes the reference (primary) photo for a named deer, the system automatically:
1. Clears the old fingerprint from the previous reference detection
2. Marks the old detection as `is_reference = false`
3. Marks the new detection as `is_reference = true`
4. Clears any existing fingerprint on the new detection
5. Queues a new fingerprint generation job for the new reference

## Changes Made

### 1. Updated `UpdateDeerData` Interface

**File**: `/home/clachance14/projects/TineSight/lib/services/deer.ts`

```typescript
export interface UpdateDeerData {
  name?: string
  notes?: string | null
  reference_detection_id?: string  // NEW - supports changing reference photo
}
```

### 2. Enhanced `updateDeer()` Function

**File**: `/home/clachance14/projects/TineSight/lib/services/deer.ts`

The function now includes logic to:

1. **Detect Reference Changes**:
   - Fetches current deer record
   - Compares `reference_detection_id` from request with current value
   - Only proceeds if they differ

2. **Validate New Reference**:
   - Verifies new detection exists
   - Ensures it belongs to the same deer (prevents cross-deer reference assignment)

3. **Update Detection Flags**:
   - Clears `is_reference = false` on old reference
   - Clears `antler_fingerprint = null` on old reference
   - Sets `is_reference = true` on new reference
   - Clears `antler_fingerprint = null` on new reference

4. **Queue Fingerprint Generation**:
   - Calls `generateFingerprint.trigger()` with new detection ID
   - Gracefully handles failures (doesn't block deer update)

## Implementation Details

### Reference Change Detection Logic

```typescript
if (data.reference_detection_id !== undefined) {
  const { data: currentDeer } = await supabase
    .from('deer')
    .select('reference_detection_id')
    .eq('id', deerId)
    .eq('user_id', userId)
    .single()

  if (currentDeer && currentDeer.reference_detection_id !== data.reference_detection_id) {
    // Reference is actually changing - perform update logic
  }
}
```

### Validation

The implementation validates:
- New detection exists
- New detection belongs to the deer being updated
- User has permission (via RLS on deer table)

Error cases:
- `"New reference detection not found"` - Detection ID is invalid
- `"Reference detection must belong to this deer"` - Detection is linked to a different deer

### Fingerprint Regeneration

```typescript
await generateFingerprint.trigger({
  detectionId: data.reference_detection_id,
  userId,
})
```

The job is queued asynchronously and does not block the deer update. If queuing fails, the error is logged but the update succeeds.

## Testing

### Manual Test Procedure

1. **Setup**:
   ```bash
   # Upload multiple photos of the same buck
   # Create a deer profile from one detection
   ```

2. **Change Reference**:
   ```typescript
   const result = await updateDeer(userId, deerId, {
     reference_detection_id: newDetectionId
   })
   ```

3. **Verify**:
   ```sql
   -- Old detection should have is_reference = false, antler_fingerprint = null
   SELECT is_reference, antler_fingerprint
   FROM detections
   WHERE id = 'old-detection-id';

   -- New detection should have is_reference = true, antler_fingerprint = null
   SELECT is_reference, antler_fingerprint
   FROM detections
   WHERE id = 'new-detection-id';

   -- Deer should point to new reference
   SELECT reference_detection_id
   FROM deer
   WHERE id = 'deer-id';
   ```

4. **Verify Job Queued**:
   - Check Trigger.dev dashboard for `generate-fingerprint` job
   - Job payload should contain new detection ID

### Automated Test Script

Run the validation script:

```bash
npx tsx scripts/test-reference-change.ts
```

The script:
- Finds a deer with multiple detections
- Changes the reference to a different detection
- Verifies all database updates
- Confirms job was queued

## Edge Cases Handled

1. **No Reference Change**: If `reference_detection_id` is the same as current, no action is taken
2. **First Reference**: If deer has no current reference, sets the new one without clearing old
3. **Invalid Detection**: Returns error if new detection doesn't exist
4. **Cross-Deer Assignment**: Returns error if new detection belongs to a different deer
5. **Job Failure**: Logs error but allows deer update to succeed

## Dependencies

- `generateFingerprint` job from `/home/clachance14/projects/TineSight/trigger/jobs/generate-fingerprint.ts`
- Supabase client from `/home/clachance14/projects/TineSight/lib/supabase/server.ts`

## Tasks Completed

- [x] **T044**: Modify deer update flow to detect reference photo changes
- [x] **T045**: Clear old fingerprint and queue regeneration when reference changes

## Next Steps

This completes Phase 11 (User Story 9). The implementation enables:

1. **User Story 9**: Users can change the reference photo for a deer, and the system automatically regenerates the fingerprint
2. **Future Enhancement**: UI to allow users to select a different reference photo from the deer profile page

## Files Modified

1. `/home/clachance14/projects/TineSight/lib/services/deer.ts`
   - Updated `UpdateDeerData` interface
   - Enhanced `updateDeer()` function with reference change logic

## Files Created

1. `/home/clachance14/projects/TineSight/scripts/test-reference-change.ts`
   - Validation script for testing reference photo changes

## Acceptance Criteria Met

From spec.md User Story 9:

- ✅ **Given** a user changes the reference detection for a deer, **When** the change is saved, **Then** the old fingerprint is cleared and regeneration is queued
- ✅ **Given** fingerprint regeneration completes, **Then** the deer record is updated with the new fingerprint and timestamp

## Known Limitations

1. **UI Support**: No UI exists yet to trigger this functionality (requires frontend work)
2. **Batch Operations**: Changing reference for multiple deer at once is not supported
3. **Fingerprint Migration**: Old fingerprints are deleted, not archived (no history)

## Related Documentation

- Feature Spec: `/home/clachance14/projects/TineSight/specs/011-trophy-fingerprint/spec.md`
- Tasks List: `/home/clachance14/projects/TineSight/specs/011-trophy-fingerprint/tasks.md`
- Fingerprint Job: `/home/clachance14/projects/TineSight/trigger/jobs/generate-fingerprint.ts`
