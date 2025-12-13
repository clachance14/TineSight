# Quickstart: Detection Editing Side Panel

**Branch**: `006-detection-edit-panel` | **Date**: 2025-12-10

## Prerequisites

- TineSight development environment running (`npm run dev`)
- Trigger.dev worker running (`npx trigger.dev@latest dev`)
- At least one photo uploaded with processed detections
- User logged in as Owner role

## Quick Verification Steps

### 1. Database Migration

Run the soft-delete migration:

```bash
npx supabase db push
```

Verify the column exists:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'detections' AND column_name = 'deleted_at';
```

### 2. Add shadcn/ui Sheet Component

If not already installed:

```bash
npx shadcn@latest add sheet
```

### 3. Test Detection Edit Flow

1. Navigate to a photo with detections: `http://localhost:3000/photos/{photo-id}`
2. Click on a bounding box overlay
3. Edit panel should slide in from the right
4. Modify a field (e.g., change sex from "unknown" to "buck")
5. Click Save
6. Verify toast shows success
7. Refresh page - change should persist

### 4. Test Detection Delete Flow

1. Click on a detection bounding box
2. Click Delete button in the panel
3. Confirm in the dialog
4. Detection should disappear from overlay and cards
5. Refresh page - detection should remain hidden

### 5. Test Detection Card Click (P2)

1. Click on a detection card below the photo
2. Same edit panel should open
3. Modify and save - should work identically

## Key Files to Verify

| File | Purpose | Verification |
|------|---------|--------------|
| `components/photos/detection-edit-panel.tsx` | Side panel component | Opens on click, shows form |
| `lib/stores/detection-edit.ts` | Panel state store | Panel opens/closes correctly |
| `lib/hooks/use-detection.ts` | TanStack Query hooks | Data fetches and updates |
| `app/api/detections/[id]/route.ts` | API endpoint | PATCH/DELETE work |
| `lib/services/detections.ts` | Service functions | `updateDetection`, `softDeleteDetection` |

## Common Issues

### Panel doesn't open
- Check console for errors
- Verify `DetectionEditPanel` is rendered in `PhotoDetailClient`
- Verify Zustand store is properly initialized

### Save fails with 403
- Check RLS policy allows update
- Verify user owns the image containing the detection

### Deleted detection still visible
- Check `getDetectionsForImage` includes `.is('deleted_at', null)`
- Run migration if `deleted_at` column missing

### Form validation errors
- Check enum values match exactly (case-sensitive)
- Antler points must be 0-30 integer
- Distinguishing features max 500 chars

## API Testing with curl

```bash
# Get detection (replace with actual ID)
curl -X GET http://localhost:3000/api/detections/{detection-id} \
  -H "Cookie: sb-access-token=..." \
  | jq

# Update detection
curl -X PATCH http://localhost:3000/api/detections/{detection-id} \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-access-token=..." \
  -d '{"sex": "buck", "antlerPoints": 8}' \
  | jq

# Delete detection
curl -X DELETE http://localhost:3000/api/detections/{detection-id} \
  -H "Cookie: sb-access-token=..." \
  | jq
```

## Design System Verification

The edit panel should match TineSight design:

- Background: `bg-slate-deep` (#2D3638)
- Panel surface: `bg-slate` (#3D4A4D)
- Primary button: `bg-copper` (#C4895A)
- Text: `text-cream` (#F5F0E8)
- Secondary text: `text-cream-dark` (#E8E3DB)
- Border: `border-cream/20`
- Panel width: 400px desktop, full-width mobile

## Success Criteria Checklist

- [ ] Edit a detection in under 30 seconds (SC-001)
- [ ] Delete a detection in under 10 seconds (SC-002)
- [ ] Edits persist across page refresh (SC-003)
- [ ] Deleted detections stay hidden (SC-004)
- [ ] Panel opens within 500ms (SC-005)
- [ ] Both bbox click and card click work (SC-006)
