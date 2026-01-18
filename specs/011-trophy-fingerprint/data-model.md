# Data Model: Trophy Fingerprint

**Feature**: 011-trophy-fingerprint
**Date**: 2025-12-26

## Entity Relationship Diagram

```
detections (existing)
├── antler_fingerprint: JSONB (NEW)
└── deer_id → deer

match_candidates (existing)
├── antler_print_similarity: DECIMAL(3,2) (NEW)
├── detection_id → detections
└── candidate_deer_id → deer

trophy_clusters (NEW)
├── user_id → profiles
├── representative_detection_id → detections
├── created_deer_id → deer
└── trophy_cluster_members → detections (many-to-many)
```

---

## Modified Entities

### detections (MODIFY)

Add `antler_fingerprint` JSONB column for trophy-tier bucks.

```typescript
interface Detection {
  // ... existing fields ...

  // NEW: Antler fingerprint for trophy bucks
  antler_fingerprint: AntlerFingerprint | null
}
```

### match_candidates (MODIFY)

Add `antler_print_similarity` for enhanced matching.

```typescript
interface MatchCandidate {
  // ... existing fields ...
  gemini_confidence: number      // 0-100 visual confidence

  // NEW: Fingerprint similarity score
  antler_print_similarity: number | null  // 0.00-1.00
}
```

---

## New Entities

### AntlerFingerprint (JSONB)

Stored on `detections.antler_fingerprint` for trophy-tier bucks.

```typescript
interface AntlerFingerprint {
  version: '1.0'
  generated_at: string  // ISO 8601
  model_used: string

  calibration: CalibrationData
  measurements: RawMeasurements
  scores: CalculatedScores
  ratios: DerivedRatios
  features: DistinctiveFeatures
  confidence: FingerprintConfidence
  reasoning_trace: string
}

interface CalibrationData {
  reference_used: 'ear_length' | 'ear_spread' | 'eye_circumference' | 'eye_to_nose' | 'multiple'
  ear_length_inches: number
  ear_spread_inches: number | null
  angle_impact: number  // 0-100
  primary_view: 'left_profile' | 'right_profile' | 'frontal' | 'quartering' | 'rear'
  estimated_distance_feet: number | null
}

interface RawMeasurements {
  inside_spread: number | null
  main_beam_left: number | null
  main_beam_right: number | null
  tines: {
    left: { g1: number | null, g2: number | null, g3: number | null, g4: number | null, g5: number | null, g6: number | null, g7: number | null }
    right: { g1: number | null, g2: number | null, g3: number | null, g4: number | null, g5: number | null, g6: number | null, g7: number | null }
  }
  mass: {
    left: { h1: number | null, h2: number | null, h3: number | null, h4: number | null }
    right: { h1: number | null, h2: number | null, h3: number | null, h4: number | null }
  }
  total_points: number
  points_per_side: [number, number]
}

interface CalculatedScores {
  gross_score: number
  deductions: number
  net_score: number
  score_class: '120s' | '140s' | '160s' | '180s' | '200s' | 'world_class' | 'unknown'
  typical_status: 'typical' | 'non_typical'
  abnormal_points_total: number | null
}

interface DerivedRatios {
  g2_to_g3: number | null
  g1_to_g2: number | null
  beam_symmetry: number | null
  tine_symmetry: number | null
  spread_to_beam: number | null
  mass_to_beam: number | null
  brow_to_ear: number | null
  tallest_tine_to_ear: number | null
}

interface DistinctiveFeatures {
  has_drop_tine: boolean
  drop_tine_location: 'left' | 'right' | 'both' | null
  drop_tine_length: number | null
  has_split_g2: boolean
  split_g2_side: 'left' | 'right' | 'both' | null
  has_kickers: boolean
  kicker_count: number
  kicker_locations: string | null
  beam_curve: 'tight' | 'wide_sweep' | 'straight' | 'normal'
  beam_angle: 'upright' | 'sweeping' | 'palmated' | 'normal'
  tine_configuration: 'typical' | 'trash' | 'cluster' | 'stickers'
  notable_asymmetry: string | null
  broken_tines: string | null
  other_features: string | null
}

interface FingerprintConfidence {
  overall: number           // 0-100
  spread_confidence: number
  beam_confidence: number
  tine_confidence: number
  mass_confidence: number
  point_count_confidence: number
  features_confidence: number
  photo_quality: number
  visibility_score: number
}
```

### TrophyCluster

Groups unassigned trophy detections by fingerprint similarity.

```typescript
interface TrophyCluster {
  id: string
  user_id: string
  representative_detection_id: string | null
  status: 'pending' | 'named' | 'merged' | 'split' | 'dismissed'
  created_deer_id: string | null
  member_count: number
  avg_similarity: number | null
  min_similarity: number | null
  created_at: string
  updated_at: string
}
```

### TrophyClusterMember

Junction table linking detections to clusters.

```typescript
interface TrophyClusterMember {
  id: string
  cluster_id: string
  detection_id: string
  similarity_to_representative: number | null
  added_at: string
}
```

---

## Database Migration

```sql
-- 039_trophy_fingerprint.sql

-- Add fingerprint column to detections
ALTER TABLE detections ADD COLUMN antler_fingerprint JSONB;

CREATE INDEX idx_detections_fingerprint
  ON detections USING gin (antler_fingerprint)
  WHERE antler_fingerprint IS NOT NULL;

CREATE INDEX idx_detections_fingerprint_score_class
  ON detections ((antler_fingerprint->'scores'->>'score_class'))
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

CREATE INDEX idx_trophy_clusters_user_status
  ON trophy_clusters(user_id, status)
  WHERE status = 'pending';

-- Cluster membership table
CREATE TABLE trophy_cluster_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL REFERENCES trophy_clusters(id) ON DELETE CASCADE,
  detection_id UUID NOT NULL REFERENCES detections(id) ON DELETE CASCADE,
  similarity_to_representative DECIMAL(4,3),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(detection_id)
);

CREATE INDEX idx_trophy_cluster_members_cluster
  ON trophy_cluster_members(cluster_id);

CREATE INDEX idx_trophy_cluster_members_detection
  ON trophy_cluster_members(detection_id);

-- RLS policies
ALTER TABLE trophy_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE trophy_cluster_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clusters"
  ON trophy_clusters FOR SELECT
  USING (has_account_access(user_id));

CREATE POLICY "Users can insert own clusters"
  ON trophy_clusters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own clusters"
  ON trophy_clusters FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own clusters"
  ON trophy_clusters FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view accessible cluster members"
  ON trophy_cluster_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trophy_clusters
      WHERE trophy_clusters.id = trophy_cluster_members.cluster_id
      AND has_account_access(trophy_clusters.user_id)
    )
  );

CREATE POLICY "Users can manage own cluster members"
  ON trophy_cluster_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM trophy_clusters
      WHERE trophy_clusters.id = trophy_cluster_members.cluster_id
      AND auth.uid() = trophy_clusters.user_id
    )
  );

-- Helper function for unassigned trophy detections
CREATE OR REPLACE FUNCTION get_unassigned_trophy_detections(p_user_id UUID)
RETURNS TABLE (
  detection_id UUID,
  fingerprint JSONB,
  crop_file_path TEXT,
  captured_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id AS detection_id,
    d.antler_fingerprint AS fingerprint,
    d.crop_file_path,
    i.captured_at
  FROM detections d
  INNER JOIN images i ON d.image_id = i.id
  LEFT JOIN trophy_cluster_members tcm ON tcm.detection_id = d.id
  WHERE i.user_id = p_user_id
    AND d.size_class = 'trophy'
    AND d.deer_id IS NULL
    AND d.antler_fingerprint IS NOT NULL
    AND tcm.id IS NULL
    AND d.deleted_at IS NULL
  ORDER BY i.captured_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## Validation Rules

### AntlerFingerprint
- `version` must be '1.0'
- `generated_at` must be valid ISO 8601
- `confidence.overall` must be 0-100
- `scores.score_class` must be valid enum value
- At least one measurement must be non-null

### TrophyCluster
- `user_id` must exist in profiles
- `status` must be valid enum value
- `member_count` must be >= 0
- `created_deer_id` only set when status = 'named'

### TrophyClusterMember
- `detection_id` must reference trophy-tier detection
- `similarity_to_representative` must be 0.000-1.000
- Detection can only be in one cluster (enforced by UNIQUE constraint)

---

## State Transitions

### TrophyCluster Status
```
pending → named (user names cluster, deer created)
pending → merged (combined with another cluster)
pending → split (detections moved to new cluster)
pending → dismissed (marked as "not same buck")
```

### Detection Assignment
```
unassigned → clustered (added to trophy_cluster_members)
clustered → assigned (cluster named, deer_id set on detection)
unassigned → assigned (manually linked to deer)
```
