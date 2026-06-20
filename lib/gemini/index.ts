// Export client functions
export { analyzePhoto, compareDeers, validateGeminiClient, detectDeer, classifyDeerCrop, analyzeDeer, estimateAntlerScore } from "./client";

// Export types
export type { AnalysisResult, ComparisonResult, DeerDetectionResult, DetectionOnlyResult, DeerAnalysisResult, ScoreEstimateResult } from "./types";

// Export metrics types from client
export type { GeminiMetrics, DetectDeerResult, ClassifyDeerResult, DeerClassificationResult, EstimateScoreResult } from "./client";

// Export Zod schemas (for validation)
export { analysisSchema, comparisonSchema, deerDetectionSchema, detectionOnlySchema, deerAnalysisSchema, scoreEstimateSchema } from "./types";

// Export Gemini native schemas (for structured output)
export * from "./schemas";

// Export prompts (for reference/testing)
export { PHOTO_ANALYSIS_PROMPT, DEER_COMPARISON_PROMPT, buildComparisonPromptWithCatalog, DETECTION_ONLY_PROMPT, DEER_ANALYSIS_PROMPT } from "./prompts";
