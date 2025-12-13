# Quickstart: SAM3 Vast Pipeline

**Feature Branch**: `009-sam3-vast-pipeline`
**Date**: 2025-12-12

## Prerequisites

Before implementing this feature, ensure you have:

- [ ] Hugging Face account with access to gated model `facebook/sam3`
- [ ] Vast.ai account with payment method configured
- [ ] GPU instance selected (minimum 24GB VRAM: RTX 3090, RTX 4090, A6000)
- [ ] Local development environment with Trigger.dev CLI installed

---

## Environment Setup

### 1. Hugging Face Token

1. Go to https://huggingface.co/facebook/sam3
2. Accept the model license agreement
3. Generate a token at https://huggingface.co/settings/tokens
4. Note down the token for Vast.ai worker configuration

### 2. Vast.ai Instance

1. Go to https://vast.ai/console/create
2. Filter for instances with:
   - GPU Memory: >= 24GB
   - CUDA: >= 12.0
   - Disk Space: >= 50GB (for model cache)
3. Select an instance and note the public IP/port
4. SSH into instance and install dependencies:

```bash
# On Vast.ai instance
pip install fastapi uvicorn transformers torch
pip install huggingface_hub websockets pillow
```

### 3. TineSight Environment Variables

Add to `.env.local`:

```bash
# SAM3 Pipeline Configuration
SAM3_PIPELINE_ENABLED=true
SAM3_WORKER_URL=http://<vast-instance-ip>:<port>
```

Add to Trigger.dev environment (cloud.trigger.dev dashboard):
- `SAM3_PIPELINE_ENABLED=true`
- `SAM3_WORKER_URL=http://<vast-instance-ip>:<port>`

Add to Vercel environment variables:
- `SAM3_PIPELINE_ENABLED=true`
- `SAM3_WORKER_URL=http://<vast-instance-ip>:<port>`

---

## Development Workflow

### Step 1: Run Database Migration

```bash
# Generate types after migration
npx supabase db push
npx supabase gen types typescript --linked > types/database.ts
```

### Step 2: Start GPU Worker

```bash
# On Vast.ai instance
cd /workspace/sam3-worker
HF_TOKEN=<your-token> HF_HOME=/data/hf python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### Step 3: Verify Worker Health

```bash
# From local machine
curl http://<vast-instance-ip>:<port>/health
# Expected: {"status":"ready","model_loaded":true,...}
```

### Step 4: Start Trigger.dev Worker

```bash
# Local development
npx trigger.dev@latest dev
```

### Step 5: Test Upload Flow

1. Upload a batch of test photos via the TineSight UI
2. Monitor Trigger.dev dashboard for job execution
3. Check database for `analysis_source = 'sam3'` detections

---

## Feature Flag Toggle

To switch between Gemini and SAM3 pipelines:

```bash
# Use Gemini (existing)
SAM3_PIPELINE_ENABLED=false

# Use SAM3 (new)
SAM3_PIPELINE_ENABLED=true
```

Both pipelines can coexist - the feature flag determines which is used for NEW photo processing. Existing detections retain their original `analysis_source`.

---

## Testing Checklist

- [ ] Worker health endpoint returns `ready` status
- [ ] WebSocket status stream connects and receives events
- [ ] Single photo upload triggers SAM3 analysis job
- [ ] Batch upload fans out to SAM3 jobs correctly
- [ ] Detections are created with `analysis_source = 'sam3'`
- [ ] Antler bounding boxes are stored in `antler_bbox` JSONB
- [ ] UI displays SAM3 detections with bounding box overlays
- [ ] Confidence filtering (>= 0.3) works in UI
- [ ] Retry flow works for failed photos
- [ ] Cold start handling waits for worker readiness

---

## Troubleshooting

### Worker Not Ready

```bash
# Check worker logs
docker logs <container-id>

# Common issues:
# - HF_TOKEN not set or invalid
# - Insufficient VRAM (need 24GB)
# - Model download failed (network)
```

### Detections Not Appearing

```sql
-- Check if detections were created
SELECT * FROM detections
WHERE analysis_source = 'sam3'
ORDER BY created_at DESC
LIMIT 10;

-- Check image processing status
SELECT id, detection_status, error_message
FROM images
WHERE batch_id = '<batch-id>';
```

### Trigger.dev Job Failures

```bash
# View job logs in Trigger.dev dashboard
# Or check local dev output

# Common issues:
# - SAM3_WORKER_URL not set
# - Worker unreachable (firewall)
# - Timeout (worker cold start)
```

---

## File References

| File | Purpose |
|------|---------|
| `trigger/jobs/analyze-photo-sam3.ts` | SAM3 analysis Trigger.dev job |
| `trigger/jobs/batch-process.ts` | Updated fan-out logic |
| `lib/services/detections.ts` | `createSam3Detections()` function |
| `lib/sam3/client.ts` | Worker HTTP client |
| `lib/sam3/health.ts` | WebSocket health listener |
| `supabase/migrations/011_sam3_detection_fields.sql` | Schema migration |
| `types/database.ts` | Updated TypeScript types |

---

## Next Steps

After initial implementation:

1. Run integration tests with real photos
2. Measure detection accuracy vs Gemini
3. Tune confidence thresholds based on results
4. Consider adding classification stage (sex/species/points) using Gemini on SAM3 crops
5. Implement MegaDescriptor embeddings for buck re-ID
