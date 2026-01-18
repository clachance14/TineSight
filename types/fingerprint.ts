/**
 * Trophy Fingerprint Type Definitions
 * Feature: 011-trophy-fingerprint
 *
 * These types define the structure of antler fingerprints used for
 * trophy buck re-identification and clustering.
 */

/**
 * Calibration reference data used to convert pixel measurements to real-world inches
 */
export interface CalibrationData {
  reference_used: 'ear_length' | 'ear_spread' | 'eye_circumference' | 'eye_to_nose' | 'multiple'
  ear_length_inches: number
  ear_spread_inches: number | null
  angle_impact: number  // 0-100
  primary_view: 'left_profile' | 'right_profile' | 'frontal' | 'quartering' | 'rear'
  estimated_distance_feet: number | null
}

/**
 * Raw Boone & Crockett measurements in inches
 */
export interface RawMeasurements {
  inside_spread: number | null
  main_beam_left: number | null
  main_beam_right: number | null
  tines: {
    left: {
      g1: number | null
      g2: number | null
      g3: number | null
      g4: number | null
      g5: number | null
      g6: number | null
      g7: number | null
    }
    right: {
      g1: number | null
      g2: number | null
      g3: number | null
      g4: number | null
      g5: number | null
      g6: number | null
      g7: number | null
    }
  }
  mass: {
    left: {
      h1: number | null
      h2: number | null
      h3: number | null
      h4: number | null
    }
    right: {
      h1: number | null
      h2: number | null
      h3: number | null
      h4: number | null
    }
  }
  total_points: number
  points_per_side: [number, number]
}

/**
 * Boone & Crockett score calculations
 */
export interface CalculatedScores {
  gross_score: number
  deductions: number
  net_score: number
  score_class: '120s' | '140s' | '160s' | '180s' | '200s' | 'world_class' | 'unknown'
  typical_status: 'typical' | 'non_typical'
  abnormal_points_total: number | null
}

/**
 * Angle-invariant ratios for robust matching across different camera angles
 */
export interface DerivedRatios {
  g2_to_g3: number | null
  g1_to_g2: number | null
  beam_symmetry: number | null
  tine_symmetry: number | null
  spread_to_beam: number | null
  mass_to_beam: number | null
  brow_to_ear: number | null
  tallest_tine_to_ear: number | null
}

/**
 * Distinctive structural features for visual matching
 */
export interface DistinctiveFeatures {
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

/**
 * Confidence scores for each measurement category
 */
export interface FingerprintConfidence {
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

/**
 * Complete antler fingerprint structure
 * Stored as JSONB in detections.antler_fingerprint
 */
export interface AntlerFingerprint {
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

/**
 * Trophy cluster entity for grouping unassigned trophy detections
 */
export interface TrophyCluster {
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

/**
 * Junction table linking detections to trophy clusters
 */
export interface TrophyClusterMember {
  id: string
  cluster_id: string
  detection_id: string
  similarity_to_representative: number | null
  added_at: string
}
