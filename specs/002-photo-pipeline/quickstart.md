# Quickstart: Photo Pipeline

**Feature**: 002-photo-pipeline
**Date**: 2025-12-02

This guide covers the setup required to implement the photo pipeline feature.

## Prerequisites

- [x] `001-saas-foundation` complete and working
- [x] Supabase project configured with auth
- [ ] Trigger.dev account and project
- [ ] Replicate account with API token
- [ ] MegaDetector deployed to Replicate

## Step 1: Environment Variables

Add to `.env.local`:

```bash
# Trigger.dev
TRIGGER_API_KEY=tr_dev_xxx
TRIGGER_API_URL=https://api.trigger.dev

# Replicate
REPLICATE_API_TOKEN=r8_xxx

# MegaDetector model (deployed to Replicate)
MEGADETECTOR_MODEL_VERSION=your-username/megadetector:version-hash

# Re-ID embedding model
EMBEDDING_MODEL_VERSION=your-username/deer-embedding:version-hash
```

Update `.env.example` with placeholder keys.

## Step 2: Database Migration

Run the migration to add new tables:

```bash
# Generate migration file
npx supabase migration new photo_pipeline

# Copy content from data-model.md into:
# supabase/migrations/YYYYMMDD_photo_pipeline.sql

# Push to Supabase
npx supabase db push
```

### Migration Verification

```sql
-- Verify new tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('processing_batches', 'match_candidates');

-- Verify deer_embeddings.deer_id is nullable
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'deer_embeddings' AND column_name = 'deer_id';

-- Verify find_similar_deer function
SELECT routine_name FROM information_schema.routines
WHERE routine_name = 'find_similar_deer';
```

## Step 3: Supabase Storage Bucket

Create `photos` bucket via Supabase Dashboard:

1. Go to Storage → New Bucket
2. Name: `photos`
3. Public: No (private)
4. File size limit: 50MB
5. Allowed MIME types: `image/jpeg`, `image/png`, `image/heic`, `image/webp`

Or via SQL:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photos',
  'photos',
  false,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/webp']
);
```

### Storage RLS Policies

Apply via Supabase Dashboard → Storage → Policies → photos bucket:

**Policy: Users upload to own folder**
- Operation: INSERT
- Policy:
```sql
bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text
```

**Policy: Users view own photos**
- Operation: SELECT
- Policy:
```sql
bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text
```

**Policy: Users delete own photos**
- Operation: DELETE
- Policy:
```sql
bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text
```

## Step 4: Trigger.dev Setup

### Install SDK

```bash
npm install @trigger.dev/sdk @trigger.dev/nextjs
```

### Initialize Project

```bash
npx trigger.dev@latest init
```

This creates:
- `trigger.config.ts` - Configuration
- `trigger/` directory - Job files

### Configure Environment

Update `trigger.config.ts`:

```typescript
import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "proj_xxx", // from Trigger.dev dashboard
  runtime: "node",
  logLevel: "log",
  maxDuration: 300, // 5 min max for ML jobs
  dirs: ["./trigger"],
});
```

### Deploy Jobs

```bash
npx trigger.dev@latest deploy
```

### Verify Connection

```bash
npx trigger.dev@latest dev
```

## Step 5: Replicate Setup

### Install SDK

```bash
npm install replicate
```

### Deploy MegaDetector Model

MegaDetector is not natively on Replicate. Options:

**Option A: Use existing community model**
- Search Replicate for "megadetector"
- Use existing deployment if available

**Option B: Deploy as Cog model**
1. Clone MegaDetector repo
2. Create `cog.yaml`:
```yaml
build:
  python_version: "3.10"
  python_packages:
    - torch
    - torchvision
    - pillow
predict: "predict.py:Predictor"
```
3. Push to Replicate:
```bash
cog login
cog push r8.im/your-username/megadetector
```

**Option C: Use alternative detection model**
- YOLO-World: `zsxkib/yolo-world` (prompt: "deer")
- Works but less accurate for wildlife

### Test Connection

```typescript
import Replicate from "replicate";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

const output = await replicate.run("your-model:version", {
  input: { image: "https://example.com/deer.jpg" }
});

console.log(output);
```

## Step 6: Generate TypeScript Types

After migration, regenerate database types:

```bash
npx supabase gen types typescript --linked > types/database.ts
```

Verify new types exist:
- `Tables['processing_batches']`
- `Tables['match_candidates']`

## Step 7: Verification Checklist

- [ ] `.env.local` has all new environment variables
- [ ] Migration applied: `processing_batches` table exists
- [ ] Migration applied: `match_candidates` table exists
- [ ] Migration applied: `deer_embeddings.deer_id` is nullable
- [ ] Migration applied: `find_similar_deer` function exists
- [ ] Migration applied: `images.batch_id` column exists
- [ ] Storage bucket `photos` created
- [ ] Storage RLS policies applied
- [ ] Trigger.dev `npx trigger.dev@latest dev` connects successfully
- [ ] Replicate test call returns valid response
- [ ] TypeScript types regenerated and include new tables

## Troubleshooting

### Migration Errors

**Error**: `relation "processing_batches" already exists`
- Solution: Check if migration already ran, or drop table first in dev

**Error**: `foreign key constraint violation`
- Solution: Ensure `profiles` table has data before inserting batches

### Storage Errors

**Error**: `new row violates row-level security policy`
- Solution: Verify user is authenticated and uploading to their own folder
- Check that folder name starts with `auth.uid()`

### Trigger.dev Errors

**Error**: `Failed to connect to Trigger.dev`
- Solution: Verify `TRIGGER_API_KEY` is correct
- Run `npx trigger.dev@latest whoami` to check auth

### Replicate Errors

**Error**: `Invalid model version`
- Solution: Verify model exists and version hash is correct
- Use Replicate API explorer to test model

## Next Steps

After setup is complete:
1. Run `/speckit.tasks` to generate implementation tasks
2. Implement in order: Upload → Detection → Embedding → Matching
3. Test each phase independently before moving to next
