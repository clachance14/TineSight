# Batch Match Actions Integration Guide

This document describes how to integrate the new `BatchMatchActions` component and `useBatchSelectionStore` into the existing `PendingMatchesSection` component.

## Overview

The batch match operations feature has been implemented with:

1. **Zustand Store** (`lib/stores/batch-selection.ts`) - Centralized selection state management
2. **API Endpoints** - REST endpoints for batch confirm/reject operations
3. **BatchMatchActions Component** (`components/trophy/batch-match-actions.tsx`) - Reusable UI component

## Current State

The `PendingMatchesSection` component (in `components/trophy/pending-matches-section.tsx`) currently implements batch actions using **local component state**:

```typescript
const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set())
```

It has batch action buttons inline at lines 113-154.

## Recommended Integration

### Option 1: Replace with BatchMatchActions Component (Recommended)

This approach centralizes the batch action UI in a reusable component.

**Step 1:** Import the new components

```typescript
import { BatchMatchActions } from './batch-match-actions'
import { useBatchSelectionStore } from '@/lib/stores/batch-selection'
```

**Step 2:** Replace local state with Zustand store

```typescript
// REMOVE:
// const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set())

// ADD:
const { isSelected, toggleSelection } = useBatchSelectionStore()
```

**Step 3:** Update checkbox to use Zustand store

```typescript
// Line 172 - CHANGE FROM:
<input
  type="checkbox"
  checked={isSelected}
  onChange={() => toggleSelectMatch(match.id, group.deer.id)}
  className="h-4 w-4 rounded border-slate-600 text-copper focus:ring-copper"
/>

// TO:
<input
  type="checkbox"
  checked={isSelected(match.id)}
  onChange={() => toggleSelection(match.id)}
  className="h-4 w-4 rounded border-slate-600 text-copper focus:ring-copper"
/>
```

**Step 4:** Replace inline batch actions (lines 112-155) with BatchMatchActions

```typescript
{/* Batch actions */}
{group.pending_matches.length > 0 && (
  <BatchMatchActions
    availableMatchIds={group.pending_matches.map((m) => m.id)}
    onSuccess={() => {
      // Optional: Add any additional refresh logic
      // The component already invalidates queries
    }}
  />
)}
```

**Step 5:** Remove unused helper functions

```typescript
// REMOVE:
const toggleSelectMatch = (matchId: string, deerId: string) => { ... }
const getSelectedForDeer = (deerId: string, group: PendingMatchGroup) => { ... }
```

**Step 6:** Remove unused props (if passed from parent)

```typescript
// The component no longer needs these props:
// onBatchConfirm?: (matchIds: string[]) => void
// onBatchReject?: (matchIds: string[]) => void
```

### Option 2: Keep Existing UI, Use Zustand Store Only

If you prefer to keep the current inline batch action buttons, you can still use the Zustand store for state management:

**Step 1:** Import the store and API functions

```typescript
import { useBatchSelectionStore } from '@/lib/stores/batch-selection'
import { useMutation, useQueryClient } from '@tanstack/react-query'
```

**Step 2:** Replace local state

```typescript
// REMOVE:
const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set())

// REPLACE WITH:
const { selectedMatchIds, isSelected, toggleSelection, clearSelection } = useBatchSelectionStore()
```

**Step 3:** Update all references to use the store

```typescript
// Update checkbox:
<input
  type="checkbox"
  checked={isSelected(match.id)}
  onChange={() => toggleSelection(match.id)}
/>

// Update getSelectedForDeer:
const getSelectedForDeer = (deerId: string, group: PendingMatchGroup) => {
  return group.pending_matches
    .filter((m) => isSelected(m.id))
    .map((m) => m.id)
}
```

**Step 4:** Update batch action handlers to use API endpoints

```typescript
const queryClient = useQueryClient()

const confirmMutation = useMutation({
  mutationFn: async (matchIds: string[]) => {
    const response = await fetch('/api/trophy/batch-confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ match_ids: matchIds }),
    })
    if (!response.ok) throw new Error('Failed to confirm')
    return response.json()
  },
  onSuccess: () => {
    clearSelection()
    queryClient.invalidateQueries({ queryKey: ['trophy-dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['pending-matches'] })
  },
})

// Use in buttons:
<Button onClick={() => confirmMutation.mutate(group.pending_matches.map(m => m.id))}>
  Accept All
</Button>
```

## Files Modified/Created

### Created Files

- ✅ `lib/stores/batch-selection.ts` - Zustand store for selection state
- ✅ `lib/services/matching.ts` - Added `batchConfirmMatches()` and `batchRejectMatches()` functions
- ✅ `app/api/trophy/batch-confirm/route.ts` - POST endpoint for batch confirm
- ✅ `app/api/trophy/batch-reject/route.ts` - POST endpoint for batch reject
- ✅ `components/trophy/batch-match-actions.tsx` - Reusable batch actions component

### Files to Modify

- ⚠️ `components/trophy/pending-matches-section.tsx` - Integrate new batch functionality (see options above)

## API Contracts

### POST /api/trophy/batch-confirm

**Request:**
```json
{
  "match_ids": ["uuid1", "uuid2", "uuid3"]
}
```

**Response:**
```json
{
  "confirmed_count": 3
}
```

**Errors:**
- `400` - Invalid request (empty array, invalid UUIDs)
- `401` - Unauthorized (not authenticated)
- `403` - Forbidden (matches belong to another user)
- `500` - Server error

### POST /api/trophy/batch-reject

**Request:**
```json
{
  "match_ids": ["uuid1", "uuid2", "uuid3"]
}
```

**Response:**
```json
{
  "rejected_count": 3
}
```

**Errors:**
- Same as batch-confirm

## Testing

### Unit Testing Checklist

- [ ] Test batch confirm with valid match IDs
- [ ] Test batch reject with valid match IDs
- [ ] Test with empty match_ids array
- [ ] Test with invalid UUID formats
- [ ] Test authorization (matches from different user)
- [ ] Test Zustand store state transitions

### Integration Testing Checklist

- [ ] Select multiple matches and confirm all
- [ ] Select multiple matches and reject all
- [ ] Verify selection clears after batch operation
- [ ] Verify query invalidation triggers list refresh
- [ ] Test "Select All" functionality
- [ ] Test "Clear Selection" functionality
- [ ] Verify toast notifications appear on success/error

## Migration Steps

1. **Review** - Decide between Option 1 (recommended) or Option 2
2. **Backup** - Commit current working state
3. **Integrate** - Follow chosen option's steps
4. **Test** - Run through integration testing checklist
5. **Deploy** - Ship to production

## Benefits

### Using BatchMatchActions Component

✅ **Separation of Concerns** - Batch action logic isolated in dedicated component
✅ **Reusability** - Can be used in other contexts (trophy dashboard, clusters)
✅ **Consistent UX** - Same batch action interface across features
✅ **Less Code** - No need to duplicate mutation logic
✅ **Built-in Loading States** - Spinners and disabled states handled
✅ **Toast Notifications** - Success/error feedback included

### Using Zustand Store

✅ **Centralized State** - Selection state accessible from any component
✅ **Performance** - Only re-renders components using the selection
✅ **Persistence Potential** - Easy to add localStorage persistence if needed
✅ **Debugging** - Can use Zustand devtools to inspect state

## Example Usage

```typescript
import { BatchMatchActions } from '@/components/trophy/batch-match-actions'

function MyComponent() {
  const matches = useQuery(['pending-matches'])

  return (
    <div>
      <BatchMatchActions
        availableMatchIds={matches.data?.map(m => m.id) ?? []}
        onSuccess={() => console.log('Batch operation complete!')}
      />

      {/* Your match list with checkboxes */}
    </div>
  )
}
```

## Notes

- The API endpoints validate that all match IDs belong to the authenticated user
- Batch operations are transactional - if any match fails, the entire batch succeeds but counts correctly
- Selection state persists across component re-renders but NOT across page refreshes (add to localStorage if needed)
- The store automatically clears selection after successful batch operations
