// Export client functions
export { analyzePhoto, compareDeers, validateGeminiClient } from "./client";

// Export types
export type { AnalysisResult, ComparisonResult, DeerDetectionResult } from "./types";

// Export schemas (for validation if needed)
export { analysisSchema, comparisonSchema, deerDetectionSchema } from "./types";

// Export prompts (for reference/testing)
export { PHOTO_ANALYSIS_PROMPT, DEER_COMPARISON_PROMPT, buildComparisonPromptWithCatalog } from "./prompts";
