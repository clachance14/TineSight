# Quickstart: Photo Confidence Filter

**Feature**: 004-photo-confidence-filter
**Time to implement**: ~2-3 hours

## Prerequisites

- TineSight development environment running
- Photos uploaded with completed detection processing
- Access to `components/photos/`, `lib/services/`, `app/api/photos/`

## Implementation Order

### Step 1: Add Slider Component (15 min)

```bash
# Try shadcn CLI first
npx shadcn@latest add slider

# If not available, create manually
# Copy from: https://ui.shadcn.com/docs/components/slider
```

**File**: `components/ui/slider.tsx`

### Step 2: Update Filter Types (10 min)

**Files to update**:
1. `components/photos/photo-filters.tsx` - Add `minConfidence` to interface
2. `lib/services/photos.ts` - Add `minConfidence` to service interface

```typescript
// Add to PhotoFilters interface
minConfidence?: number | undefined  // 0-100
```

### Step 3: Update Service Layer (30 min)

**File**: `lib/services/photos.ts`

Add confidence filtering logic to `getPhotos()`:

```typescript
if (filters?.minConfidence !== undefined) {
  const threshold = filters.minConfidence / 100

  const { data: confidentDetections } = await supabase
    .from('detections')
    .select('image_id')
    .gte('confidence', threshold)

  const confidentImageIds = [...new Set(
    (confidentDetections ?? []).map(d => d.image_id)
  )]

  if (confidentImageIds.length === 0) {
    return { data: [], error: null, count: 0 }
  }

  // Add .in('id', confidentImageIds) to query
}
```

### Step 4: Update API Route (15 min)

**File**: `app/api/photos/route.ts`

Parse `minConfidence` query parameter:

```typescript
const minConfidenceParam = searchParams.get('minConfidence')
let minConfidence: number | undefined

if (minConfidenceParam !== null) {
  const parsed = parseInt(minConfidenceParam, 10)
  if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
    minConfidence = parsed
  }
}

// Add to filters object
if (minConfidence !== undefined) {
  filters.minConfidence = minConfidence
}
```

### Step 5: Update Hook (10 min)

**File**: `lib/hooks/use-photos.ts`

Add `minConfidence` to URL params:

```typescript
if (filters?.minConfidence !== undefined) {
  params.append('minConfidence', String(filters.minConfidence))
}
```

### Step 6: Update Filter UI (45 min)

**File**: `components/photos/photo-filters.tsx`

1. Import Slider component
2. Add confidence filter section with slider + toggle
3. Update `hasActiveFilters` calculation
4. Update `getActiveFilterCount()`
5. Update `clearFilters()`
6. Add confidence chip to Active Filters Summary

### Step 7: Update Page Default State (15 min)

**File**: `app/(dashboard)/photos/page.tsx`

1. Change default filter values:
   ```typescript
   hasDeer: true,        // Was: null
   minConfidence: 50,    // New
   ```

2. Add URL params handling for shared links
3. Add "Copy link" button

### Step 8: Add E2E Test (30 min)

**File**: `tests/e2e/photo-filters.spec.ts`

```typescript
test('confidence filter hides low-confidence photos', async ({ page }) => {
  await page.goto('/photos')

  // Verify default filters applied
  await expect(page.getByText('Confidence: >=50%')).toBeVisible()

  // Adjust slider and verify photos update
  // ...
})
```

## Verification Checklist

- [ ] Slider appears in filter panel
- [ ] Default filters applied on page load (hasDeer=true, minConfidence=50)
- [ ] Photos update immediately when slider moves
- [ ] Toggle on/off preserves threshold value
- [ ] "Copy link" generates shareable URL
- [ ] Shared URL restores filter state
- [ ] Empty results show helpful message
- [ ] E2E test passes

## Common Issues

### Slider not styled correctly
Ensure TineSight theme colors are applied in `slider.tsx`:
- Track: `bg-secondary`
- Range: `bg-primary` (Copper)
- Thumb: `border-primary`

### Photos not filtering
Check that:
1. Service converts 0-100 to 0-1 (divide by 100)
2. Hook sends `minConfidence` as URL param
3. API route parses as integer

### URL state not working
Verify `useSearchParams()` is used in a client component (`'use client'` directive)
