---
name: HF Integration Plan
overview: Migrate from Replicate to Hugging Face for deer detection and re-identification. This involves creating a new HF client, updating the detection pipeline to use a zero-shot detector, and configuring the embedding generation to use MegaDescriptor or MiewID.
todos:
  - id: gemini-client
    content: Create lib/gemini/client.ts with analyzePhoto() and compareDeer() functions
    status: pending
  - id: gemini-types
    content: Create lib/gemini/types.ts with PhotoAnalysis and MatchComparison interfaces
    status: pending
  - id: gemini-prompts
    content: Create lib/gemini/prompts.ts with analysis and comparison prompts
    status: pending
  - id: db-migration
    content: Create migration for analysis columns (species, sex, points, head_bbox, etc.)
    status: pending
  - id: analyze-job
    content: Create trigger/jobs/analyze-photo.ts for bulk photo analysis
    status: pending
    dependencies:
      - gemini-client
      - db-migration
  - id: compare-job
    content: Create trigger/jobs/compare-deer.ts for on-demand matching
    status: pending
    dependencies:
      - gemini-client
      - db-migration
  - id: cleanup-old-jobs
    content: Remove obsolete jobs (detect-animals, generate-embedding, find-matches)
    status: pending
    dependencies:
      - analyze-job
      - compare-job
  - id: triage-dashboard
    content: Create triage dashboard component with filters
    status: pending
    dependencies:
      - db-migration
  - id: buck-grid
    content: Create buck grid component showing head crops
    status: pending
    dependencies:
      - db-migration
  - id: match-review-modal
    content: Create enhanced match review modal with assign/correct/new options
    status: pending
    dependencies:
      - compare-job
  - id: deer-catalog
    content: Create deer catalog management UI
    status: pending
    dependencies:
      - db-migration
  - id: create-deer-modal
    content: Create modal for naming new deer profiles
    status: pending
    dependencies:
      - db-migration
---

# TineSight Deer Analysis Pipeline - Final Plan

## Architecture Overview

**Single AI Model:** `gemini-flash-lite-latest` ($0.10/$0.40 per M tokens)

```
┌─────────────────────────────────────────────────────────────────┐
│                         PIPELINE FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PHASE 1: ANALYSIS (Automatic)                                   │
│  ┌─────────┐     ┌─────────────┐     ┌─────────────┐            │
│  │ Upload  │────▶│   Gemini    │────▶│   Results   │            │
│  │ Photos  │     │   Analysis  │     │   Stored    │            │
│  └─────────┘     └─────────────┘     └─────────────┘            │
│                                                                  │
│  PHASE 2: CURATION (User-Driven)                                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐        │
│  │   Filter    │────▶│   Select    │────▶│   Create    │        │
│  │   by Pts    │     │   Bucks     │     │   Profiles  │        │
│  └─────────────┘     └─────────────┘     └─────────────┘        │
│                                                                  │
│  PHASE 3: MATCHING (On-Demand)                                   │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐        │
│  │   Trigger   │────▶│   Gemini    │────▶│   Review &  │        │
│  │   Match     │     │   Compare   │     │   Assign    │        │
│  └─────────────┘     └─────────────┘     └─────────────┘        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## User Workflow Detail

### Phase 1: Bulk Import & Analysis

**User Action:** Upload 1,000 photos from trail cam SD card

**System Process:**

1. Photos uploaded to Supabase Storage
2. Trigger.dev job processes each photo with Gemini
3. Gemini returns: deer presence, head bbox, species, sex, points, features
4. Results stored in database

**Time:** ~5-10 minutes for 1,000 photos (parallel processing)

**Cost:** ~$0.19

---

### Phase 2: Triage Dashboard

After analysis, user sees summary:

```
┌─────────────────────────────────────────────────────────────────┐
│  Batch: "December Week 2"          1,247 photos analyzed        │
├─────────────────────────────────────────────────────────────────┤
│  📊 Results:                                                     │
│     🦌 83 photos with deer                                       │
│        • 24 bucks                                               │
│        • 51 does                                                │
│        • 8 unknown                                              │
│     📷 1,164 empty                                              │
│                                                                  │
│  🎯 Filter Bucks by Points:                                     │
│     [All] [10+] [8-9] [6-7] [<6]                                │
│                                                                  │
│  Actions:                                                        │
│     [Archive Empty Photos]  [View Bucks]  [View Does]           │
└─────────────────────────────────────────────────────────────────┘
```

---

### Phase 3: Buck Review & Catalog Building

User filters to high-point bucks, sees head crop grid:

```
┌─────────────────────────────────────────────────────────────────┐
│  Bucks: 10+ Points (4 found)                                     │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ [head crop] │  │ [head crop] │  │ [head crop] │   ...        │
│  │ 12 pts      │  │ 10 pts      │  │ 11 pts      │              │
│  │ Mature      │  │ Mature      │  │ Young       │              │
│  │ Dec 8       │  │ Dec 9       │  │ Dec 10      │              │
│  │             │  │             │  │             │              │
│  │ [Name Deer] │  │ [Name Deer] │  │ [Name Deer] │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

**"Name Deer" creates a catalog entry:**

- Opens modal to enter name (e.g., "Big 12")
- Optionally add notes ("drop tine on left")
- Sets this detection as the reference image
- Adds deer to catalog

---

### Phase 4: On-Demand Matching

After building catalog, user triggers matching:

```
┌─────────────────────────────────────────────────────────────────┐
│  Deer Catalog (5 named bucks)                                    │
├─────────────────────────────────────────────────────────────────┤
│  [Big 12] [Wide 10] [Split Brow] [Tank] [Ghost]                 │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  19 unassigned buck detections                                   │
│                                                                  │
│  [🔍 Find Matches Against Catalog]                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**System Process:**

1. Fetches all unassigned buck detections
2. Fetches catalog deer with reference photos
3. Sends to Gemini for comparison
4. Creates match candidates with AI reasoning
5. Queues for user review

**Cost:** ~$0.065 for 15 comparisons

---

### Phase 5: Match Review (Enhanced)

User reviews each match candidate with full control:

```
┌─────────────────────────────────────────────────────────────────┐
│  Match Review (1 of 6)                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────┐   ┌─────────────────────┐              │
│  │   New Detection     │   │  AI Suggests: Big 12│              │
│  │   [head crop]       │   │  [reference photo]  │              │
│  │   Dec 9, Cam 2      │   │  87% confidence     │              │
│  │   12 pts, Mature    │   │                     │              │
│  └─────────────────────┘   └─────────────────────┘              │
│                                                                  │
│  "Likely same deer. Similar wide spread, drop tine on           │
│   left G2, heavy mass on main beams."                           │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  ASSIGN THIS DETECTION:                                          │
│                                                                  │
│  ○ Confirm: This is Big 12 ★                                    │
│                                                                  │
│  ○ Correct: This is actually ─────────────────────┐             │
│                              │ Wide 10            │             │
│                              │ Split Brow         │             │
│                              │ Tank               │             │
│                              │ Ghost              │             │
│                              └────────────────────┘             │
│                                                                  │
│  ○ New: Create profile named [________________]                  │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Quick Assign (click thumbnail):                                 │
│  [Big 12★] [Wide 10] [Split Brow] [Tank] [Ghost] [+ New]        │
├─────────────────────────────────────────────────────────────────┤
│  [Skip for Later]                        [Confirm & Next →]     │
└─────────────────────────────────────────────────────────────────┘
```

**Actions:**

| Option | Result |

|--------|--------|

| **Confirm (Big 12)** | Links detection to Big 12, adds to sighting history |

| **Correct (dropdown)** | Links detection to selected deer instead |

| **New profile** | Creates new deer, links detection as reference |

| **Skip** | Leaves unassigned for later review |

---

## Gemini API Responses

### Photo Analysis Response

```typescript
interface PhotoAnalysis {
  deer_present: boolean;
  detections: {
    box_2d: [number, number, number, number]; // Head bbox
    species: "whitetail" | "mule_deer" | "elk" | "unknown";
    sex: "buck" | "doe" | "fawn" | "unknown";
    antler_points: number | null;
    age_class: "young" | "mature" | "old" | "unknown";
    distinguishing_features: string | null;
    confidence: number;
  }[];
  image_quality_score: number;
  analysis_notes: string;
}
```

### Re-ID Comparison Response

```typescript
interface MatchComparison {
  best_match: {
    deer_id: string;
    deer_name: string;
    confidence: number;
    reasoning: string;
  } | null;
  other_possibilities: {
    deer_id: string;
    deer_name: string;
    confidence: number;
  }[];
  is_likely_new_deer: boolean;
}
```

---

## Database Schema Updates

```sql
-- Images table
ALTER TABLE images ADD COLUMN has_deer BOOLEAN;
ALTER TABLE images ADD COLUMN deer_count INTEGER DEFAULT 0;
ALTER TABLE images ADD COLUMN analysis_notes TEXT;
ALTER TABLE images ADD COLUMN analyzed_at TIMESTAMPTZ;

-- Detections table  
ALTER TABLE detections ADD COLUMN species TEXT;
ALTER TABLE detections ADD COLUMN sex TEXT;
ALTER TABLE detections ADD COLUMN antler_points INTEGER;
ALTER TABLE detections ADD COLUMN age_class TEXT;
ALTER TABLE detections ADD COLUMN distinguishing_features TEXT;
ALTER TABLE detections ADD COLUMN gemini_confidence INTEGER;
ALTER TABLE detections ADD COLUMN head_bbox JSONB; -- {x, y, width, height}
ALTER TABLE detections ADD COLUMN is_reference BOOLEAN DEFAULT FALSE;

-- Deer catalog
ALTER TABLE deer ADD COLUMN reference_detection_id UUID REFERENCES detections(id);

-- Match candidates (for review queue)
ALTER TABLE match_candidates ADD COLUMN gemini_reasoning TEXT;
ALTER TABLE match_candidates ADD COLUMN gemini_confidence INTEGER;
```

---

## Implementation Phases

### Phase 1: Gemini Client

- `lib/gemini/client.ts` - API integration
- `lib/gemini/types.ts` - TypeScript interfaces
- `lib/gemini/prompts.ts` - Prompt templates

### Phase 2: Database Migration

- New columns for analysis results
- Head bbox storage
- Reference detection linking

### Phase 3: Analysis Job

- `trigger/jobs/analyze-photo.ts`
- Replaces detect-animals.ts
- Stores full Gemini response

### Phase 4: Comparison Job

- `trigger/jobs/compare-deer.ts`
- On-demand matching
- Creates review queue entries

### Phase 5: UI Components

- Triage dashboard with filters
- Buck review grid with head crops
- Deer catalog management
- Enhanced match review modal

---

## Files to Create/Modify

| File | Action |

|------|--------|

| `lib/gemini/client.ts` | Create |

| `lib/gemini/types.ts` | Create |

| `lib/gemini/prompts.ts` | Create |

| `supabase/migrations/xxx_gemini_analysis.sql` | Create |

| `trigger/jobs/analyze-photo.ts` | Create |

| `trigger/jobs/compare-deer.ts` | Create |

| `trigger/jobs/detect-animals.ts` | Remove |

| `trigger/jobs/generate-embedding.ts` | Remove |

| `trigger/jobs/find-matches.ts` | Remove |

| `app/(dashboard)/photos/page.tsx` | Modify - Add filters |

| `components/photos/triage-dashboard.tsx` | Create |

| `components/photos/buck-grid.tsx` | Create |

| `components/deer/match-review-modal.tsx` | Create |

| `components/deer/deer-catalog.tsx` | Create |

| `components/deer/create-deer-modal.tsx` | Create |

---

## Cost Summary

| Task | Cost |

|------|------|

| 1,000 photo analysis | ~$0.19 |

| 15 buck comparisons | ~$0.065 |

| **Total per batch** | **~$0.25** |

| Annual (50 batches) | ~$12.50 |