# Research: Detection Editing Side Panel

**Branch**: `006-detection-edit-panel` | **Date**: 2025-12-10

## Research Tasks Completed

### 1. Existing Detection Data Model

**Decision**: Extend existing `detections` table with `deleted_at` column for soft delete

**Findings**:
- Current schema already has all editable fields: `sex`, `antler_points`, `age_class`, `species`, `distinguishing_features`
- No `deleted_at` column exists - needs migration
- Existing `DetectionUpdate` type in `types/database.ts` supports partial updates

**Alternatives Considered**:
- Hard delete: Rejected - loses data for potential recovery and audit trail
- Separate "archived_detections" table: Rejected - soft delete is simpler and sufficient

### 2. Side Panel Component Pattern

**Decision**: Use shadcn/ui Sheet component (slide-in from right)

**Findings**:
- shadcn/ui Sheet component provides accessible slide-in panel with overlay
- Supports responsive design (full-width on mobile)
- Matches existing codebase patterns with other shadcn/ui components
- Already using similar dialog patterns (QualityFeedbackDialog)

**Alternatives Considered**:
- Modal dialog: Rejected - side panel keeps photo context visible
- Inline expansion: Rejected - insufficient space for form fields

### 3. Click Behavior Change

**Decision**: Replace ROI selection with panel opening on detection click

**Findings**:
- Current behavior: Click detection → enter ROI selection mode
- New behavior: Click detection → open edit panel
- ROI selection feature explicitly moved out of scope (spec says "remove")
- Existing `handleDetectionClick` function in `photo-detail-client.tsx` needs modification

**Alternatives Considered**:
- Two-click system (click to select, click again to edit): Rejected - adds friction
- Long-press for ROI, click for edit: Rejected - mobile complexity

### 4. Form Validation Approach

**Decision**: React Hook Form + Zod for form state and validation

**Findings**:
- Already in use in project (per constitution tech stack)
- Provides type-safe validation matching database constraints
- Works well with TanStack Query mutations

**Validation Rules**:
- `sex`: enum ['buck', 'doe', 'fawn', 'unknown']
- `antler_points`: integer, 0-30 range, nullable
- `age_class`: enum ['young', 'mature', 'old', 'unknown']
- `species`: enum ['whitetail', 'mule_deer', 'elk', 'unknown']
- `distinguishing_features`: text, max 500 chars, nullable

### 5. State Management

**Decision**: Zustand store for panel open/close state, TanStack Query for data

**Findings**:
- Panel visibility state needs to be shared between detection overlay, cards, and panel
- Existing `detection-hover.ts` store pattern can be followed
- TanStack Query already used for data fetching (use-roi.ts pattern)

**Store Shape**:
```typescript
interface DetectionEditStore {
  selectedDetectionId: string | null
  isPanelOpen: boolean
  openPanel: (detectionId: string) => void
  closePanel: () => void
}
```

### 6. API Design for Detection CRUD

**Decision**: Single REST endpoint `api/detections/[id]` with GET/PATCH/DELETE

**Findings**:
- Existing pattern: `api/detections/[id]/roi`, `api/detections/[id]/confirm`, etc.
- Main detection CRUD endpoint doesn't exist - needs creation
- Soft delete via PATCH with `deleted_at` timestamp (not DELETE method)

**API Endpoints**:
- `GET /api/detections/[id]` - Fetch single detection with image URL
- `PATCH /api/detections/[id]` - Update detection fields
- `DELETE /api/detections/[id]` - Soft delete (sets deleted_at)

### 7. Image Cropping for Thumbnail

**Decision**: Generate crop URL client-side using Supabase Storage transform

**Findings**:
- Supabase Storage supports image transforms including cropping
- Can generate crop region from detection bbox coordinates
- No backend cropping needed - use transform URL parameters

**Implementation**:
```typescript
const cropUrl = `${imageBaseUrl}?width=200&height=200&crop=origin&x=${bboxX}&y=${bboxY}`
```

Note: Supabase transform may not support arbitrary crop regions. Fallback: display full image with CSS object-fit on bbox region.

### 8. Filtering Soft-Deleted Detections

**Decision**: Filter at query level in all detection fetches

**Findings**:
- All queries fetching detections must include `WHERE deleted_at IS NULL`
- Modify `getDetectionsForImage()` in `lib/services/detections.ts`
- RLS policy should also enforce filtering for defense-in-depth

**Affected Queries**:
- `getDetectionsForImage()`
- `getDetection()`
- Photo detail page detection list
- Detection cards display

## Open Questions Resolved

| Question | Resolution |
|----------|------------|
| What happens with linked deer when detection is deleted? | Deer profile remains; detection just becomes invisible. Deer may have other detections. |
| Should deleted detections be recoverable? | Phase 2 feature - out of scope for MVP. Data retained in DB. |
| How to handle mobile layout? | Sheet component goes full-width on mobile (Tailwind breakpoints). |
| What if user clicks outside panel? | Standard Sheet behavior - clicking overlay closes panel (with no unsaved warning per spec). |

## Dependencies Identified

1. **shadcn/ui Sheet** - May need to add via `npx shadcn@latest add sheet`
2. **Database migration** - Add `deleted_at` column to detections
3. **Supabase Storage** - Existing, no changes needed

## Performance Considerations

1. **Panel opening**: No API call needed if detection data already in photo detail
2. **Save operation**: Single PATCH call, optimistic UI update
3. **Delete operation**: Single PATCH call (soft delete), remove from local list
4. **Re-fetch**: TanStack Query invalidation handles cache updates
