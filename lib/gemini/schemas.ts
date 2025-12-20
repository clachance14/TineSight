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
  image_quality_score: number;
  detections: Array<{
    box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
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
    image_quality_score: {
      type: "NUMBER" as const,
      description: "Image quality score from 0-100 (lighting, focus, clarity)",
      nullable: false,
    },
    detections: {
      type: "ARRAY" as const,
      description: "Array of detected deer bounding boxes",
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
          has_antlers: {
            type: "BOOLEAN" as const,
            description: "Whether antlers are visible on this deer",
            nullable: false,
          },
          confidence: {
            type: "NUMBER" as const,
            description: "Detection confidence score 0-100",
            nullable: false,
          },
        },
        required: ["box_2d", "has_antlers", "confidence"],
      },
    },
  },
  required: ["deer_present", "image_quality_score", "detections"],
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
