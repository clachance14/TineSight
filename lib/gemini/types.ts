import { z } from "zod";

// Schema for deer detection in photo analysis
// Simplified format matching Google's recommended bounding box detection output
export const deerDetectionSchema = z.object({
  box_2d: z.tuple([z.number(), z.number(), z.number(), z.number()]).describe("[ymin, xmin, ymax, xmax] normalized 0-1000"),
  species: z.enum(["whitetail", "mule_deer", "elk", "unknown"]),
  sex: z.enum(["buck", "doe", "fawn", "unknown"]),
  antler_points: z.number().nullable().describe("Number of antler points, null for does/fawns"),
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
export type DeerDetectionResult = z.infer<typeof deerDetectionSchema>;
export type AnalysisResult = z.infer<typeof analysisSchema>;
export type ComparisonResult = z.infer<typeof comparisonSchema>;
