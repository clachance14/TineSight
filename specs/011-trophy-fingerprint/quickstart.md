# Quickstart: Trophy Fingerprint

**Feature**: 011-trophy-fingerprint
**Date**: 2025-12-26

## Overview

This feature adds B&C-style scoring and antler fingerprinting for trophy bucks. When a buck is classified as "trophy", the system generates detailed measurements that improve re-identification accuracy.

## Prerequisites

- TineSight development environment set up
- Supabase local or linked project
- Trigger.dev dev worker running
- Gemini API key configured

## Quick Test

### 1. Apply Migration

```bash
npx supabase db push
```

This adds:
- `antler_fingerprint` JSONB column to detections
- `antler_print_similarity` column to match_candidates
- `trophy_clusters` and `trophy_cluster_members` tables

### 2. Upload Trophy Buck Photo

Upload a trail camera photo containing a trophy-class buck through the UI.

### 3. Verify Fingerprint Generation

After analysis completes:

```sql
SELECT
  id,
  size_class,
  antler_fingerprint->'scores'->>'score_class' as score_class,
  antler_fingerprint->'scores'->>'gross_score' as gross_score,
  antler_fingerprint->'confidence'->>'overall' as confidence
FROM detections
WHERE size_class = 'trophy'
AND antler_fingerprint IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;
```

### 4. View Trophy Dashboard

Navigate to `/trophy` to see:
- Summary stats (total, assigned, pending, clusters, unclustered)
- Pending match groups by deer
- Auto-clustered detections
- Unclustered trophy detections

### 5. Test Clustering

Upload multiple photos of the same trophy buck:

```sql
-- Check clusters were created
SELECT
  c.id,
  c.member_count,
  c.avg_similarity,
  c.status
FROM trophy_clusters c
WHERE c.user_id = 'your-user-id'
ORDER BY c.created_at DESC;
```

## Key APIs

### Get Trophy Dashboard Data
```typescript
GET /api/trophy/dashboard

Response: {
  stats: {
    totalTrophyDetections: number
    assignedCount: number
    pendingMatchCount: number
    clusterCount: number
    unclusteredCount: number
  }
  pendingGroups: PendingMatchGroup[]
  clusters: TrophyCluster[]
  unclustered: TrophyDetection[]
}
```

### Batch Confirm Matches
```typescript
POST /api/trophy/batch-confirm
Body: { match_ids: string[] }

Response: { confirmed_count: number }
```

### Name a Cluster
```typescript
POST /api/deer/clusters/:id/name
Body: { name: string }

Response: { deer: Deer, linked_count: number }
```

## Environment Variables

No new environment variables required. Uses existing:
- `GEMINI_API_KEY` - For fingerprint extraction
- Supabase connection - For database storage

## Trigger Jobs

| Job | Queue | Trigger |
|-----|-------|---------|
| `generate-fingerprint` | fingerprint | After trophy classification |
| `cluster-trophy-detections` | clustering | After batch upload, manual trigger |
| `post-creation-scan` | matching | After deer creation |

## Common Patterns

### Check if Detection Has Fingerprint
```typescript
const hasFingerprint = detection.antler_fingerprint !== null
const scoreClass = detection.antler_fingerprint?.scores?.score_class
```

### Compare Fingerprints
```typescript
import { compareFingerprints } from '@/lib/fingerprint/compare'

const result = compareFingerprints(fp1, fp2)
// result.overall_similarity: 0-100
// result.flags.possible_broken_tine: boolean
```

### Get Pending Clusters
```typescript
import { getPendingClusters } from '@/lib/services/clusters'

const clusters = await getPendingClusters(userId)
```

## Troubleshooting

### Fingerprint Not Generated
1. Check `size_class = 'trophy'` on detection
2. Check Trigger.dev logs for `generate-fingerprint` job
3. Verify Gemini API key is valid

### Clustering Not Working
1. Ensure detections have fingerprints
2. Check `trophy_clusters` table for entries
3. Verify RLS policies allow access

### Low Similarity Scores
1. Check `confidence.visibility_score` - may be angle issue
2. Review `calibration.angle_impact` - affects measurement reliability
3. Consider photo quality in `confidence.photo_quality`

## Next Steps

After basic functionality is verified:
1. Test enhanced match review with measurements
2. Test batch operations on pending matches
3. Test deer profile antler print display
4. Run E2E tests for complete flow
