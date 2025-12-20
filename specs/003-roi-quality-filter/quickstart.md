# Quickstart: ROI Selection & Quality Filtering

**Feature**: 003-roi-quality-filter
**Prerequisites**:
- TineSight dev environment running (`npm run dev`)
- Trigger.dev dev server running (`npx trigger.dev@latest dev`)
- Supabase project linked and migrations applied
- At least one photo uploaded with MegaDetector detections

## 1. Apply Database Migration

```bash
# Apply the ROI selection migration
npx supabase db push

# Or if using local Supabase
npx supabase migration up

# Regenerate TypeScript types
npx supabase gen types typescript --linked > types/database.ts
```

## 2. Install New Dependencies

```bash
npm install sharp
npm install -D @types/sharp
```

## 3. Verify Migration

Check that new tables exist:

```sql
-- Run in Supabase SQL Editor
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('detection_rois', 'roi_feedback');

-- Check new columns on detections
SELECT column_name FROM information_schema.columns
WHERE table_name = 'detections'
AND column_name IN ('quality_status', 'quality_score');
```

## 4. Test ROI Drawing (Manual)

1. Navigate to a photo detail page: `/photos/{photo-id}`
2. Click on a detection bounding box
3. Draw a rectangle around the head + antlers area
4. Click "Save ROI"
5. Verify ROI persists on page refresh

## 5. Test Reference Marking

1. Save an ROI on a detection
2. Toggle "Mark as Reference" on
3. Repeat for at least 3 detections
4. Verify reference count shows 3+

## 6. Test Embedding Regeneration

1. Save an ROI on a detection
2. Click "Regenerate Embedding"
3. Check Trigger.dev dashboard for job execution
4. Verify new embedding in database:

```sql
SELECT id, detection_id, created_at
FROM deer_embeddings
WHERE detection_id = 'your-detection-id'
ORDER BY created_at DESC;
```

## 7. Test Quality Filtering (Once References Exist)

1. Upload new photos
2. Wait for MegaDetector processing
3. Check quality scores:

```sql
SELECT id, quality_status, quality_score
FROM detections
WHERE image_id IN (
  SELECT id FROM images
  WHERE user_id = 'your-user-id'
  ORDER BY created_at DESC
  LIMIT 5
);
```

## Key Files Reference

| Purpose | Path |
|---------|------|
| ROI Drawing Component | `components/photos/roi-selector.tsx` |
| ROI Control Panel | `components/photos/roi-control-panel.tsx` |
| ROI Service Layer | `lib/services/roi.ts` |
| Quality Service | `lib/services/quality.ts` |
| Image Cropping | `lib/image/crop.ts` |
| Embedding Job | `trigger/jobs/generate-embedding.ts` |
| Quality Scoring Job | `trigger/jobs/compute-quality.ts` |
| ROI API Endpoints | `app/api/detections/[id]/roi/` |
| Migration | `supabase/migrations/005_roi_selection.sql` |

## Troubleshooting

### ROI not saving
- Check browser console for errors
- Verify user is authenticated
- Check RLS policies in Supabase

### Embedding regeneration failing
- Check Trigger.dev logs for errors
- Verify Sharp is installed correctly
- Check Supabase Storage bucket permissions

### Quality scores all NULL
- Need minimum 3 reference ROIs
- Check `count_reference_rois()` function
- Verify embeddings exist for reference detections

## Environment Variables

No new environment variables required. Feature uses existing:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TRIGGER_SECRET_KEY`
- `REPLICATE_API_TOKEN`
