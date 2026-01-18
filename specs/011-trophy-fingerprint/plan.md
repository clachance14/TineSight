# Implementation Plan: Trophy Fingerprint

**Branch**: `011-trophy-fingerprint` | **Date**: 2025-12-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-trophy-fingerprint/spec.md`

## Summary

Add AI-powered B&C scoring and antler fingerprinting for trophy bucks. When a detection is classified as "trophy", auto-trigger detailed scoring. Generate an "Antler Print" fingerprint based on measurements and ratios. Use prints to enhance deer matching, cluster unassigned trophy detections, scan for matches after deer creation, and provide a trophy dashboard with batch operations.

## Technical Context

**Language/Version**: TypeScript 5.x + Next.js 14 (App Router)
**Primary Dependencies**: React 18, TanStack Query, Trigger.dev v3, Gemini API (@google/genai), Sharp
**Storage**: PostgreSQL via Supabase with pgvector extension, Supabase Storage for images
**Testing**: Playwright (E2E), Vitest (unit)
**Target Platform**: Vercel (serverless)
**Project Type**: Web application (Next.js fullstack)
**Performance Goals**: Fingerprint generation within 30 seconds; dashboard loads in <3s for 1000+ detections
**Constraints**: Serverless-first (no self-managed infra); Gemini API rate limits
**Scale/Scope**: ~1000 trophy detections per user account

## Constitution Check

*GATE: All checks passed.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Serverless-First | COMPLIANT | Trigger.dev for async jobs, Gemini API for inference |
| II. Human-in-the-Loop AI | COMPLIANT | Fingerprints are suggestions, clustering requires user confirmation |
| III. Multi-Tenant Data Isolation | REQUIRES RLS | New tables need RLS policies |
| IV. Role-Based Access Control | COMPLIANT | Dashboard follows existing patterns |
| V. Integration Testing | COMPLIANT | Will add E2E tests for trophy flow |
| VI. Phased Delivery | COMPLIANT | P1/P2/P3 priority stories |
| VII. Design System Compliance | COMPLIANT | Uses existing TineSight theme |

## Project Structure

### Documentation (this feature)

```text
specs/011-trophy-fingerprint/
├── plan.md              # This file
├── research.md          # Research decisions
├── data-model.md        # Entity definitions
├── quickstart.md        # Quick start guide
├── contracts/           # API contracts
│   └── trophy-api.yaml
└── tasks.md             # Implementation tasks (via /speckit.tasks)
```

### Source Code (additions)

```text
app/
├── (dashboard)/
│   └── trophy/
│       └── page.tsx              # Trophy dashboard page
├── api/
│   ├── deer/
│   │   └── clusters/
│   │       ├── route.ts          # GET/POST clusters
│   │       └── [id]/route.ts     # PATCH/DELETE cluster
│   └── trophy/
│       ├── dashboard/route.ts    # Dashboard data
│       └── batch/route.ts        # Batch operations

components/
├── deer/
│   └── antler-print-card.tsx     # Fingerprint display
├── trophy/
│   ├── trophy-dashboard.tsx
│   ├── summary-stats.tsx
│   ├── pending-matches-section.tsx
│   ├── clusters-section.tsx
│   ├── cluster-card.tsx
│   ├── measurement-comparison.tsx
│   └── batch-match-actions.tsx

lib/
├── gemini/
│   ├── prompts.ts                # MODIFY: add fingerprint prompt
│   └── schemas.ts                # MODIFY: add fingerprint schema
├── fingerprint/
│   └── compare.ts                # Similarity algorithm
├── clustering/
│   └── union-find.ts             # Union-Find data structure
├── services/
│   ├── fingerprint.ts            # Fingerprint CRUD
│   ├── clusters.ts               # Cluster management
│   └── trophy.ts                 # Dashboard service
└── stores/
    └── batch-selection.ts        # Zustand store

trigger/
└── jobs/
    ├── generate-fingerprint.ts   # B&C fingerprint extraction
    ├── cluster-trophy-detections.ts
    ├── post-creation-scan.ts
    └── compare-deer.ts           # MODIFY: include fingerprint

supabase/
└── migrations/
    └── 039_trophy_fingerprint.sql

types/
└── fingerprint.ts                # TypeScript interfaces
```

**Structure Decision**: Next.js fullstack with existing TineSight patterns. New files organized under `components/trophy/`, `lib/fingerprint/`, `lib/clustering/`, and `trigger/jobs/`.

## Complexity Tracking

*No constitution violations requiring justification.*

## Research Decisions

See [research.md](./research.md) for full details.

| Question | Decision |
|----------|----------|
| Fingerprint schema | Comprehensive JSONB: calibration, measurements, scores, ratios, features, confidence |
| Clustering algorithm | Union-Find with 85% threshold, pgvector pre-filter |
| Similarity weights | 35% visual, 30% ratios, 20% features, 15% measurements |
| B&C calibration | Ear=6.75", ear-spread=15", eye=4", eye-to-nose=8" |

## Implementation Phases

### Phase 1: P1 Stories (Core MVP)

**Story 1: Trophy Buck Gets Scored and Fingerprinted**
1. Add `antler_fingerprint JSONB` column to detections table
2. Create `ANTLER_FINGERPRINT_PROMPT` and `ANTLER_FINGERPRINT_SCHEMA`
3. Create `extractAntlerFingerprint()` in Gemini client
4. Create `trigger/jobs/generate-fingerprint.ts`
5. Modify `analyze-photo.ts` to queue fingerprint job for trophy bucks
6. Create `lib/services/fingerprint.ts`

**Story 2: Enhanced Matching with Fingerprints**
1. Add `antler_print_similarity` column to match_candidates
2. Create `lib/fingerprint/compare.ts` with similarity algorithm
3. Modify `compare-deer.ts` to include fingerprint data
4. Update `match-review-modal.tsx` to show measurements
5. Create `measurement-comparison.tsx` component

### Phase 2: P2 Stories

**Story 3: Post-Creation Scan** - Scan unassigned detections after deer creation
**Story 4: Auto-Clustering** - Union-Find clustering with trophy_clusters table
**Story 5: Trophy Dashboard** - Dashboard page with sections
**Story 6: Deer Profile Antler Print** - AntlerPrintCard component

### Phase 3: P3 Stories

**Story 7: Batch Match Operations** - Accept/reject multiple matches
**Story 8: Named Buck Gets Fingerprinted** - Generate on deer creation
**Story 9: Fingerprint Regeneration** - Regenerate on reference photo change

## Database Migration

```sql
-- 039_trophy_fingerprint.sql

-- Add fingerprint column to detections
ALTER TABLE detections ADD COLUMN antler_fingerprint JSONB;
CREATE INDEX idx_detections_fingerprint ON detections USING gin (antler_fingerprint)
  WHERE antler_fingerprint IS NOT NULL;

-- Add antler print similarity to match candidates
ALTER TABLE match_candidates ADD COLUMN antler_print_similarity DECIMAL(3,2);

-- Trophy clusters table
CREATE TABLE trophy_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  representative_detection_id UUID REFERENCES detections(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'named', 'merged', 'split', 'dismissed')),
  created_deer_id UUID REFERENCES deer(id) ON DELETE SET NULL,
  member_count INTEGER NOT NULL DEFAULT 0,
  avg_similarity DECIMAL(4,3),
  min_similarity DECIMAL(4,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cluster membership
CREATE TABLE trophy_cluster_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL REFERENCES trophy_clusters(id) ON DELETE CASCADE,
  detection_id UUID NOT NULL REFERENCES detections(id) ON DELETE CASCADE,
  similarity_to_representative DECIMAL(4,3),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(detection_id)
);

-- RLS policies
ALTER TABLE trophy_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE trophy_cluster_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own clusters"
  ON trophy_clusters FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage cluster members"
  ON trophy_cluster_members FOR ALL
  USING (EXISTS (
    SELECT 1 FROM trophy_clusters
    WHERE id = cluster_id AND user_id = auth.uid()
  ));
```

## Critical Files

### New Files
| File | Purpose |
|------|---------|
| `trigger/jobs/generate-fingerprint.ts` | Extract B&C fingerprint |
| `trigger/jobs/cluster-trophy-detections.ts` | Clustering job |
| `trigger/jobs/post-creation-scan.ts` | Post-creation matching |
| `lib/fingerprint/compare.ts` | Similarity algorithm |
| `lib/clustering/union-find.ts` | Union-Find structure |
| `lib/services/fingerprint.ts` | Fingerprint CRUD |
| `lib/services/clusters.ts` | Cluster management |
| `lib/services/trophy.ts` | Dashboard service |
| `app/(dashboard)/trophy/page.tsx` | Dashboard page |
| `components/trophy/*.tsx` | Dashboard components |
| `components/deer/antler-print-card.tsx` | Fingerprint display |

### Files to Modify
| File | Changes |
|------|---------|
| `lib/gemini/prompts.ts` | Add fingerprint prompt |
| `lib/gemini/schemas.ts` | Add fingerprint schema |
| `lib/gemini/client.ts` | Add `extractAntlerFingerprint()` |
| `trigger/jobs/analyze-photo.ts` | Queue fingerprint for trophy |
| `trigger/jobs/compare-deer.ts` | Include fingerprint in comparison |
| `lib/services/deer.ts` | Trigger post-creation scan |
| `components/deer/match-review-modal.tsx` | Show measurements |

---

## Execution Strategy

**MANDATORY: Use multi-agent parallel execution**

1. Analyze dependencies - identify independent vs dependent tasks
2. Group into parallel batches - cluster independent tasks
3. Execute with up to 5 agents in parallel via Task tool
4. Serialize only when dependencies require it

See CLAUDE.md "Execution Preferences" for parallelization rules.
