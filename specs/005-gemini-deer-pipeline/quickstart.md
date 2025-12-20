# Quickstart: Gemini Deer Analysis Pipeline

**Feature**: 005-gemini-deer-pipeline
**Date**: 2025-12-09

## Prerequisites

Before implementing this feature, ensure:

1. **Existing foundation is working**:
   - Photo upload and storage functional
   - User authentication working
   - Supabase database connected

2. **Environment variables**:
   ```bash
   # Add to .env.local
   GEMINI_API_KEY=your-gemini-api-key
   ```

3. **Dependencies installed**:
   ```bash
   npm install @google/genai zod zod-to-json-schema
   ```

---

## Implementation Order

### Phase 1: Foundation (P1 - Bulk Photo Analysis)

1. **Database Migration**
   - Run `supabase/migrations/008_gemini_analysis.sql`
   - Regenerate TypeScript types: `npx supabase gen types typescript --linked > types/database.ts`

2. **Gemini Client**
   - Create `lib/gemini/client.ts` - API wrapper
   - Create `lib/gemini/types.ts` - TypeScript interfaces
   - Create `lib/gemini/prompts.ts` - Analysis prompts

3. **Analysis Job**
   - Create `trigger/jobs/analyze-photo.ts`
   - Update `trigger/jobs/batch-process.ts` to use new job
   - Test with 10-photo batch

### Phase 2: Triage Dashboard (P2)

4. **API Updates**
   - Update `app/api/photos/route.ts` with new filters
   - Create `app/api/photos/stats/route.ts` for batch statistics

5. **UI Components**
   - Create `components/photos/triage-dashboard.tsx`
   - Update `components/photos/photo-filters.tsx` with point filters
   - Create `components/photos/buck-grid.tsx`

### Phase 3: Deer Catalog (P3)

6. **Catalog API**
   - Create `app/api/deer/route.ts`
   - Create `app/api/deer/[id]/route.ts`
   - Add `lib/services/deer.ts` service layer

7. **Catalog UI**
   - Create `components/deer/deer-catalog.tsx`
   - Create `components/deer/create-deer-modal.tsx`

### Phase 4: On-Demand Matching (P4)

8. **Comparison Job**
   - Create `trigger/jobs/compare-deer.ts`
   - Create `app/api/deer/match/route.ts`

### Phase 5: Match Review (P5)

9. **Review API**
   - Create match review endpoints (confirm, correct, reject, skip)
   - Update `lib/services/matching.ts`

10. **Review UI**
    - Create `components/deer/match-review-modal.tsx`
    - Update existing match review panel

### Phase 6: Cleanup (P6)

11. **Remove Legacy Code**
    - Delete Replicate jobs and client
    - Remove unused components
    - Clean up dependencies

---

## Quick Verification Steps

### After Phase 1 (Analysis)
```bash
# Upload test photos
curl -X POST http://localhost:3000/api/photos/upload -F "files=@test1.jpg"

# Check Trigger.dev logs
npx trigger.dev@latest dev

# Verify analysis results
# - Check images table has has_deer, deer_count populated
# - Check detections table has species, sex, antler_points
```

### After Phase 2 (Triage)
```bash
# Test filter endpoint
curl "http://localhost:3000/api/photos?sex=buck&min_points=10"

# Verify UI shows point filters
# - Open /photos page
# - Verify "10+" filter button works
```

### After Phase 3 (Catalog)
```bash
# Create deer via API
curl -X POST http://localhost:3000/api/deer \
  -H "Content-Type: application/json" \
  -d '{"name": "Big 12", "detection_id": "..."}'

# Verify catalog UI
# - Open /deer page
# - Verify deer appears with reference thumbnail
```

### After Phase 4 (Matching)
```bash
# Trigger matching
curl -X POST http://localhost:3000/api/deer/match

# Check Trigger.dev logs for compare-deer job
# Verify match_candidates table populated
```

### After Phase 5 (Review)
```bash
# Get pending matches
curl http://localhost:3000/api/deer/matches

# Confirm a match
curl -X POST "http://localhost:3000/api/deer/matches/{id}/confirm"

# Verify detection.deer_id is set
```

---

## Key Files Reference

| Purpose | Path |
|---------|------|
| Gemini client | `lib/gemini/client.ts` |
| Analysis types | `lib/gemini/types.ts` |
| Analysis prompts | `lib/gemini/prompts.ts` |
| Analysis job | `trigger/jobs/analyze-photo.ts` |
| Comparison job | `trigger/jobs/compare-deer.ts` |
| Photo service | `lib/services/photos.ts` |
| Deer service | `lib/services/deer.ts` |
| Matching service | `lib/services/matching.ts` |
| Triage dashboard | `components/photos/triage-dashboard.tsx` |
| Buck grid | `components/photos/buck-grid.tsx` |
| Deer catalog | `components/deer/deer-catalog.tsx` |
| Match review | `components/deer/match-review-modal.tsx` |
| DB migration | `supabase/migrations/008_gemini_analysis.sql` |

---

## Common Issues

### Gemini API Errors

**Issue**: Rate limit exceeded
```
Error: 429 Resource has been exhausted
```
**Solution**: Reduce concurrency limit in Trigger.dev job config, add exponential backoff

**Issue**: Invalid image format
```
Error: Image format not supported
```
**Solution**: Ensure images are PNG, JPEG, WEBP, HEIC, or HEIF. Convert others before upload.

### Database Issues

**Issue**: Column doesn't exist after migration
**Solution**: Regenerate types: `npx supabase gen types typescript --linked > types/database.ts`

**Issue**: RLS policy blocks background job
**Solution**: Use service role key in Trigger.dev environment variables

### Trigger.dev Issues

**Issue**: Job not triggering
**Solution**:
1. Ensure dev worker running: `npx trigger.dev@latest dev`
2. Check job is exported in `trigger/index.ts`
3. Verify environment variables set in Trigger.dev dashboard

---

## Environment Variables Summary

```env
# Required for this feature
GEMINI_API_KEY=your-gemini-api-key

# Existing (ensure set)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
TRIGGER_SECRET_KEY=...

# Can be removed after migration
# REPLICATE_API_TOKEN=...
# EMBEDDING_MODEL_VERSION=...
```
