# Research: SAM3 Vast Pipeline

**Feature Branch**: `009-sam3-vast-pipeline`
**Date**: 2025-12-12

## Executive Summary

This research consolidates findings on implementing a SAM3-powered deer detection pipeline to replace/augment the existing Gemini-based detection system. The key architectural decision is to deploy a self-managed FastAPI GPU worker on Vast.ai, orchestrated by existing Trigger.dev jobs.

---

## Research Areas

### 1. SAM3 Model Integration

**Decision**: Use `facebook/sam3` from Hugging Face with text prompts "deer" and "antlers"

**Rationale**:
- SAM3 (Segment Anything Model 3) provides state-of-the-art segmentation with text-guided prompts
- Returns instance masks/boxes/scores per prompt
- 0.9B parameters, requires ~24GB VRAM for inference
- Gated model requiring HF_TOKEN for access

**Alternatives Considered**:
| Alternative | Rejected Because |
|-------------|------------------|
| YOLO-based detectors | Less accurate for antler segmentation, requires custom training |
| MegaDetector | Already tested, limited to deer detection (no antler boxes) |
| Continue with Gemini | Current struggles with multi-deer scenes per user feedback |

**Implementation Notes**:
- Model weights cached via `HF_HOME` env var to persistent storage
- Cold start includes model download (~multi-GB) + warmup
- Text prompts: "deer" for body detection, "antlers" for antler regions

---

### 2. GPU Worker Architecture

**Decision**: FastAPI worker on Vast.ai with `/health` and `/v1/analyze-image` endpoints

**Rationale**:
- Vast.ai provides cost-effective on-demand GPU instances (RTX 3090/4090 ~$0.30-0.50/hr)
- FastAPI provides async handling for batch requests
- Self-contained worker keeps ML complexity out of serverless functions
- Vercel remains stateless, only calls external HTTP endpoint

**Alternatives Considered**:
| Alternative | Rejected Because |
|-------------|------------------|
| Replicate API | No SAM3 model available, less control over inference |
| AWS Lambda + EFS | Cold starts too slow for ML models, complex setup |
| Modal.com | Higher cost, less GPU availability |
| RunPod | Similar to Vast.ai but less mature API |

**Worker API Contract**:
```
GET  /health          → { status: "ready" | "warming" | "cold", model_loaded: bool }
POST /v1/analyze-image → { deer_present, detections[], model }
```

---

### 3. Health Monitoring Pattern

**Decision**: WebSocket-based live status listener (not static polling)

**Rationale**:
- User clarification explicitly requested "no static waiting, listener pattern"
- WebSocket allows real-time status updates during cold start
- Trigger.dev jobs can subscribe and wait for "ready" status
- Reduces wasted time vs fixed polling intervals

**Implementation Notes**:
- Worker exposes `/ws/status` WebSocket endpoint
- Status states: `cold` → `warming` → `ready` | `error`
- Trigger.dev job opens connection, waits for `ready` event, then dispatches work
- Fallback: HTTP polling at 5-second intervals if WebSocket unavailable

---

### 4. Database Schema Changes

**Decision**: Add `analysis_source` column + `antler_bbox` JSONB + SAM3-specific score fields

**Rationale**:
- Feature flag requires knowing which pipeline produced each detection
- Antler bounding boxes are separate from deer bounding boxes
- SAM3 produces separate confidence scores for deer vs antlers
- Indexes needed for filtering by source

**New Columns on `detections` table**:
| Column | Type | Purpose |
|--------|------|---------|
| `analysis_source` | TEXT | "gemini" or "sam3" |
| `antler_bbox` | JSONB | `{x, y, width, height}` normalized 0-10000 |
| `sam3_deer_score` | DECIMAL(4,3) | SAM3 deer detection confidence |
| `sam3_antler_score` | DECIMAL(4,3) | SAM3 antler detection confidence |

**Migration Strategy**: Non-breaking addition, existing rows get `analysis_source = NULL` (or backfill to 'gemini')

---

### 5. Trigger.dev Job Integration

**Decision**: Create new `analyze-photo-sam3` job, update `batch-process` to fan-out based on feature flag

**Rationale**:
- Mirrors existing `analyze-photo` job structure for consistency
- Feature flag (`SAM3_PIPELINE_ENABLED`) determines which job to dispatch
- Keeps Gemini job as fallback during transition
- Same retry/timeout patterns as existing jobs

**Key Differences from Gemini Job**:
| Aspect | Gemini Job | SAM3 Job |
|--------|-----------|----------|
| API Call | Direct Gemini SDK | HTTP to Vast.ai worker |
| Health Check | None | WebSocket listener pre-dispatch |
| Timeout | Implicit (Trigger.dev) | 60 seconds explicit |
| Confidence Filter | 70% | 30% (store all, filter display) |
| Antler Data | `head_bbox` JSONB | `antler_bbox` JSONB |

---

### 6. Environment Variables

**Decision**: Add SAM3-specific env vars alongside existing Gemini config

**New Variables**:
| Variable | Location | Purpose |
|----------|----------|---------|
| `SAM3_PIPELINE_ENABLED` | Vercel, Trigger.dev | Feature flag (true/false) |
| `SAM3_WORKER_URL` | Vercel, Trigger.dev | Base URL of Vast.ai worker |
| `HF_TOKEN` | Vast.ai worker only | Hugging Face gated model access |
| `HF_HOME` | Vast.ai worker only | Model cache path (/data/hf) |

---

### 7. Existing Code Patterns to Follow

**From Exploration**:

1. **Job Structure** (`trigger/jobs/analyze-photo.ts`):
   - Export task with `id`, `queue.concurrencyLimit`, `retry` config
   - Fetch image record → create signed URL → call API → insert detections → update image

2. **Detection Creation** (`lib/services/detections.ts`):
   - Use `createGeminiDetections()` pattern for `createSam3Detections()`
   - Same bbox coordinate system (0-10000 normalized)

3. **Error Handling**:
   - Graceful: status update failures don't throw
   - Hard: API failures after retries get re-thrown
   - Always update `error_message` on failure

4. **Database Access**:
   - Use `createAdminClient()` in jobs (bypasses RLS)
   - Use standard client in API routes (respects RLS)

---

## Constitution Compliance Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Serverless-First | **VIOLATION** | Self-managed Vast.ai worker |
| II. Human-in-the-Loop AI | COMPLIANT | Detections are suggestions, user confirms |
| III. Multi-Tenant Isolation | COMPLIANT | RLS maintained, user_id checks |
| IV. Role-Based Access | COMPLIANT | No changes to access patterns |
| V. Integration Testing | COMPLIANT | Will add integration tests |
| VI. Phased Delivery | COMPLIANT | User stories are independent |
| VII. Design System | N/A | No UI changes in this feature |

**Violation Justification (Principle I)**:
- SAM3 requires GPU with 24GB VRAM - not available via API services
- Vast.ai provides managed-like experience (on-demand, no server setup)
- Vercel + Trigger.dev remain serverless, only HTTP calls to worker
- Worker is stateless, can be destroyed/recreated without data loss
- Cost-effective vs. running permanent GPU infrastructure

---

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Migration strategy? | Feature flag at deployment time |
| Batch limits? | No limit for dev, configurable later |
| Confidence threshold? | Store all, display >= 0.3 |
| Timeout duration? | 60 seconds with user message |
| Cold start handling? | WebSocket health listener, no static wait |

---

## References

- [SAM3 on Hugging Face](https://huggingface.co/facebook/sam3)
- [Vast.ai GPU Marketplace](https://vast.ai/)
- [Trigger.dev v4 Documentation](https://trigger.dev/docs)
- [TineSight Constitution](/.specify/memory/constitution.md)
- [Original Plan File](/.cursor/plans/sam3_vast_pipeline_cef40df8.plan.md)
