# Quickstart: Photo Location Feature

**Feature**: 010-photo-location
**Estimated Tasks**: 10
**Prerequisites**: Mapbox account with access token

## Setup Checklist

### 1. Environment Setup

```bash
# Install dependencies
npm install react-map-gl mapbox-gl
npm install -D @types/mapbox-gl

# Add to .env.local (get token from https://account.mapbox.com/access-tokens/)
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.eyJ1Ijoi...your_token_here
```

### 2. Database Migration

```bash
# Apply migration
npx supabase db push

# Regenerate types
npx supabase gen types typescript --linked > types/database.ts
```

### 3. Verify Setup

```bash
# Type check should pass
npm run type-check

# Dev server should start
npm run dev
```

## Implementation Order

| # | Task | Files | Dependencies |
|---|------|-------|--------------|
| 1 | Database migration | `supabase/migrations/025_batch_location.sql` | None |
| 2 | Install dependencies | `package.json`, `.env.example` | None |
| 3 | Add location types to store | `lib/stores/upload.ts` | Task 1 |
| 4 | Create location picker modal | `components/photos/location-picker-modal.tsx` | Task 2 |
| 5 | Integrate modal into upload page | `app/(dashboard)/upload/page.tsx`, `components/photos/photo-uploader.tsx` | Task 3, 4 |
| 6 | Update upload API to save location | `app/api/photos/upload/route.ts`, `lib/services/batches.ts` | Task 1, 3 |
| 7 | Add area filter to photos service | `lib/services/photos.ts` | Task 1 |
| 8 | Create areas API endpoint | `app/api/photos/areas/route.ts`, `lib/services/batches.ts` | Task 1 |
| 9 | Add area filter to UI | `lib/hooks/use-areas.ts`, `components/photos/photo-filters.tsx`, `app/(dashboard)/photos/page.tsx` | Task 7, 8 |
| 10 | Add integration tests | `tests/e2e/photo-location.spec.ts` | All above |

## Key Files Quick Reference

### New Files
- `components/photos/location-picker-modal.tsx` - Mapbox map with pin placement
- `lib/hooks/use-areas.ts` - Hook to fetch area names
- `app/api/photos/areas/route.ts` - API endpoint for distinct area names
- `supabase/migrations/025_batch_location.sql` - Database schema changes

### Modified Files
- `lib/stores/upload.ts` - Add LocationData type and state
- `lib/services/batches.ts` - Accept location in createBatch
- `lib/services/photos.ts` - Add areaName to filters
- `app/api/photos/upload/route.ts` - Accept location fields
- `components/photos/photo-uploader.tsx` - Trigger location picker
- `components/photos/photo-filters.tsx` - Add area dropdown
- `app/(dashboard)/upload/page.tsx` - Integrate location modal
- `app/(dashboard)/photos/page.tsx` - Pass areas to filter component

## Testing the Feature

### Manual Test Flow

1. **Upload with location**:
   - Go to `/upload`
   - Drop photos onto uploader
   - Location picker modal should appear
   - Click map to place pin
   - Enter area name (e.g., "North Ridge")
   - Click "Confirm Location"
   - Start upload, verify completion

2. **Upload without location**:
   - Go to `/upload`
   - Drop photos onto uploader
   - Click "Skip - Upload without location"
   - Verify upload proceeds normally

3. **Filter by area**:
   - Go to `/photos`
   - Area dropdown should show named areas
   - Select an area, verify filter works
   - Select "No Area Assigned", verify photos without location shown
   - Select "All Areas", verify all photos shown

### Verify in Database

```sql
-- Check location data saved
SELECT id, area_name, location_lat, location_lng, direction_compass
FROM processing_batches
WHERE area_name IS NOT NULL
LIMIT 10;
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Map not loading | Check NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN in .env.local |
| CSS not applied | Ensure `mapbox-gl/dist/mapbox-gl.css` is imported |
| Type errors | Run `npx supabase gen types typescript --linked > types/database.ts` |
| Area dropdown empty | Upload at least one batch with location first |
