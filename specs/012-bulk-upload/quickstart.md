# Quickstart: 10K Photo Bulk Upload

**Feature**: 012-bulk-upload | **Date**: 2025-12-26

## Prerequisites

- Node.js 18+
- Supabase CLI installed (`npm install -g supabase`)
- Supabase project linked (`npx supabase link`)
- Environment variables configured in `.env.local`

## Setup Steps

### 1. Run Database Migration

```bash
# Generate the migration (already in specs)
npx supabase db push

# Or apply manually:
npx supabase migration up
```

**Migration adds**:
- `original_filename` column to `images` table
- `idx_images_dedup` index for duplicate detection
- Progress columns to `upload_sessions` table

### 2. Install Dependencies

```bash
# exifr for EXIF extraction in Web Worker
npm install exifr

# Already installed (verify versions):
npm list @supabase/supabase-js  # Should be 2.x+
npm list @tanstack/react-query  # Should be 5.x+
```

### 3. Create Web Worker (TypeScript)

Create `app/(dashboard)/upload/exif.worker.ts`:

```typescript
import * as exifr from 'exifr'

self.onmessage = async (e: MessageEvent) => {
  const { id, buffer } = e.data

  try {
    const exif = await exifr.parse(buffer, {
      pick: ['Make', 'Model', 'DateTimeOriginal', 'GPSLatitude', 'GPSLongitude']
    })

    self.postMessage({
      id,
      success: true,
      exif: exif || {}
    })
  } catch (error) {
    self.postMessage({
      id,
      success: false,
      error: error instanceof Error ? error.message : 'EXIF extraction failed'
    })
  }
}
```

### 4. Configure Next.js for Web Workers

Update `next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.module.rules.push({
        test: /\.worker\.ts$/,
        use: { loader: 'worker-loader' }
      })
    }
    return config
  }
}

module.exports = nextConfig
```

### 5. Create Realtime Hook

Create `lib/hooks/useRealtimePhotos.ts`:

```typescript
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

export function useRealtimePhotos(userId: string) {
  const queryClient = useQueryClient()
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    const supabase = createClient()

    channelRef.current = supabase
      .channel(`photos:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'images',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          // Optimistic update for instant UI feedback
          queryClient.setQueryData(
            ['photos', userId],
            (old: any[] | undefined) => {
              if (!old) return old
              return old.map(photo =>
                photo.id === payload.new.id ? { ...photo, ...payload.new } : photo
              )
            }
          )
        }
      )
      .subscribe()

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [userId, queryClient])
}
```

### 6. Verify Realtime is Enabled

```bash
# Check Supabase dashboard or run:
npx supabase db query "SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';"

# Should show 'images' table
```

## Quick Verification

### Test EXIF Extraction

```typescript
// In browser console on upload page:
const worker = new Worker('/exif.worker.js')
const file = document.querySelector('input[type=file]').files[0]
const buffer = await file.slice(0, 128 * 1024).arrayBuffer()

worker.postMessage({ id: 'test', buffer }, [buffer])
worker.onmessage = (e) => console.log('EXIF:', e.data)
```

### Test Duplicate Check API

```bash
curl -X POST http://localhost:3000/api/photos/check-duplicates \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"files": [{"filename": "test.jpg", "size": 1234567}]}'
```

### Test Realtime Subscription

```typescript
// In browser console:
const supabase = createClient()
supabase
  .channel('test')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'images' }, console.log)
  .subscribe()

// Then update an image in Supabase dashboard - should see console output
```

## Key Configuration Values

| Setting | Value | Location |
|---------|-------|----------|
| Chunk size | 25 files | `lib/upload/chunker.ts` |
| Parallel uploads | 5 concurrent | `lib/upload/uploader.ts` |
| Worker pool size | 4-8 (CPU cores) | `lib/workers/ExifWorkerPool.ts` |
| Max retries | 3 | `lib/upload/uploader.ts` |
| EXIF slice size | 128 KB | `exif.worker.ts` |
| Signed URL validity | 2 hours | Supabase default |

## Common Issues

### "Worker not found" Error

Ensure worker file is in correct location and `next.config.js` has worker-loader configured.

### Realtime Not Receiving Updates

1. Check `images` table is in `supabase_realtime` publication
2. Verify `REPLICA IDENTITY FULL` is set on images table
3. Confirm user_id filter matches authenticated user

### Memory Issues on Large Uploads

1. Reduce chunk size from 25 to 10
2. Ensure Web Worker is processing (not main thread)
3. Check browser DevTools Memory tab

## Next Steps

After quickstart verification:

1. Run `/speckit.tasks` to generate implementation tasks
2. Implement in order: Worker → API → UI → Tests
3. Test with 100+ photos before 10K scale test

## Related Documents

- [Spec](./spec.md) - Requirements and acceptance criteria
- [Research](./research.md) - Technical decisions and rationale
- [Data Model](./data-model.md) - Database changes
- [API Contract](./contracts/upload-api.yaml) - OpenAPI specification
