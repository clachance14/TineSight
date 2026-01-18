# Research: 10K Photo Bulk Upload

**Feature**: 012-bulk-upload | **Date**: 2025-12-26

## Overview

Research findings for implementing memory-efficient bulk uploads (10,000+ photos) with Web Workers, parallel uploads to Supabase Storage, and real-time gallery updates via Supabase Realtime.

---

## 1. Web Workers for File Processing

### Decision: Use `exifr` Library with Worker Pool Pattern

**Choice**: `exifr` (lite bundle)
**Alternatives Considered**: `exif-js` (abandoned), `exifreader` (slower)

**Rationale**:
- **Performance**: 2.5ms/file average (vs 9.5ms for exifreader)
- **Web Worker support**: Explicit documentation and examples
- **Efficiency**: Doesn't brute-force read entire file; uses structure pointers
- **Format support**: JPEG, HEIC, WebP, TIFF (all trail camera formats)

### Memory Management Pattern

| Level | Chunk Size | Purpose |
|-------|------------|---------|
| File Selection | 100-200 files | Prevent browser freeze on folder select |
| Batch Processing | 25 files | Upload concurrency (from spec) |
| Worker Sub-batch | 5 files | Prevent GC pauses in worker |

**Binary Slicing Optimization**: Extract only first 128KB of each file for EXIF parsing (covers EXIF + IPTC metadata).

```typescript
const EXIF_MAX_SIZE = 128 * 1024 // 128KB
const slice = await file.slice(0, EXIF_MAX_SIZE).arrayBuffer()
worker.postMessage({ buffer: slice }, [slice]) // Transferable
```

### Communication Pattern

| Data Type | Method | Rationale |
|-----------|--------|-----------|
| File ArrayBuffer | Transferable Objects | 46x speedup (302ms → 6.6ms for 32MB) |
| EXIF Metadata | Structured Cloning | Small payloads (<10KB), simpler API |

### Worker Pool Architecture

```
components/upload/
├── FileProcessor.worker.ts    # EXIF extraction with exifr
└── lib/workers/
    └── ExifWorkerPool.ts      # Pool manager (4-8 workers)
```

**Pool Size**: Match `navigator.hardwareConcurrency || 4`

---

## 2. Parallel Uploads to Supabase Storage

### Decision: Batch Signed URLs with Adaptive Concurrency

**URL Generation**: Batch generation via `/api/photos/signed-urls` endpoint using `Promise.all()`

**Rationale**:
- Single API round-trip instead of N
- Supabase SDK handles concurrent `createSignedUploadUrl()` calls efficiently

### Signed URL Expiry

| Type | Duration | Notes |
|------|----------|-------|
| Upload URLs | 2 hours (fixed) | Non-configurable in Supabase |
| Download URLs | Configurable | Current: 1 hour |

**Implication**: 2-hour upload window is sufficient for bulk uploads; no URL refresh needed mid-upload.

### Concurrency Limits

| Connection | Concurrent Uploads | Chunk Size |
|-----------|-------------------|------------|
| Fast (10+ Mbps) | 6-8 | 25-50 files |
| Normal (5 Mbps) | 4-6 | 15-25 files |
| Slow (1 Mbps) | 2-3 | 5-10 files |
| Very Slow (<1 Mbps) | 1-2 | 3-5 files |

**Implementation**: Use existing `useAdaptiveThrottle()` hook with AIMD algorithm.

### Retry Strategy

**Pattern**: Exponential backoff with jitter (max 3 retries)

```typescript
const exponentialBackoff = (attempt: number, baseDelay = 1000) => {
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1)
  const jitter = Math.random() * exponentialDelay * 0.1 // 10% jitter
  return Math.min(exponentialDelay + jitter, 30000) // Cap at 30s
}
```

| Attempt | Base Delay | With Jitter (range) |
|---------|-----------|---------------------|
| 1 | 1s | 1.0-1.1s |
| 2 | 2s | 2.0-2.2s |
| 3 | 4s | 4.0-4.4s |

**Transient Errors Only**:
- Network errors (XHR status 0)
- Timeout errors (status 408)
- Server errors (5xx)
- Rate limiting (429)

**Do Not Retry**: Client errors (4xx except 408, 429)

### Pipelining Pattern

```
Round N: Fetch URLs ──────► Upload files
                              │
Round N+1: Fetch URLs ────────┘ (overlapped)
```

**Benefit**: Hides API latency (~100-300ms per batch), reduces total time ~30%.

---

## 3. Supabase Realtime Subscription

### Decision: postgres_changes with TanStack Query Invalidation

**Pattern**: `channel.on('postgres_changes')` filtered by `account_id`

```typescript
const channel = supabase
  .channel(`photos:${accountId}`)
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'photos',
      filter: `account_id=eq.${accountId}`
    },
    handleUpdate
  )
  .subscribe()
```

### Filter Syntax

| Operator | Example | Purpose |
|----------|---------|---------|
| `eq` | `account_id=eq.123` | Exact match |
| `in` | `status=in.(pending,processing)` | Array membership |
| `neq` | `deleted=neq.true` | Not equal |

### Lifecycle Management

**Status Callbacks**:
- `SUBSCRIBED`: Connected, ready for events
- `CHANNEL_ERROR`: Connection error (retry)
- `TIMED_OUT`: Server timeout (reconnect)
- `CLOSED`: Unexpected close (reconnect)

**Cleanup Pattern** (React 18 Strict Mode safe):

```typescript
const channelRef = useRef<RealtimeChannel | null>(null)

useEffect(() => {
  channelRef.current = supabase
    .channel(`photos:${accountId}`)
    .on('postgres_changes', {...}, handleUpdate)
    .subscribe()

  return () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }
  }
}, [accountId])
```

### TanStack Query Integration

**Strategy**: Optimistic updates for instant UI, background refetch for consistency

```typescript
// On UPDATE event
queryClient.setQueryData(
  ['photos', accountId],
  (old: Photo[]) => old.map(p =>
    p.id === payload.new.id ? payload.new : p
  )
)

// Background consistency check (optional)
queryClient.invalidateQueries({
  queryKey: ['photos', accountId],
  refetchType: 'active'
})
```

### Scale Considerations

| Users | Pattern | Performance |
|-------|---------|-------------|
| < 100 | postgres_changes | Acceptable (1 DB read per event per user) |
| 100+ | Broadcast method | Better (1 RLS check per channel join) |

**Recommendation**: Start with postgres_changes for MVP, migrate to Broadcast if scale issues arise.

---

## 4. Filename+Size Deduplication

### Decision: Server-side Check Before Upload

**Endpoint**: `POST /api/photos/check-duplicates`

**Request**:
```typescript
{
  files: Array<{ filename: string, size: number }>
}
```

**Response**:
```typescript
{
  existing: string[],  // Filenames to skip
  toUpload: string[]   // Filenames to upload
}
```

**Rationale**:
- User can re-select entire folder after page refresh
- Server checks existing files by filename + size
- Client skips duplicates, only uploads missing files
- Phase 1 simplification vs content hash (Phase 2)

**Query**:
```sql
SELECT original_filename
FROM photos
WHERE account_id = $1
  AND original_filename = ANY($2)
  AND file_size = ANY($3)
```

---

## 5. Thumbnail Generation

### Decision: Server-side via Trigger.dev with Sharp

**Location**: Trigger.dev job (not Web Worker)

**Rationale**:
- Keeps client memory below 500MB
- Reduces upload payload size
- Sharp is already in stack
- Server has more resources

**Thumbnail Spec**:
- Scaled to fit (not cropped)
- Max dimension: 400px
- Format: WebP (80% quality)
- Output path: `{account_id}/thumbnails/{photo_id}.webp`

---

## Decision Matrix Summary

| Component | Decision | Key Rationale |
|-----------|----------|---------------|
| EXIF Library | exifr (lite) | 2.5ms/file, Worker support |
| Worker Communication | Transferable Objects | 46x speedup |
| Worker Pool Size | 4-8 (CPU cores) | Balance throughput/memory |
| URL Generation | Batch via Promise.all | Single API call |
| Concurrent Uploads | 3-8 (adaptive) | Respects browser limits |
| Retry Strategy | Exponential + jitter | Prevents thundering herd |
| Realtime Pattern | postgres_changes | Simple, MVP-appropriate |
| Query Integration | Optimistic updates | Instant UI feedback |
| Deduplication | Filename + size | Enables folder re-select |
| Thumbnails | Server-side Sharp | Memory efficient |

---

## References

- [exifr Library](https://github.com/MikeKovarik/exifr)
- [Transferable Objects Performance](https://joji.me/en-us/blog/performance-issue-of-using-massive-transferable-objects-in-web-worker/)
- [Supabase Realtime - postgres_changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Supabase Storage Signed URLs](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl)
- [TanStack Query - Query Invalidation](https://tanstack.com/query/v5/docs/react/guides/query-invalidation)
- [Exponential Backoff Best Practices](https://jaytech.substack.com/p/retry-logic-and-exponential-backoff)
