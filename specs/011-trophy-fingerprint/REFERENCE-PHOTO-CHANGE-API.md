# Reference Photo Change API

## Overview

API for changing the reference (primary) photo of a deer profile, which automatically triggers fingerprint regeneration.

## Service Function

### `updateDeer()`

**File**: `/home/clachance14/projects/TineSight/lib/services/deer.ts`

```typescript
import { updateDeer } from '@/lib/services/deer'

const result = await updateDeer(userId, deerId, {
  reference_detection_id: newDetectionId
})
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | `string` | Yes | UUID of the user (for RLS) |
| `deerId` | `string` | Yes | UUID of the deer profile to update |
| `data.reference_detection_id` | `string` | No | UUID of the new reference detection |

### Returns

```typescript
{
  data: Deer | null;
  error: Error | null;
}
```

### Errors

| Error Message | Cause | Resolution |
|---------------|-------|------------|
| `"New reference detection not found"` | Detection ID is invalid | Verify detection exists |
| `"Reference detection must belong to this deer"` | Detection is linked to different deer | Use a detection from the same deer |
| `"A deer named 'X' already exists."` | Name conflict (if also changing name) | Choose different name |

## Behavior

When `reference_detection_id` is provided and differs from current reference:

1. ✅ Validates new detection exists and belongs to deer
2. ✅ Clears `is_reference = false` on old reference detection
3. ✅ Clears `antler_fingerprint = null` on old reference detection
4. ✅ Sets `is_reference = true` on new reference detection
5. ✅ Clears `antler_fingerprint = null` on new reference detection
6. ✅ Updates `deer.reference_detection_id` to new detection
7. ✅ Queues `generate-fingerprint` job for new detection

## Example Usage

### Change Reference Photo Only

```typescript
const result = await updateDeer(userId, deerId, {
  reference_detection_id: 'detection-uuid-123'
})

if (result.error) {
  console.error('Failed to update reference:', result.error.message)
} else {
  console.log('Reference updated successfully!')
  // Fingerprint generation job is now queued in Trigger.dev
}
```

### Change Reference Photo + Name

```typescript
const result = await updateDeer(userId, deerId, {
  name: 'Big 12',
  reference_detection_id: 'detection-uuid-123'
})
```

### Change Reference Photo + Notes

```typescript
const result = await updateDeer(userId, deerId, {
  notes: 'Better angle shows drop tine',
  reference_detection_id: 'detection-uuid-123'
})
```

## Frontend Integration Example

```typescript
// components/deer/change-reference-modal.tsx

import { updateDeer } from '@/lib/services/deer'
import { useAuth } from '@/lib/hooks/use-auth'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export function ChangeReferenceModal({ deer, detections }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const changeReferenceMutation = useMutation({
    mutationFn: async (newDetectionId: string) => {
      if (!user) throw new Error('Not authenticated')

      const result = await updateDeer(user.id, deer.id, {
        reference_detection_id: newDetectionId
      })

      if (result.error) throw result.error
      return result.data
    },
    onSuccess: () => {
      // Invalidate deer catalog and profile queries
      queryClient.invalidateQueries({ queryKey: ['deer'] })
      toast.success('Reference photo updated! Regenerating fingerprint...')
    },
    onError: (error) => {
      toast.error(`Failed to update reference: ${error.message}`)
    }
  })

  return (
    <Dialog>
      <DialogContent>
        <DialogTitle>Choose Reference Photo</DialogTitle>
        <div className="grid grid-cols-3 gap-4">
          {detections.map((detection) => (
            <button
              key={detection.id}
              onClick={() => changeReferenceMutation.mutate(detection.id)}
              className={cn(
                'relative aspect-square overflow-hidden rounded-lg border-2',
                detection.is_reference
                  ? 'border-copper ring-2 ring-copper/50'
                  : 'border-slate hover:border-copper-light'
              )}
            >
              <img
                src={detection.image_url}
                alt={`Detection ${detection.id}`}
                className="h-full w-full object-cover"
              />
              {detection.is_reference && (
                <div className="absolute top-2 right-2 rounded-full bg-copper px-2 py-1 text-xs font-medium text-slate-deep">
                  Current
                </div>
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

## Backend API Endpoint Example

```typescript
// app/api/deer/[id]/reference/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { updateDeer } from '@/lib/services/deer'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()

  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse request body
  const body = await request.json()
  const { reference_detection_id } = body

  if (!reference_detection_id) {
    return NextResponse.json(
      { error: 'reference_detection_id is required' },
      { status: 400 }
    )
  }

  // Update reference photo
  const result = await updateDeer(user.id, params.id, {
    reference_detection_id
  })

  if (result.error) {
    return NextResponse.json(
      { error: result.error.message },
      { status: 400 }
    )
  }

  return NextResponse.json({
    success: true,
    deer: result.data,
    message: 'Reference photo updated. Fingerprint regeneration queued.'
  })
}
```

## Database Changes

### Before Reference Change

```sql
-- Deer record
SELECT id, reference_detection_id FROM deer WHERE id = 'deer-123';
-- deer-123 | detection-old

-- Old reference detection
SELECT is_reference, antler_fingerprint FROM detections WHERE id = 'detection-old';
-- true | { "scores": { ... }, "measurements": { ... } }

-- New detection (not yet reference)
SELECT is_reference, antler_fingerprint FROM detections WHERE id = 'detection-new';
-- false | null
```

### After Reference Change

```sql
-- Deer record (updated)
SELECT id, reference_detection_id FROM deer WHERE id = 'deer-123';
-- deer-123 | detection-new

-- Old reference detection (cleared)
SELECT is_reference, antler_fingerprint FROM detections WHERE id = 'detection-old';
-- false | null

-- New detection (now reference, fingerprint pending)
SELECT is_reference, antler_fingerprint FROM detections WHERE id = 'detection-new';
-- true | null
```

### After Fingerprint Regeneration Completes

```sql
-- New detection (fingerprint generated)
SELECT is_reference, antler_fingerprint FROM detections WHERE id = 'detection-new';
-- true | { "scores": { ... }, "measurements": { ... } }
```

## Trigger.dev Job

The `generate-fingerprint` job is queued automatically:

```typescript
await generateFingerprint.trigger({
  detectionId: data.reference_detection_id,
  userId,
})
```

**Job ID**: `generate-fingerprint`
**Payload**: `{ detectionId: string, userId: string }`
**Location**: `/home/clachance14/projects/TineSight/trigger/jobs/generate-fingerprint.ts`

Monitor job execution in Trigger.dev dashboard.

## Edge Cases

### Same Reference (No-op)

```typescript
// Current reference: detection-123
const result = await updateDeer(userId, deerId, {
  reference_detection_id: 'detection-123' // Same as current
})
// No action taken, no job queued
```

### Detection Not Found

```typescript
const result = await updateDeer(userId, deerId, {
  reference_detection_id: 'invalid-uuid'
})
// Returns: { data: null, error: Error('New reference detection not found') }
```

### Detection Belongs to Different Deer

```typescript
const result = await updateDeer(userId, deerId, {
  reference_detection_id: 'detection-from-other-deer'
})
// Returns: { data: null, error: Error('Reference detection must belong to this deer') }
```

## Testing

### Manual Test

```bash
npx tsx scripts/test-reference-change.ts
```

### SQL Test

```sql
-- Setup: Find deer with multiple detections
SELECT
  d.id AS deer_id,
  d.name,
  d.reference_detection_id AS current_ref,
  det.id AS available_detection
FROM deer d
JOIN detections det ON det.deer_id = d.id
WHERE det.id != d.reference_detection_id
LIMIT 1;

-- Execute update via API or service call

-- Verify changes
SELECT
  d.reference_detection_id AS new_ref,
  old_det.is_reference AS old_is_ref,
  old_det.antler_fingerprint AS old_fp,
  new_det.is_reference AS new_is_ref,
  new_det.antler_fingerprint AS new_fp
FROM deer d
LEFT JOIN detections old_det ON old_det.id = 'old-detection-id'
LEFT JOIN detections new_det ON new_det.id = d.reference_detection_id
WHERE d.id = 'deer-id';
```

## Related Documentation

- [Phase 11 Implementation](./phase-11-implementation.md)
- [Feature Spec](./spec.md) - User Story 9
- [Tasks](./tasks.md) - T044, T045
- [Generate Fingerprint Job](/home/clachance14/projects/TineSight/trigger/jobs/generate-fingerprint.ts)
