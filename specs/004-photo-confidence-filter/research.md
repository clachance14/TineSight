# Research: Photo Confidence Filter

**Feature**: 004-photo-confidence-filter
**Date**: 2025-12-07

## Research Tasks

### 1. Slider Component Implementation

**Question**: How to add a slider component following shadcn/ui patterns?

**Decision**: Use `@radix-ui/react-slider` with shadcn/ui styling

**Rationale**:
- shadcn/ui is built on Radix primitives (constitution requirement)
- Radix Slider provides accessibility (ARIA) out of the box
- Can be styled with TineSight's Copper accent color

**Alternatives Considered**:
- Native HTML `<input type="range">` - Rejected: Limited styling options, inconsistent cross-browser
- Custom slider from scratch - Rejected: Unnecessary complexity, accessibility concerns

**Implementation**:
```bash
npx shadcn@latest add slider
```
If CLI unavailable, create `components/ui/slider.tsx` following progress.tsx pattern.

---

### 2. URL State for Shared Links

**Question**: How to encode filter state in URL for "Copy link" feature?

**Decision**: Use Next.js `useSearchParams` + `URLSearchParams`

**Rationale**:
- Native browser API, no additional dependencies
- Works with Next.js App Router
- Preserves existing session state pattern while adding shareable URL generation

**Alternatives Considered**:
- nuqs library - Rejected: Additional dependency not needed for simple use case
- Base64 encoded state - Rejected: Not human-readable, hard to debug

**Implementation Pattern**:
```typescript
// Generate shareable URL
const copyFilterUrl = () => {
  const params = new URLSearchParams()
  if (filters.hasDeer !== null) params.set('hasDeer', String(filters.hasDeer))
  if (filters.minConfidence !== undefined) params.set('minConfidence', String(filters.minConfidence))
  // ... other filters
  navigator.clipboard.writeText(`${window.location.origin}/photos?${params}`)
}

// Restore from URL on page load
const searchParams = useSearchParams()
const urlMinConfidence = searchParams.get('minConfidence')
if (urlMinConfidence) {
  setFilters(prev => ({ ...prev, minConfidence: parseInt(urlMinConfidence, 10) }))
}
```

---

### 3. Database Query Performance

**Question**: How to efficiently filter photos by detection confidence with 10,000+ photos?

**Decision**: Use subquery pattern already established for `qualityStatus` filtering

**Rationale**:
- Existing pattern in `lib/services/photos.ts` (lines 53-112) uses subquery for detections join
- Supabase handles query optimization
- `detections.confidence` column already indexed implicitly (frequently queried)

**Alternatives Considered**:
- Store max confidence on images table - Rejected: Denormalization adds sync complexity
- Client-side filtering - Rejected: Doesn't scale to 10,000+ photos, wastes bandwidth

**Query Pattern**:
```typescript
// Get image IDs where ANY detection meets threshold
const { data: confidentDetections } = await supabase
  .from('detections')
  .select('image_id')
  .gte('confidence', threshold / 100) // Convert 0-100 to 0-1

const imageIds = [...new Set(confidentDetections.map(d => d.image_id))]
// Then filter images by these IDs
```

---

### 4. Default Filter State

**Question**: How to implement "filters ON by default" without breaking existing behavior?

**Decision**: Change `useState` initial values in photos page component

**Rationale**:
- Simple state change, no architectural impact
- Respects URL params if present (shared links override defaults)
- User can still clear all filters to see everything

**Implementation**:
```typescript
// Before (current)
const [filters, setFilters] = useState<PhotoFiltersType>({
  status: 'all',
  hasDeer: null,           // null = no filter
  batchId: undefined,
  qualityStatus: 'all',
})

// After
const [filters, setFilters] = useState<PhotoFiltersType>({
  status: 'all',
  hasDeer: true,           // ON by default
  batchId: undefined,
  qualityStatus: 'all',
  minConfidence: 50,       // 50% default threshold
})
```

---

### 5. Filter Toggle Behavior

**Question**: How to toggle confidence filter on/off while preserving threshold value?

**Decision**: Use `undefined` for "off", number for "on" with threshold

**Rationale**:
- Consistent with existing nullable filter patterns
- Clear semantic: `undefined` = disabled, `number` = enabled with value
- Preserves threshold in component state even when "toggled off"

**Implementation**:
```typescript
interface PhotoFilters {
  // existing fields...
  minConfidence?: number | undefined  // undefined = filter disabled
}

// Toggle handler preserves threshold
const [lastConfidence, setLastConfidence] = useState(50)

const handleConfidenceToggle = () => {
  if (filters.minConfidence !== undefined) {
    setLastConfidence(filters.minConfidence)
    setFilters(prev => ({ ...prev, minConfidence: undefined }))
  } else {
    setFilters(prev => ({ ...prev, minConfidence: lastConfidence }))
  }
}
```

---

## Resolved Questions Summary

| Question | Decision | Impact |
|----------|----------|--------|
| Slider component | shadcn/ui + Radix primitive | Low risk, established pattern |
| URL state | URLSearchParams + useSearchParams | Low risk, native APIs |
| Query performance | Subquery pattern (existing) | Low risk, proven approach |
| Default filters | useState initial values | Low risk, simple change |
| Toggle behavior | undefined = off, number = on | Low risk, clear semantics |

**All research questions resolved. Ready for Phase 1: Design & Contracts.**
