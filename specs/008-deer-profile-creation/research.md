# Research: Deer Profile Creation

**Feature**: 008-deer-profile-creation
**Date**: 2025-12-12

## Research Tasks Completed

### 1. Schema Alignment Investigation

**Question**: Why does `lib/services/deer.ts` use `account_id` when the DB uses `user_id`?

**Decision**: Align service layer to use `user_id` (match DB schema)

**Rationale**:
- Database `deer` table definitively uses `user_id` (per `types/database.ts` line 109)
- Other tables (`images`, `cameras`) also use `user_id` pattern
- RLS policies reference `user_id` via `auth.uid()`
- The `account_id` pattern is used in `team_members` table for multi-tenant access, but `deer` follows simpler owner pattern

**Alternatives Considered**:
- Migrate DB to use `account_id`: Rejected - would require migration + RLS policy changes
- Keep mismatch: Rejected - causes runtime errors

### 2. Existing API Review

**Question**: Do deer API endpoints need modification?

**Decision**: Minor updates only - add pagination support to GET /api/deer/[id]

**Rationale**:
- `POST /api/deer` already accepts `{ name, notes, detection_id }` - works as-is
- `GET /api/deer/[id]` returns sightings but lacks pagination - need to add
- `PATCH /api/deer/[id]` accepts `{ name?, notes? }` - works as-is
- `DELETE /api/deer/[id]` - works as-is

**Alternatives Considered**:
- New endpoints: Rejected - existing contracts sufficient
- GraphQL: Rejected - REST pattern established in codebase

### 3. Page Structure Pattern

**Question**: Server component vs client component for deer detail page?

**Decision**: Hybrid - server component wrapper with client component for interactivity

**Rationale**:
- Follows established pattern in `app/(dashboard)/photos/[id]/page.tsx`
- Server component handles auth check and initial data fetch
- Client component handles edit mode, form state, navigation
- Enables SSR for SEO (not critical for this app, but good practice)

**Alternatives Considered**:
- Full client component: Rejected - loses SSR benefits, duplicates auth logic
- Full server component: Rejected - can't handle edit interactivity

### 4. Pagination Strategy

**Question**: How to paginate sightings on deer detail page?

**Decision**: Server-side pagination with page/pageSize query params

**Rationale**:
- Matches clarification answer: 20 per page with navigation
- Keeps payload small for deer with many sightings
- Enables URL-based navigation (shareable links)
- Simpler than infinite scroll for bounded data

**Alternatives Considered**:
- Infinite scroll: Rejected - overkill for ~10-100 sightings typical
- Client-side pagination: Rejected - fetches all data upfront, wastes bandwidth

### 5. CTA Placement

**Question**: Where should "Create Deer Profile" button appear?

**Decision**: In detection edit panel, conditionally shown for unlinked buck detections

**Rationale**:
- Users already interact with detections in this panel
- Natural flow: select detection → see details → create profile
- Keeps action close to the data it operates on
- Modal pattern already established with `CreateDeerModal`

**Alternatives Considered**:
- Separate "Create Deer" page: Rejected - breaks flow, requires navigation
- Context menu on detection overlay: Rejected - less discoverable

## Dependencies Verified

| Dependency | Status | Notes |
|------------|--------|-------|
| `CreateDeerModal` | EXISTS | `components/deer/create-deer-modal.tsx` |
| `useDeer` hook | EXISTS | `lib/hooks/use-deer.ts` |
| `useCreateDeer` hook | EXISTS | `lib/hooks/use-deer.ts` |
| `useUpdateDeer` hook | EXISTS | `lib/hooks/use-deer.ts` |
| `getDeerById` service | EXISTS | `lib/services/deer.ts` (needs user_id fix) |
| Detection edit panel | EXISTS | `components/photos/detection-edit-panel.tsx` |
| Deer catalog page | EXISTS | `app/(dashboard)/deer/page.tsx` |

## Open Questions

None - all research questions resolved.
