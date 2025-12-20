# Quickstart: Deer Profile Creation

**Feature**: 008-deer-profile-creation
**Date**: 2025-12-12

## Prerequisites

1. Development environment set up (Node.js, npm)
2. Supabase project linked and running
3. `.env.local` configured with Supabase credentials

## Quick Test (Existing Functionality)

Before making changes, verify the current state:

```bash
# Start dev server
npm run dev

# Navigate to deer catalog
open http://localhost:3000/deer
# Expected: Page loads (may be empty or show error due to schema mismatch)
```

## Implementation Order

### Step 1: Fix Schema Mismatch (Blocker)

**File**: `lib/services/deer.ts`

```bash
# Find all occurrences of account_id
grep -n "account_id" lib/services/deer.ts
```

Replace each `account_id` with `user_id`. Key locations:
- Interface definition (~line 5)
- `createDeer()` insert (~line 78)
- `getDeerCatalog()` filter (~line 114)
- `getDeerById()` filter (~line 150)
- `deleteDeer()` filter (~line 232)

**Verify**:
```bash
npm run type-check
# Navigate to /deer - should load without errors
```

### Step 2: Create Deer Detail Page

**Create files**:
```bash
mkdir -p app/\(dashboard\)/deer/\[id\]
touch app/\(dashboard\)/deer/\[id\]/page.tsx
touch app/\(dashboard\)/deer/\[id\]/deer-detail-client.tsx
```

**Server component structure** (`page.tsx`):
```typescript
import { createClient } from '@/lib/supabase/server'
import { getDeerById } from '@/lib/services/deer'
import { redirect } from 'next/navigation'
import { DeerDetailClient } from './deer-detail-client'

export default async function DeerDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: deer, error } = await getDeerById(user.id, params.id)

  if (error || !deer) {
    // Handle not found
  }

  return <DeerDetailClient initialDeer={deer} />
}
```

### Step 3: Add Create Deer Profile CTA

**File**: `components/photos/detection-edit-panel.tsx`

Add state for modal:
```typescript
const [createModalOpen, setCreateModalOpen] = useState(false)
```

Add conditional button + modal:
```typescript
{detection.sex === 'buck' && !detection.deer_id && (
  <>
    <Button onClick={() => setCreateModalOpen(true)}>
      Create Deer Profile
    </Button>
    <CreateDeerModal
      open={createModalOpen}
      onOpenChange={setCreateModalOpen}
      detectionId={detection.id}
      onSuccess={(deer) => router.push(`/deer/${deer.id}`)}
    />
  </>
)}
```

### Step 4: Create Sightings Grid Component

**File**: `components/deer/sightings-grid.tsx`

```typescript
interface SightingsGridProps {
  sightings: Sighting[]
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}
```

### Step 5: Add Pagination to API

**File**: `app/api/deer/[id]/route.ts`

Update GET handler to accept and return pagination:
```typescript
const page = parseInt(searchParams.get('page') ?? '1')
const pageSize = parseInt(searchParams.get('pageSize') ?? '20')

// Slice sightings for pagination
const startIndex = (page - 1) * pageSize
const paginatedSightings = sightings.slice(startIndex, startIndex + pageSize)

return NextResponse.json({
  ...deer,
  sightings: paginatedSightings,
  pagination: {
    page,
    pageSize,
    total: sightings.length,
    totalPages: Math.ceil(sightings.length / pageSize)
  }
})
```

## Verification Checklist

- [ ] Deer catalog page loads without errors
- [ ] Can navigate to deer detail page from catalog
- [ ] Deer detail page shows name, notes, reference image
- [ ] Sightings grid shows linked detections with pagination
- [ ] Can click sighting to navigate to source photo
- [ ] Detection edit panel shows "Create Deer Profile" for unlinked bucks
- [ ] Creating deer profile redirects to new deer detail page
- [ ] Can edit deer name and notes from detail page

## Common Issues

### "column account_id does not exist"
→ Schema mismatch not fixed. Replace `account_id` with `user_id` in `lib/services/deer.ts`.

### "Deer not found" on valid ID
→ Check RLS policies. Ensure user owns the deer or is a team member.

### Modal doesn't open
→ Check that detection has `sex === 'buck'` and `deer_id === null`.
