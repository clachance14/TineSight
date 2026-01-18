import { z } from "zod";

// Detection class types for multi-class detection
export type DetectionClass = 'deer' | 'hog' | 'cow' | 'goat' | 'vehicle' | 'person';

// Schema for detection-only result (Stage 1: localization only)
export const detectionOnlyBoxSchema = z.object({
  box_2d: z.tuple([z.number(), z.number(), z.number(), z.number()]).describe("[ymin, xmin, ymax, xmax] normalized 0-1000"),
  detection_class: z.enum(['deer', 'hog', 'cow', 'goat', 'vehicle', 'person']).describe("Classification of detected object"),
  confidence: z.number().min(0).max(100).describe("Confidence score 0-100"),
  has_antlers: z.boolean().describe("True ONLY for deer with visible antlers")
});

export const detectionOnlySchema = z.object({
  deer_present: z.boolean(),
  hogs_present: z.boolean(),
  cows_present: z.boolean(),
  goats_present: z.boolean(),
  vehicles_present: z.boolean(),
  people_present: z.boolean(),
  detections: z.array(detectionOnlyBoxSchema),
  image_quality_score: z.number().min(0).max(100)
});

// Schema for deer detection in photo analysis
// Simplified format matching Google's recommended bounding box detection output
export const deerDetectionSchema = z.object({
  box_2d: z.tuple([z.number(), z.number(), z.number(), z.number()]).describe("[ymin, xmin, ymax, xmax] normalized 0-1000"),
  species: z.enum(["whitetail", "mule_deer", "elk", "unknown"]),
  sex: z.enum(["buck", "doe", "fawn", "unknown"]),
  size_class: z.enum(["spike", "basket", "standard", "trophy", "unknown"]).nullable().describe("Buck size class based on antler development"),
  estimated_point_range: z.enum(["spike", "fork", "6-8 points", "8-10 points", "10+ points", "unknown"]).nullable().describe("Estimated antler point range"),
  antler_description: z.string().nullable().optional().describe("Qualitative description of antler characteristics"),
  confidence: z.number().min(0).max(100).describe("Confidence score 0-100")
});

// Schema for full photo analysis response
export const analysisSchema = z.object({
  deer_present: z.boolean(),
  detections: z.array(deerDetectionSchema),
  image_quality_score: z.number().min(0).max(100),
  analysis_notes: z.string().describe("Notes about image quality, visibility issues, or analysis limitations")
});

// Schema for deer comparison/matching response
export const comparisonSchema = z.object({
  best_match: z.object({
    deer_id: z.string(),
    deer_name: z.string(),
    confidence: z.number().min(0).max(100),
    reasoning: z.string().describe("Detailed explanation of why this deer matches")
  }).nullable(),
  other_possibilities: z.array(z.object({
    deer_id: z.string(),
    deer_name: z.string(),
    confidence: z.number().min(0).max(100)
  })),
  is_likely_new_deer: z.boolean().describe("True if detection likely represents a new deer not in catalog")
});

// Export types inferred from schemas
export type DetectionOnlyBox = z.infer<typeof detectionOnlyBoxSchema>;
export type DetectionOnlyResult = z.infer<typeof detectionOnlySchema>;
export type DeerDetectionResult = z.infer<typeof deerDetectionSchema>;
export type AnalysisResult = z.infer<typeof analysisSchema>;
export type ComparisonResult = z.infer<typeof comparisonSchema>;

// Schema for deer analysis with reasoning trace (Stage 2 with Thinking feature)
export const deerAnalysisSchema = z.object({
  is_deer: z.boolean(),
  sex: z.enum(["buck", "doe", "fawn", "unknown"]),
  age_class: z.enum(["fawn", "yearling", "mature", "unknown"]).optional(),
  antlers: z.object({
    has_antlers: z.boolean(),
    size_class: z.enum(["spike", "basket", "standard", "trophy", "unknown"]).nullable().describe("Buck size class based on antler development"),
    estimated_point_range: z.enum(["spike", "fork", "6-8 points", "8-10 points", "10+ points", "unknown"]).nullable().describe("Estimated antler point range"),
    characteristics: z.string().nullable().optional()
  }),
  reasoning_trace: z.string(),
  confidence: z.number().min(0).max(100)
});

export type DeerAnalysisResult = z.infer<typeof deerAnalysisSchema>;

// Schema for antler fingerprint (Stage 3: Trophy buck detailed measurements)
const tineSchema = z.object({
  g1: z.number().nullable(),
  g2: z.number().nullable(),
  g3: z.number().nullable(),
  g4: z.number().nullable(),
  g5: z.number().nullable(),
  g6: z.number().nullable(),
  g7: z.number().nullable(),
});

const massSchema = z.object({
  h1: z.number().nullable(),
  h2: z.number().nullable(),
  h3: z.number().nullable(),
  h4: z.number().nullable(),
});

export const antlerFingerprintSchema = z.object({
  version: z.literal('1.0'),
  generated_at: z.string(),
  model_used: z.string(),
  calibration: z.object({
    reference_used: z.enum(['ear_length', 'ear_spread', 'eye_circumference', 'eye_to_nose', 'multiple']),
    ear_length_inches: z.number(),
    ear_spread_inches: z.number().nullable(),
    angle_impact: z.number().min(0).max(100),
    primary_view: z.enum(['left_profile', 'right_profile', 'frontal', 'quartering', 'rear']),
    estimated_distance_feet: z.number().nullable(),
  }),
  measurements: z.object({
    inside_spread: z.number().nullable(),
    main_beam_left: z.number().nullable(),
    main_beam_right: z.number().nullable(),
    tines: z.object({
      left: tineSchema,
      right: tineSchema,
    }),
    mass: z.object({
      left: massSchema,
      right: massSchema,
    }),
    total_points: z.number(),
    points_per_side: z.tuple([z.number(), z.number()]),
  }),
  scores: z.object({
    gross_score: z.number(),
    deductions: z.number(),
    net_score: z.number(),
    score_class: z.enum(['120s', '140s', '160s', '180s', '200s', 'world_class', 'unknown']),
    typical_status: z.enum(['typical', 'non_typical']),
    abnormal_points_total: z.number().nullable(),
  }),
  ratios: z.object({
    g2_to_g3: z.number().nullable(),
    g1_to_g2: z.number().nullable(),
    beam_symmetry: z.number().nullable(),
    tine_symmetry: z.number().nullable(),
    spread_to_beam: z.number().nullable(),
    mass_to_beam: z.number().nullable(),
    brow_to_ear: z.number().nullable(),
    tallest_tine_to_ear: z.number().nullable(),
  }),
  features: z.object({
    has_drop_tine: z.boolean(),
    drop_tine_location: z.enum(['left', 'right', 'both']).nullable(),
    drop_tine_length: z.number().nullable(),
    has_split_g2: z.boolean(),
    split_g2_side: z.enum(['left', 'right', 'both']).nullable(),
    has_kickers: z.boolean(),
    kicker_count: z.number(),
    kicker_locations: z.string().nullable(),
    beam_curve: z.enum(['tight', 'wide_sweep', 'straight', 'normal']),
    beam_angle: z.enum(['upright', 'sweeping', 'palmated', 'normal']),
    tine_configuration: z.enum(['typical', 'trash', 'cluster', 'stickers']),
    notable_asymmetry: z.string().nullable(),
    broken_tines: z.string().nullable(),
    other_features: z.string().nullable(),
  }),
  confidence: z.object({
    overall: z.number().min(0).max(100),
    spread_confidence: z.number().min(0).max(100),
    beam_confidence: z.number().min(0).max(100),
    tine_confidence: z.number().min(0).max(100),
    mass_confidence: z.number().min(0).max(100),
    point_count_confidence: z.number().min(0).max(100),
    features_confidence: z.number().min(0).max(100),
    photo_quality: z.number().min(0).max(100),
    visibility_score: z.number().min(0).max(100),
  }),
  reasoning_trace: z.string(),
});

export type AntlerFingerprintResult = z.infer<typeof antlerFingerprintSchema>;
