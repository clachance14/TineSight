# Research: Trophy Fingerprint

**Feature**: 011-trophy-fingerprint
**Date**: 2025-12-26

## Research Questions

1. What measurements and ratios should the fingerprint schema include?
2. What clustering algorithm is best for grouping similar detections?
3. What similarity thresholds should be used for matching?
4. How reliable is Gemini for B&C-style measurements from trail cam photos?

---

## 1. Fingerprint Schema Design

### Decision
Comprehensive JSONB structure with calibration, measurements, scores, ratios, features, and confidence.

### Rationale
- Trail cam photos vary in angle and quality - need confidence scores per measurement
- Ratios are more stable across viewing angles than absolute measurements
- Distinctive features (drop tines, split G2) are strong re-identification markers
- Score class helps users understand buck quality at a glance

### Alternatives Considered
- **Simple schema (score only)**: Rejected - insufficient for re-identification
- **Vector embedding only**: Rejected - not interpretable by users, can't show measurements
- **Separate tables**: Rejected - JSONB is simpler and performs well for this volume

### Schema Components

**Calibration**
- `reference_used`: Which anatomical reference calibrated measurements
- `ear_length_inches`: 6.5-7" standard (default 6.75")
- `ear_spread_inches`: 14-16" tip-to-tip (default 15")
- `angle_impact`: 0-100 score for how viewing angle affects reliability
- `primary_view`: left_profile, right_profile, frontal, quartering, rear

**Raw Measurements (inches)**
- `inside_spread`: Width between main beams
- `main_beam_left/right`: Burr to tip length
- `tines.left/right.g1-g7`: Tine lengths (G1=brow, G2=second, etc.)
- `mass.left/right.h1-h4`: Circumference measurements
- `total_points`, `points_per_side`

**Calculated Scores**
- `gross_score`: Sum of all measurements
- `deductions`: Left/right asymmetry deductions
- `net_score`: Gross minus deductions
- `score_class`: 120s, 140s, 160s, 180s, 200s, world_class
- `typical_status`: typical or non_typical

**Derived Ratios (angle-invariant)**
- `g2_to_g3`: G2 length / G3 length
- `beam_symmetry`: min(L,R) / max(L,R)
- `spread_to_beam`: Spread / average beam
- `brow_to_ear`: G1 / ear length
- `tallest_tine_to_ear`: Max tine / ear length

**Distinctive Features**
- `has_drop_tine`, `drop_tine_location`, `drop_tine_length`
- `has_split_g2`, `split_g2_side`
- `has_kickers`, `kicker_count`, `kicker_locations`
- `beam_curve`: tight, wide_sweep, straight, normal
- `beam_angle`: upright, sweeping, palmated, normal
- `notable_asymmetry`, `broken_tines`, `other_features`

**Confidence Scores (0-100)**
- `overall`, `spread_confidence`, `beam_confidence`
- `tine_confidence`, `mass_confidence`, `point_count_confidence`
- `features_confidence`, `photo_quality`, `visibility_score`

---

## 2. Clustering Algorithm

### Decision
Union-Find (Disjoint Set Union) with 85% similarity threshold.

### Rationale
- O(n log n) time complexity fits serverless constraints
- Incrementally updatable when new detections added
- Simple implementation, well-understood behavior
- 85% threshold maps directly from spec requirement

### Alternatives Considered
- **DBSCAN**: Good for automatic cluster count, but requires epsilon tuning and O(n^2) without spatial index
- **Hierarchical**: Produces nice dendrograms, but O(n^2) memory and not incremental
- **Greedy sequential**: Simple but order-dependent results

### Optimization for Scale
For 500+ detections:
1. Use pgvector embedding similarity as pre-filter (top-10 candidates per detection)
2. Only compute full fingerprint similarity for top candidates
3. Reduces comparisons from O(n^2) to O(n*10)

### Incremental Updates
When new trophy detection added:
1. Compare against existing cluster representatives
2. If 85%+ match, add to that cluster
3. Otherwise, leave unclustered for next batch re-cluster

---

## 3. Similarity Thresholds

### Decision
Weighted multi-factor similarity function with 85% threshold.

### Weights
| Factor | Weight | Rationale |
|--------|--------|-----------|
| Embeddings (visual) | 35% | Best for overall appearance match |
| Ratios (angle-invariant) | 30% | Stable across viewing angles |
| Features (distinctive) | 20% | Strong for re-ID (drop tines, etc.) |
| Measurements (absolute) | 15% | Only reliable with high confidence |

### Threshold Justification
- **85%**: Spec requirement for clustering
- Creates match candidates for human review at 85%+
- Below 85%: Left unclustered, no automatic suggestions

### Broken Tine Detection
Flag "possible broken tine" when:
- Ratio similarity > 70%
- Point count differs by 1-2
- Single tine measurement differs by >15%

---

## 4. B&C Scoring Accuracy

### Decision
Use anatomical calibration with per-measurement confidence scoring.

### Calibration References
| Reference Point | Standard Value | Use Case |
|-----------------|----------------|----------|
| Ear length | 6.75" (6.5-7") | Beam/tine calibration |
| Ear tip-to-tip | 15" (14-16") | Spread calibration |
| Eye circumference | 4" | Mass calibration |
| Eye-to-nose | 8" | Secondary length ref |

### Score Class Ranges (Typical Whitetail)
| Class | Gross Score | Description |
|-------|-------------|-------------|
| 120s | 120-129 | Young/developing |
| 140s | 140-149 | Quality mature |
| 160s | 160-169 | Trophy class, B&C Awards |
| 180s | 180-189 | Exceptional trophy |
| 200s | 200+ | World class |

### Accuracy Expectations
- Gemini estimates within 10-15% of actual B&C scores
- Sufficient for comparative matching (not official scoring)
- Confidence scores indicate measurement reliability
- Ratios more stable than absolutes across angles

### Sources
- Boone & Crockett Club field judging guidelines
- MSU Deer Lab scoring methodology
- BuckManager B&C terminology
- Browning Trail Cameras scoring guides
- Trail Cam Junkie scoring techniques

---

## Implementation Implications

### Gemini Prompt Design
- Include detailed anatomical calibration instructions
- Request structured output matching schema
- Ask for confidence per measurement category
- Request reasoning trace for auditability

### Comparison Algorithm
- Prioritize ratios over absolutes
- Weight distinctive features highly
- Flag potential broken tines for visual review
- Handle missing measurements gracefully

### UI Display
- Show score class badge prominently
- Display side-by-side measurement comparison
- Highlight differences >10%
- Show confidence indicators
- Explain possible broken tine flags
