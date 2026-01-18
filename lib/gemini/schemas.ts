/**
 * Gemini Native Schema Definitions for Structured Output
 *
 * Uses Gemini's schema format with uppercase type names (OBJECT, ARRAY, STRING, NUMBER, BOOLEAN)
 * See: https://ai.google.dev/gemini-api/docs/structured-output
 */

// ============================================================================
// TypeScript Types
// ============================================================================

export interface DetectionResult {
  deer_present: boolean;
  hogs_present: boolean;
  cows_present: boolean;
  goats_present: boolean;
  vehicles_present: boolean;
  people_present: boolean;
  image_quality_score: number;
  detections: Array<{
    box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
    detection_class: 'deer' | 'hog' | 'cow' | 'goat' | 'vehicle' | 'person';
    has_antlers: boolean;
    confidence: number;
  }>;
}

export interface ClassificationResult {
  sex: 'buck' | 'doe' | 'fawn' | 'unknown';
  size_class: 'spike' | 'basket' | 'standard' | 'trophy' | 'unknown' | null;
  estimated_point_range: 'spike' | 'fork' | '6-8 points' | '8-10 points' | '10+ points' | 'unknown' | null;
  antler_description: string | null;
  age_class: 'young' | 'mature' | 'old' | 'unknown';
  confidence: number;
}

export interface ComparisonResult {
  best_match: {
    deer_id: string;
    deer_name: string;
    confidence: number;
    reasoning: string;
  } | null;
  other_possibilities: Array<{
    deer_id: string;
    deer_name: string;
    confidence: number;
  }>;
  is_likely_new_deer: boolean;
}

export interface AnalysisResult {
  deer_present: boolean;
  image_quality_score: number;
  analysis_notes: string;
  detections: Array<{
    box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
    species: string;
    sex: 'buck' | 'doe' | 'fawn' | 'unknown';
    size_class: 'spike' | 'basket' | 'standard' | 'trophy' | 'unknown' | null;
    estimated_point_range: 'spike' | 'fork' | '6-8 points' | '8-10 points' | '10+ points' | 'unknown' | null;
    antler_description: string | null;
    confidence: number;
  }>;
}

// ============================================================================
// Gemini Native Schemas
// ============================================================================

/**
 * Stage 1: Detection Schema
 * Used by detectDeer() to identify deer in full images
 */
export const DETECTION_SCHEMA = {
  type: "OBJECT" as const,
  properties: {
    deer_present: {
      type: "BOOLEAN" as const,
      description: "Whether any deer are visible in the image",
      nullable: false,
    },
    hogs_present: {
      type: "BOOLEAN" as const,
      description: "Whether any hogs are visible in the image",
      nullable: false,
    },
    cows_present: {
      type: "BOOLEAN" as const,
      description: "Whether any cows are visible in the image",
      nullable: false,
    },
    goats_present: {
      type: "BOOLEAN" as const,
      description: "Whether any goats are visible in the image",
      nullable: false,
    },
    vehicles_present: {
      type: "BOOLEAN" as const,
      description: "Whether any vehicles are visible in the image",
      nullable: false,
    },
    people_present: {
      type: "BOOLEAN" as const,
      description: "Whether any people are visible in the image",
      nullable: false,
    },
    image_quality_score: {
      type: "NUMBER" as const,
      description: "Image quality score from 0-100 (lighting, focus, clarity)",
      nullable: false,
    },
    detections: {
      type: "ARRAY" as const,
      description: "Array of detected objects with bounding boxes",
      items: {
        type: "OBJECT" as const,
        properties: {
          box_2d: {
            type: "ARRAY" as const,
            description: "Bounding box [ymin, xmin, ymax, xmax] in 0-1000 normalized coordinates",
            items: {
              type: "NUMBER" as const,
            },
            nullable: false,
          },
          detection_class: {
            type: "STRING" as const,
            description: "Classification of detected object",
            enum: ["deer", "hog", "cow", "goat", "vehicle", "person"],
            nullable: false,
          },
          has_antlers: {
            type: "BOOLEAN" as const,
            description: "Whether antlers are visible on this deer (false for non-deer)",
            nullable: false,
          },
          confidence: {
            type: "NUMBER" as const,
            description: "Detection confidence score 0-100",
            nullable: false,
          },
        },
        required: ["box_2d", "detection_class", "has_antlers", "confidence"],
      },
    },
  },
  required: ["deer_present", "hogs_present", "cows_present", "goats_present", "vehicles_present", "people_present", "image_quality_score", "detections"],
};

/**
 * Stage 2: Classification Schema
 * Used by classifyDeerCrop() to classify individual deer crops
 */
export const CLASSIFICATION_SCHEMA = {
  type: "OBJECT" as const,
  properties: {
    sex: {
      type: "STRING" as const,
      description: "Deer sex classification",
      enum: ["buck", "doe", "fawn", "unknown"],
      nullable: false,
    },
    size_class: {
      type: "STRING" as const,
      description: "Rack size based on width relative to ears. 'spike'=unbranched, 'basket'=inside ears, 'standard'=outside ears, 'trophy'=heavy mass/wide",
      enum: ["spike", "basket", "standard", "trophy", "unknown"],
      nullable: true,
    },
    estimated_point_range: {
      type: "STRING" as const,
      description: "Conservative point bracket estimate",
      enum: ["spike", "fork", "6-8 points", "8-10 points", "10+ points", "unknown"],
      nullable: true,
    },
    antler_description: {
      type: "STRING" as const,
      description: "Detailed antler description for bucks (null otherwise)",
      nullable: true,
    },
    age_class: {
      type: "STRING" as const,
      description: "Age classification based on body size and features",
      enum: ["young", "mature", "old", "unknown"],
      nullable: false,
    },
    confidence: {
      type: "NUMBER" as const,
      description: "Classification confidence score 0-100",
      nullable: false,
    },
  },
  required: ["sex", "age_class", "confidence"],
};

/**
 * Stage 3: Comparison Schema
 * Used by compareDeers() to match deer against known profiles
 */
export const COMPARISON_SCHEMA = {
  type: "OBJECT" as const,
  properties: {
    best_match: {
      type: "OBJECT" as const,
      description: "The most likely matching deer profile (null if no good match)",
      properties: {
        deer_id: {
          type: "STRING" as const,
          description: "UUID of the matched deer profile",
          nullable: false,
        },
        deer_name: {
          type: "STRING" as const,
          description: "Name of the matched deer",
          nullable: false,
        },
        confidence: {
          type: "NUMBER" as const,
          description: "Match confidence score 0-100",
          nullable: false,
        },
        reasoning: {
          type: "STRING" as const,
          description: "Explanation of why this deer matches",
          nullable: false,
        },
      },
      required: ["deer_id", "deer_name", "confidence", "reasoning"],
      nullable: true,
    },
    other_possibilities: {
      type: "ARRAY" as const,
      description: "Other potential matches with lower confidence",
      items: {
        type: "OBJECT" as const,
        properties: {
          deer_id: {
            type: "STRING" as const,
            description: "UUID of the potential match",
            nullable: false,
          },
          deer_name: {
            type: "STRING" as const,
            description: "Name of the potential match",
            nullable: false,
          },
          confidence: {
            type: "NUMBER" as const,
            description: "Match confidence score 0-100",
            nullable: false,
          },
        },
        required: ["deer_id", "deer_name", "confidence"],
      },
    },
    is_likely_new_deer: {
      type: "BOOLEAN" as const,
      description: "Whether this appears to be a new deer not in the catalog",
      nullable: false,
    },
  },
  required: ["other_possibilities", "is_likely_new_deer"],
};

/**
 * Legacy: Full Analysis Schema
 * Used by analyzePhoto() for single-stage full image analysis
 */
export const ANALYSIS_SCHEMA = {
  type: "OBJECT" as const,
  properties: {
    deer_present: {
      type: "BOOLEAN" as const,
      description: "Whether any deer are visible in the image",
      nullable: false,
    },
    image_quality_score: {
      type: "NUMBER" as const,
      description: "Image quality score from 0-100 (lighting, focus, clarity)",
      nullable: false,
    },
    analysis_notes: {
      type: "STRING" as const,
      description: "General notes about the image and detected deer",
      nullable: false,
    },
    detections: {
      type: "ARRAY" as const,
      description: "Array of detected deer with full classification",
      items: {
        type: "OBJECT" as const,
        properties: {
          box_2d: {
            type: "ARRAY" as const,
            description: "Bounding box [ymin, xmin, ymax, xmax] in 0-1000 normalized coordinates",
            items: {
              type: "NUMBER" as const,
            },
            nullable: false,
          },
          species: {
            type: "STRING" as const,
            description: "Detected species (typically 'white-tailed deer')",
            nullable: false,
          },
          sex: {
            type: "STRING" as const,
            description: "Deer sex classification",
            enum: ["buck", "doe", "fawn", "unknown"],
            nullable: false,
          },
          size_class: {
            type: "STRING" as const,
            description: "Rack size based on width relative to ears. 'spike'=unbranched, 'basket'=inside ears, 'standard'=outside ears, 'trophy'=heavy mass/wide",
            enum: ["spike", "basket", "standard", "trophy", "unknown"],
            nullable: true,
          },
          estimated_point_range: {
            type: "STRING" as const,
            description: "Conservative point bracket estimate",
            enum: ["spike", "fork", "6-8 points", "8-10 points", "10+ points", "unknown"],
            nullable: true,
          },
          antler_description: {
            type: "STRING" as const,
            description: "Detailed antler description for bucks (null otherwise)",
            nullable: true,
          },
          confidence: {
            type: "NUMBER" as const,
            description: "Detection confidence score 0-100",
            nullable: false,
          },
        },
        required: ["box_2d", "species", "sex", "confidence"],
      },
    },
  },
  required: ["deer_present", "image_quality_score", "analysis_notes", "detections"],
};

/**
 * Stage 2: Deer Analysis Schema (with Thinking feature)
 * Used by analyzeDeer() for detailed crop analysis with reasoning
 */
export const DEER_ANALYSIS_SCHEMA = {
  description: "Detailed analysis of a single deer crop",
  type: "OBJECT" as const,
  properties: {
    is_deer: {
      type: "BOOLEAN" as const,
      description: "Whether this image contains a deer",
      nullable: false,
    },
    sex: {
      type: "STRING" as const,
      description: "Visual determination of sex based on antlers and body shape",
      enum: ["buck", "doe", "fawn", "unknown"],
      nullable: false,
    },
    age_class: {
      type: "STRING" as const,
      description: "Yearling=Long legs/thin neck. Mature=Thick neck/sagging belly",
      enum: ["fawn", "yearling", "mature", "unknown"],
      nullable: false,
    },
    antlers: {
      type: "OBJECT" as const,
      description: "Antler analysis results",
      properties: {
        has_antlers: {
          type: "BOOLEAN" as const,
          description: "Whether antlers are visible",
          nullable: false,
        },
        point_count: {
          type: "NUMBER" as const,
          description: "Total count of points >1 inch. Use null if doe/fawn or if strictly unsure",
          nullable: true,
        },
        characteristics: {
          type: "STRING" as const,
          description: "Brief description (e.g. 'Wide spread', 'Drop tine', 'Basket rack')",
          nullable: true,
        },
      },
      required: ["has_antlers"],
    },
    reasoning_trace: {
      type: "STRING" as const,
      description: "A 1-sentence explanation of the logic",
      nullable: false,
    },
    confidence: {
      type: "NUMBER" as const,
      description: "Confidence score 0-100",
      nullable: false,
    },
  },
  required: ["is_deer", "sex", "antlers", "reasoning_trace", "confidence"],
};

/**
 * TypeScript type for deer analysis result
 */
export interface DeerAnalysisResultSchema {
  is_deer: boolean;
  sex: 'buck' | 'doe' | 'fawn' | 'unknown';
  age_class?: 'fawn' | 'yearling' | 'mature' | 'unknown';
  antlers: {
    has_antlers: boolean;
    point_count: number | null;
    characteristics: string | null;
  };
  reasoning_trace: string;
  confidence: number;
}

/**
 * Stage 4: Antler Fingerprint Schema
 * Used for trophy-tier bucks to capture detailed measurements and features
 */
export const ANTLER_FINGERPRINT_SCHEMA = {
  description: "Detailed antler fingerprint for trophy bucks with measurements, scores, and distinctive features",
  type: "OBJECT" as const,
  properties: {
    version: {
      type: "STRING" as const,
      description: "Schema version (currently '1.0')",
      nullable: false,
    },
    generated_at: {
      type: "STRING" as const,
      description: "ISO 8601 timestamp when fingerprint was generated",
      nullable: false,
    },
    model_used: {
      type: "STRING" as const,
      description: "Model identifier used for analysis",
      nullable: false,
    },
    calibration: {
      type: "OBJECT" as const,
      description: "Calibration data for measurement accuracy",
      properties: {
        reference_used: {
          type: "STRING" as const,
          description: "Primary anatomical reference used for calibration",
          enum: ["ear_length", "ear_spread", "eye_circumference", "eye_to_nose", "multiple"],
          nullable: false,
        },
        ear_length_inches: {
          type: "NUMBER" as const,
          description: "Estimated ear length in inches (typical: 7-8 inches)",
          nullable: false,
        },
        ear_spread_inches: {
          type: "NUMBER" as const,
          description: "Ear spread in inches when alert (typical: 13-14 inches)",
          nullable: true,
        },
        angle_impact: {
          type: "NUMBER" as const,
          description: "Angle impact on measurement accuracy (0-100, higher = more impact)",
          nullable: false,
        },
        primary_view: {
          type: "STRING" as const,
          description: "Primary viewing angle of the deer",
          enum: ["left_profile", "right_profile", "frontal", "quartering", "rear"],
          nullable: false,
        },
        estimated_distance_feet: {
          type: "NUMBER" as const,
          description: "Estimated distance from camera in feet",
          nullable: true,
        },
      },
      required: ["reference_used", "ear_length_inches", "angle_impact", "primary_view"],
    },
    measurements: {
      type: "OBJECT" as const,
      description: "Raw antler measurements in inches",
      properties: {
        inside_spread: {
          type: "NUMBER" as const,
          description: "Inside spread measurement in inches",
          nullable: true,
        },
        main_beam_left: {
          type: "NUMBER" as const,
          description: "Left main beam length in inches",
          nullable: true,
        },
        main_beam_right: {
          type: "NUMBER" as const,
          description: "Right main beam length in inches",
          nullable: true,
        },
        tines: {
          type: "OBJECT" as const,
          description: "Tine measurements for both sides",
          properties: {
            left: {
              type: "OBJECT" as const,
              description: "Left side tine measurements",
              properties: {
                g1: { type: "NUMBER" as const, description: "G1 (brow tine) length in inches", nullable: true },
                g2: { type: "NUMBER" as const, description: "G2 tine length in inches", nullable: true },
                g3: { type: "NUMBER" as const, description: "G3 tine length in inches", nullable: true },
                g4: { type: "NUMBER" as const, description: "G4 tine length in inches", nullable: true },
                g5: { type: "NUMBER" as const, description: "G5 tine length in inches", nullable: true },
                g6: { type: "NUMBER" as const, description: "G6 tine length in inches", nullable: true },
                g7: { type: "NUMBER" as const, description: "G7 tine length in inches", nullable: true },
              },
            },
            right: {
              type: "OBJECT" as const,
              description: "Right side tine measurements",
              properties: {
                g1: { type: "NUMBER" as const, description: "G1 (brow tine) length in inches", nullable: true },
                g2: { type: "NUMBER" as const, description: "G2 tine length in inches", nullable: true },
                g3: { type: "NUMBER" as const, description: "G3 tine length in inches", nullable: true },
                g4: { type: "NUMBER" as const, description: "G4 tine length in inches", nullable: true },
                g5: { type: "NUMBER" as const, description: "G5 tine length in inches", nullable: true },
                g6: { type: "NUMBER" as const, description: "G6 tine length in inches", nullable: true },
                g7: { type: "NUMBER" as const, description: "G7 tine length in inches", nullable: true },
              },
            },
          },
          required: ["left", "right"],
        },
        mass: {
          type: "OBJECT" as const,
          description: "Mass (circumference) measurements for both sides",
          properties: {
            left: {
              type: "OBJECT" as const,
              description: "Left side mass measurements",
              properties: {
                h1: { type: "NUMBER" as const, description: "H1 circumference in inches", nullable: true },
                h2: { type: "NUMBER" as const, description: "H2 circumference in inches", nullable: true },
                h3: { type: "NUMBER" as const, description: "H3 circumference in inches", nullable: true },
                h4: { type: "NUMBER" as const, description: "H4 circumference in inches", nullable: true },
              },
            },
            right: {
              type: "OBJECT" as const,
              description: "Right side mass measurements",
              properties: {
                h1: { type: "NUMBER" as const, description: "H1 circumference in inches", nullable: true },
                h2: { type: "NUMBER" as const, description: "H2 circumference in inches", nullable: true },
                h3: { type: "NUMBER" as const, description: "H3 circumference in inches", nullable: true },
                h4: { type: "NUMBER" as const, description: "H4 circumference in inches", nullable: true },
              },
            },
          },
          required: ["left", "right"],
        },
        total_points: {
          type: "NUMBER" as const,
          description: "Total number of scoreable points (both sides)",
          nullable: false,
        },
        points_per_side: {
          type: "ARRAY" as const,
          description: "Points count per side [left, right]",
          items: {
            type: "NUMBER" as const,
          },
          nullable: false,
        },
      },
      required: ["tines", "mass", "total_points", "points_per_side"],
    },
    scores: {
      type: "OBJECT" as const,
      description: "Calculated Boone and Crockett scores",
      properties: {
        gross_score: {
          type: "NUMBER" as const,
          description: "Gross B&C score before deductions",
          nullable: false,
        },
        deductions: {
          type: "NUMBER" as const,
          description: "Total deductions for asymmetry",
          nullable: false,
        },
        net_score: {
          type: "NUMBER" as const,
          description: "Net B&C score after deductions",
          nullable: false,
        },
        score_class: {
          type: "STRING" as const,
          description: "Score classification bracket",
          enum: ["120s", "140s", "160s", "180s", "200s", "world_class", "unknown"],
          nullable: false,
        },
        typical_status: {
          type: "STRING" as const,
          description: "Whether this is a typical or non-typical rack",
          enum: ["typical", "non_typical"],
          nullable: false,
        },
        abnormal_points_total: {
          type: "NUMBER" as const,
          description: "Total inches of abnormal points",
          nullable: true,
        },
      },
      required: ["gross_score", "deductions", "net_score", "score_class", "typical_status"],
    },
    ratios: {
      type: "OBJECT" as const,
      description: "Derived ratios for re-identification matching",
      properties: {
        g2_to_g3: {
          type: "NUMBER" as const,
          description: "Ratio of G2 to G3 tine length (distinctive feature)",
          nullable: true,
        },
        g1_to_g2: {
          type: "NUMBER" as const,
          description: "Ratio of G1 (brow) to G2 tine length",
          nullable: true,
        },
        beam_symmetry: {
          type: "NUMBER" as const,
          description: "Symmetry ratio between left and right main beams",
          nullable: true,
        },
        tine_symmetry: {
          type: "NUMBER" as const,
          description: "Overall tine symmetry score",
          nullable: true,
        },
        spread_to_beam: {
          type: "NUMBER" as const,
          description: "Ratio of inside spread to main beam length",
          nullable: true,
        },
        mass_to_beam: {
          type: "NUMBER" as const,
          description: "Ratio of average mass to main beam length",
          nullable: true,
        },
        brow_to_ear: {
          type: "NUMBER" as const,
          description: "Ratio of brow tine length to ear length (calibration check)",
          nullable: true,
        },
        tallest_tine_to_ear: {
          type: "NUMBER" as const,
          description: "Ratio of tallest tine to ear length",
          nullable: true,
        },
      },
    },
    features: {
      type: "OBJECT" as const,
      description: "Distinctive features for visual re-identification",
      properties: {
        has_drop_tine: {
          type: "BOOLEAN" as const,
          description: "Whether a drop tine is present",
          nullable: false,
        },
        drop_tine_location: {
          type: "STRING" as const,
          description: "Location of drop tine(s)",
          enum: ["left", "right", "both"],
          nullable: true,
        },
        drop_tine_length: {
          type: "NUMBER" as const,
          description: "Length of drop tine in inches",
          nullable: true,
        },
        has_split_g2: {
          type: "BOOLEAN" as const,
          description: "Whether G2 tine is split/forked",
          nullable: false,
        },
        split_g2_side: {
          type: "STRING" as const,
          description: "Which side has split G2",
          enum: ["left", "right", "both"],
          nullable: true,
        },
        has_kickers: {
          type: "BOOLEAN" as const,
          description: "Whether kicker points are present",
          nullable: false,
        },
        kicker_count: {
          type: "NUMBER" as const,
          description: "Number of kicker points",
          nullable: false,
        },
        kicker_locations: {
          type: "STRING" as const,
          description: "Description of kicker locations (e.g., 'off G2 left', 'base right')",
          nullable: true,
        },
        beam_curve: {
          type: "STRING" as const,
          description: "Main beam curve characteristic",
          enum: ["tight", "wide_sweep", "straight", "normal"],
          nullable: false,
        },
        beam_angle: {
          type: "STRING" as const,
          description: "Main beam angle characteristic",
          enum: ["upright", "sweeping", "palmated", "normal"],
          nullable: false,
        },
        tine_configuration: {
          type: "STRING" as const,
          description: "Overall tine configuration pattern",
          enum: ["typical", "trash", "cluster", "stickers"],
          nullable: false,
        },
        notable_asymmetry: {
          type: "STRING" as const,
          description: "Description of notable asymmetry (e.g., 'missing G3 left', 'broken G4 right')",
          nullable: true,
        },
        broken_tines: {
          type: "STRING" as const,
          description: "Description of broken or damaged tines",
          nullable: true,
        },
        other_features: {
          type: "STRING" as const,
          description: "Other distinctive features not captured elsewhere",
          nullable: true,
        },
      },
      required: ["has_drop_tine", "has_split_g2", "has_kickers", "kicker_count", "beam_curve", "beam_angle", "tine_configuration"],
    },
    confidence: {
      type: "OBJECT" as const,
      description: "Confidence scores for different aspects of the fingerprint",
      properties: {
        overall: {
          type: "NUMBER" as const,
          description: "Overall fingerprint confidence (0-100)",
          nullable: false,
        },
        spread_confidence: {
          type: "NUMBER" as const,
          description: "Confidence in spread measurement (0-100)",
          nullable: false,
        },
        beam_confidence: {
          type: "NUMBER" as const,
          description: "Confidence in beam measurements (0-100)",
          nullable: false,
        },
        tine_confidence: {
          type: "NUMBER" as const,
          description: "Confidence in tine measurements (0-100)",
          nullable: false,
        },
        mass_confidence: {
          type: "NUMBER" as const,
          description: "Confidence in mass measurements (0-100)",
          nullable: false,
        },
        point_count_confidence: {
          type: "NUMBER" as const,
          description: "Confidence in point count (0-100)",
          nullable: false,
        },
        features_confidence: {
          type: "NUMBER" as const,
          description: "Confidence in distinctive features identification (0-100)",
          nullable: false,
        },
        photo_quality: {
          type: "NUMBER" as const,
          description: "Photo quality score (0-100)",
          nullable: false,
        },
        visibility_score: {
          type: "NUMBER" as const,
          description: "Antler visibility score (0-100)",
          nullable: false,
        },
      },
      required: ["overall", "spread_confidence", "beam_confidence", "tine_confidence", "mass_confidence", "point_count_confidence", "features_confidence", "photo_quality", "visibility_score"],
    },
    reasoning_trace: {
      type: "STRING" as const,
      description: "Detailed reasoning about measurements, calibration, and distinctive features",
      nullable: false,
    },
  },
  required: ["version", "generated_at", "model_used", "calibration", "measurements", "scores", "ratios", "features", "confidence", "reasoning_trace"],
};

/**
 * TypeScript type for antler fingerprint result
 */
export interface AntlerFingerprintSchema {
  version: '1.0';
  generated_at: string;
  model_used: string;
  calibration: {
    reference_used: 'ear_length' | 'ear_spread' | 'eye_circumference' | 'eye_to_nose' | 'multiple';
    ear_length_inches: number;
    ear_spread_inches: number | null;
    angle_impact: number;
    primary_view: 'left_profile' | 'right_profile' | 'frontal' | 'quartering' | 'rear';
    estimated_distance_feet: number | null;
  };
  measurements: {
    inside_spread: number | null;
    main_beam_left: number | null;
    main_beam_right: number | null;
    tines: {
      left: {
        g1: number | null;
        g2: number | null;
        g3: number | null;
        g4: number | null;
        g5: number | null;
        g6: number | null;
        g7: number | null;
      };
      right: {
        g1: number | null;
        g2: number | null;
        g3: number | null;
        g4: number | null;
        g5: number | null;
        g6: number | null;
        g7: number | null;
      };
    };
    mass: {
      left: {
        h1: number | null;
        h2: number | null;
        h3: number | null;
        h4: number | null;
      };
      right: {
        h1: number | null;
        h2: number | null;
        h3: number | null;
        h4: number | null;
      };
    };
    total_points: number;
    points_per_side: [number, number];
  };
  scores: {
    gross_score: number;
    deductions: number;
    net_score: number;
    score_class: '120s' | '140s' | '160s' | '180s' | '200s' | 'world_class' | 'unknown';
    typical_status: 'typical' | 'non_typical';
    abnormal_points_total: number | null;
  };
  ratios: {
    g2_to_g3: number | null;
    g1_to_g2: number | null;
    beam_symmetry: number | null;
    tine_symmetry: number | null;
    spread_to_beam: number | null;
    mass_to_beam: number | null;
    brow_to_ear: number | null;
    tallest_tine_to_ear: number | null;
  };
  features: {
    has_drop_tine: boolean;
    drop_tine_location: 'left' | 'right' | 'both' | null;
    drop_tine_length: number | null;
    has_split_g2: boolean;
    split_g2_side: 'left' | 'right' | 'both' | null;
    has_kickers: boolean;
    kicker_count: number;
    kicker_locations: string | null;
    beam_curve: 'tight' | 'wide_sweep' | 'straight' | 'normal';
    beam_angle: 'upright' | 'sweeping' | 'palmated' | 'normal';
    tine_configuration: 'typical' | 'trash' | 'cluster' | 'stickers';
    notable_asymmetry: string | null;
    broken_tines: string | null;
    other_features: string | null;
  };
  confidence: {
    overall: number;
    spread_confidence: number;
    beam_confidence: number;
    tine_confidence: number;
    mass_confidence: number;
    point_count_confidence: number;
    features_confidence: number;
    photo_quality: number;
    visibility_score: number;
  };
  reasoning_trace: string;
}
