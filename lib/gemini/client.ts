import { GoogleGenAI } from "@google/genai";
import { analysisSchema, comparisonSchema, detectionOnlySchema, deerAnalysisSchema, antlerFingerprintSchema, scoreEstimateSchema, type AnalysisResult, type ComparisonResult, type DetectionOnlyResult, type DeerAnalysisResult, type AntlerFingerprintResult, type ScoreEstimateResult } from "./types";
import { PHOTO_ANALYSIS_PROMPT, buildComparisonPromptWithCatalog, DEER_CLASSIFICATION_PROMPT, DETECTION_ONLY_PROMPT, DEER_ANALYSIS_PROMPT, ANTLER_FINGERPRINT_PROMPT, SCORE_ESTIMATE_PROMPT } from "./prompts";
import { DETECTION_SCHEMA, CLASSIFICATION_SCHEMA, COMPARISON_SCHEMA, ANALYSIS_SCHEMA, DEER_ANALYSIS_SCHEMA, ANTLER_FINGERPRINT_SCHEMA, SCORE_ESTIMATE_SCHEMA } from "./schemas";

/**
 * Metrics captured from a Gemini API call
 */
export interface GeminiMetrics {
  promptTokens: number;
  responseTokens: number;
  totalTokens: number;
  /** Thinking/thought tokens (billed at the output rate). 0 when Thinking is off. */
  thoughtsTokens?: number;
  modelUsed: string;
  wasRateLimited: boolean;
  retryCount: number;
  durationMs: number;
}

// Singleton Gemini client
let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

/**
 * Retry configuration for Gemini API calls
 */
const RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
};

/**
 * Primary Gemini model - configurable via environment variable
 * Options: gemini-3-flash-preview (better accuracy, 67% more expensive)
 *          gemini-2.5-flash (default, good balance)
 */
const PRIMARY_MODEL = process.env['GEMINI_MODEL'] || "gemini-2.5-flash";

/**
 * Model fallback chain - try these in order if primary is overloaded
 */
const MODEL_FALLBACK_CHAIN = [
  PRIMARY_MODEL,
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
].filter((v, i, a) => a.indexOf(v) === i); // Dedupe if primary is already in list

/**
 * Model for Stage 1 detection (bounding boxes)
 */
const DETECTION_MODEL = PRIMARY_MODEL;

/**
 * Result from withRetry including retry metrics
 */
interface RetryResult<T> {
  result: T;
  retryCount: number;
  wasRateLimited: boolean;
}

/**
 * Exponential backoff retry wrapper with metrics tracking
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  attemptNumber: number = 1,
  rateLimitHit: boolean = false
): Promise<RetryResult<T>> {
  try {
    const result = await fn();
    return {
      result,
      retryCount: attemptNumber - 1,
      wasRateLimited: rateLimitHit
    };
  } catch (error) {
    if (attemptNumber >= RETRY_CONFIG.maxAttempts) {
      throw error;
    }

    // Check if error is retryable (rate limit, network error, etc.)
    const isRateLimit =
      error instanceof Error &&
      (error.message.includes("rate limit") ||
       error.message.includes("429"));

    const isRetryable =
      isRateLimit ||
      (error instanceof Error &&
        (error.message.includes("timeout") ||
         error.message.includes("network") ||
         error.message.includes("503")));

    if (!isRetryable) {
      throw error;
    }

    // Track if we hit a rate limit
    const hitRateLimit = rateLimitHit || isRateLimit;

    // Calculate delay with exponential backoff
    const delay = RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attemptNumber - 1);

    console.log(`Retry attempt ${attemptNumber}/${RETRY_CONFIG.maxAttempts} after ${delay}ms delay${isRateLimit ? ' (rate limited)' : ''}`);
    await new Promise(resolve => setTimeout(resolve, delay));

    return withRetry(fn, attemptNumber + 1, hitRateLimit);
  }
}

/**
 * Result from detectDeer including metrics
 */
export interface DetectDeerResult {
  result: DetectionOnlyResult;
  metrics: GeminiMetrics;
}

/**
 * Detect deer in a trail camera photo (Stage 1: localization only)
 *
 * This is the first stage of the two-stage pipeline that focuses solely on
 * detecting bounding boxes and confidence scores without classification.
 *
 * @param imageBase64 - Base64-encoded image data (without data:image prefix)
 * @param mimeType - Image MIME type (e.g., "image/jpeg", "image/png")
 * @returns Detection result with bounding boxes, confidence scores, and API metrics
 */
export async function detectDeer(
  imageBase64: string,
  mimeType: string
): Promise<DetectDeerResult> {
  const ai = getGeminiClient();
  const startTime = Date.now();

  console.log(`Using model for detection: ${DETECTION_MODEL}`);
  const { result, retryCount, wasRateLimited } = await withRetry(async () => {
    const response = await ai.models.generateContent({
      model: DETECTION_MODEL,
      contents: [
        {
          parts: [
            { inlineData: { data: imageBase64, mimeType } },
            { text: DETECTION_ONLY_PROMPT }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: DETECTION_SCHEMA,
        temperature: 0.1,
      }
    });
    return response;
  });

  const durationMs = Date.now() - startTime;

  // Process the response
  const text = result.text;
  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  // Parse and validate response against schema
  const parsed = JSON.parse(text);

  // Extract token usage
  const promptTokens = result.usageMetadata?.promptTokenCount ?? 0;
  const responseTokens = result.usageMetadata?.candidatesTokenCount ?? 0;
  const totalTokens = result.usageMetadata?.totalTokenCount ?? 0;

  // Debug: Log raw Gemini response and token usage
  console.log(`Gemini (${DETECTION_MODEL}) detection response:`, JSON.stringify(parsed, null, 2));
  console.log(`Gemini (${DETECTION_MODEL}) token usage:`, {
    promptTokens,
    responseTokens,
    totalTokens,
  });

  const validated = detectionOnlySchema.parse(parsed);

  return {
    result: validated,
    metrics: {
      promptTokens,
      responseTokens,
      totalTokens,
      modelUsed: DETECTION_MODEL,
      wasRateLimited,
      retryCount,
      durationMs,
    }
  };
}

/**
 * Analyze a trail camera photo for deer detection and classification
 *
 * @param imageBase64 - Base64-encoded image data (without data:image prefix)
 * @param mimeType - Image MIME type (e.g., "image/jpeg", "image/png")
 * @returns Structured analysis result with deer detections
 */
export async function analyzePhoto(
  imageBase64: string,
  mimeType: string
): Promise<AnalysisResult> {
  const ai = getGeminiClient();

  // Try each model in the fallback chain until one succeeds
  let lastError: Error | null = null;

  for (const model of MODEL_FALLBACK_CHAIN) {
    try {
      console.log(`Trying model: ${model}`);
      const { result: response } = await withRetry(async () => {
        const resp = await ai.models.generateContent({
          model,
          contents: [
            {
              parts: [
                { inlineData: { data: imageBase64, mimeType } },
                { text: PHOTO_ANALYSIS_PROMPT }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: ANALYSIS_SCHEMA,
            temperature: 0.1,
          }
        });
        return resp;
      });

      // If we get here, the model worked - process the response
      const text = response.text;
      if (!text) {
        throw new Error("Gemini returned empty response");
      }

      // Parse and validate response against schema
      const parsed = JSON.parse(text);

      // Debug: Log raw Gemini response
      console.log(`Gemini (${model}) raw response:`, JSON.stringify(parsed, null, 2));

      const validated = analysisSchema.parse(parsed);
      return validated;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isOverloaded = lastError.message.includes("503") ||
                           lastError.message.includes("overloaded") ||
                           lastError.message.includes("UNAVAILABLE");

      if (isOverloaded && model !== MODEL_FALLBACK_CHAIN[MODEL_FALLBACK_CHAIN.length - 1]) {
        console.log(`Model ${model} overloaded, trying next fallback...`);
        continue;
      }

      // If not overloaded or last model, throw
      throw lastError;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new Error("All Gemini models failed");
}

/**
 * Compare a deer detection against catalog deer to find matches
 *
 * @param detectionImageBase64 - Base64-encoded detection/crop image
 * @param detectionMimeType - MIME type for detection image
 * @param catalogDeer - Array of catalog deer with reference images
 * @returns Match comparison result with best match and alternatives
 */
export async function compareDeers(
  detectionImageBase64: string,
  detectionMimeType: string,
  catalogDeer: Array<{
    id: string;
    name: string;
    referenceImageBase64: string;
    referenceImageMimeType: string;
  }>
): Promise<ComparisonResult> {
  const ai = getGeminiClient();

  if (catalogDeer.length === 0) {
    throw new Error("Cannot compare deer: catalog is empty");
  }

  // Build prompt with catalog deer metadata
  const prompt = buildComparisonPromptWithCatalog(
    catalogDeer.map(d => ({ id: d.id, name: d.name }))
  );

  // Construct contents array: detection image first, then catalog images
  const contents = [
    {
      parts: [
        { inlineData: { data: detectionImageBase64, mimeType: detectionMimeType } },
        ...catalogDeer.flatMap(deer => [
          { inlineData: { data: deer.referenceImageBase64, mimeType: deer.referenceImageMimeType } }
        ]),
        { text: prompt }
      ]
    }
  ];

  // Try each model in the fallback chain until one succeeds
  let lastError: Error | null = null;

  for (const model of MODEL_FALLBACK_CHAIN) {
    try {
      console.log(`Trying model for comparison: ${model}`);
      const { result: response } = await withRetry(async () => {
        return await ai.models.generateContent({
          model,
          contents,
          config: {
            responseMimeType: "application/json",
            responseSchema: COMPARISON_SCHEMA,
            temperature: 0.1,
          }
        });
      });

      const text = response.text;
      if (!text) {
        throw new Error("Gemini returned empty response");
      }

      // Parse and validate response against schema
      const parsed = JSON.parse(text);
      const validated = comparisonSchema.parse(parsed);

      return validated;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isOverloaded = lastError.message.includes("503") ||
                           lastError.message.includes("overloaded") ||
                           lastError.message.includes("UNAVAILABLE");

      if (isOverloaded && model !== MODEL_FALLBACK_CHAIN[MODEL_FALLBACK_CHAIN.length - 1]) {
        console.log(`Model ${model} overloaded for comparison, trying next fallback...`);
        continue;
      }

      // If not overloaded or last model, throw
      throw new Error(`Gemini deer comparison failed: ${lastError.message}`);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new Error("All Gemini models failed for comparison");
}

/**
 * Validate that Gemini API credentials are configured correctly
 *
 * @returns true if API key is valid, throws error otherwise
 */
export async function validateGeminiClient(): Promise<boolean> {
  const ai = getGeminiClient();

  try {
    // Make a minimal API call to verify credentials
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: "Hello" }] }],
    });

    return !!response.text;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Gemini API validation failed: ${error.message}`);
    }
    throw new Error("Gemini API validation failed");
  }
}

/**
 * Classification result for a cropped deer image
 */
export interface DeerClassificationResult {
  sex: 'buck' | 'doe' | 'fawn' | 'unknown';
  antler_points: number | null;
  antler_description: string | null;
  age_class: 'young' | 'mature' | 'old' | 'unknown';
  confidence: number;
}

/**
 * Result from classifyDeerCrop including metrics
 */
export interface ClassifyDeerResult {
  result: DeerClassificationResult;
  metrics: GeminiMetrics;
}

/**
 * Classify a cropped deer image to determine sex, antler points, etc.
 * Used as second stage after YOLO detection.
 *
 * @param cropBase64 - Base64-encoded cropped deer image
 * @param mimeType - Image MIME type (e.g., "image/jpeg")
 * @returns Classification result with sex, antler info, confidence, and API metrics
 */
export async function classifyDeerCrop(
  cropBase64: string,
  mimeType: string
): Promise<ClassifyDeerResult> {
  const ai = getGeminiClient();
  const startTime = Date.now();

  // Try each model in the fallback chain
  let lastError: Error | null = null;
  let totalRetryCount = 0;
  let wasRateLimited = false;

  for (const model of MODEL_FALLBACK_CHAIN) {
    try {
      const { result: response, retryCount, wasRateLimited: rateLimited } = await withRetry(async () => {
        return await ai.models.generateContent({
          model,
          contents: [
            {
              parts: [
                { inlineData: { data: cropBase64, mimeType } },
                { text: DEER_CLASSIFICATION_PROMPT }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: CLASSIFICATION_SCHEMA,
            temperature: 0.1,
          }
        });
      });

      totalRetryCount += retryCount;
      wasRateLimited = wasRateLimited || rateLimited;
      const durationMs = Date.now() - startTime;

      const text = response.text;
      if (!text) {
        throw new Error("Gemini returned empty response");
      }

      // Parse JSON response
      const parsed = JSON.parse(text);

      // Extract token usage
      const promptTokens = response.usageMetadata?.promptTokenCount ?? 0;
      const responseTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
      const totalTokens = response.usageMetadata?.totalTokenCount ?? 0;

      // Log token usage for classification
      console.log(`Gemini classification token usage:`, {
        promptTokens,
        responseTokens,
        totalTokens,
      });

      // Return result with metrics
      return {
        result: parsed as DeerClassificationResult,
        metrics: {
          promptTokens,
          responseTokens,
          totalTokens,
          modelUsed: model,
          wasRateLimited,
          retryCount: totalRetryCount,
          durationMs,
        }
      };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isOverloaded = lastError.message.includes("503") ||
                           lastError.message.includes("overloaded") ||
                           lastError.message.includes("UNAVAILABLE");

      if (isOverloaded && model !== MODEL_FALLBACK_CHAIN[MODEL_FALLBACK_CHAIN.length - 1]) {
        console.log(`Model ${model} overloaded for classification, trying next fallback...`);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error("All Gemini models failed for classification");
}

/**
 * Result from estimateAntlerScore including metrics
 */
export interface EstimateScoreResult {
  result: ScoreEstimateResult;
  metrics: GeminiMetrics;
}

/**
 * Mid-cost gross-score estimate for a cropped buck (Step 2 of the trophy gate).
 *
 * Cheaper than extractAntlerFingerprint (no Thinking, no per-tine breakdown):
 * a single gross-score number + confidence, used to decide which bucks are
 * worth the expensive fingerprint + re-ID.
 * See docs/adr/0004-trophy-gated-ai-cost-cascade.md.
 */
export async function estimateAntlerScore(
  cropBase64: string,
  mimeType: string
): Promise<EstimateScoreResult> {
  const ai = getGeminiClient();
  const startTime = Date.now();

  let lastError: Error | null = null;
  let totalRetryCount = 0;
  let wasRateLimited = false;

  for (const model of MODEL_FALLBACK_CHAIN) {
    try {
      const { result: response, retryCount, wasRateLimited: rateLimited } = await withRetry(async () => {
        return await ai.models.generateContent({
          model,
          contents: [
            {
              parts: [
                { inlineData: { data: cropBase64, mimeType } },
                { text: SCORE_ESTIMATE_PROMPT }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: SCORE_ESTIMATE_SCHEMA,
            temperature: 0.1,
          }
        });
      });

      totalRetryCount += retryCount;
      wasRateLimited = wasRateLimited || rateLimited;
      const durationMs = Date.now() - startTime;

      const text = response.text;
      if (!text) {
        throw new Error("Gemini returned empty response");
      }

      const parsed = JSON.parse(text);
      const validated = scoreEstimateSchema.parse(parsed);

      const promptTokens = response.usageMetadata?.promptTokenCount ?? 0;
      const responseTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
      const totalTokens = response.usageMetadata?.totalTokenCount ?? 0;

      console.log(`Gemini score-estimate token usage:`, {
        promptTokens,
        responseTokens,
        totalTokens,
      });

      return {
        result: validated,
        metrics: {
          promptTokens,
          responseTokens,
          totalTokens,
          modelUsed: model,
          wasRateLimited,
          retryCount: totalRetryCount,
          durationMs,
        }
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isOverloaded = lastError.message.includes("503") ||
                           lastError.message.includes("overloaded") ||
                           lastError.message.includes("UNAVAILABLE");

      if (isOverloaded && model !== MODEL_FALLBACK_CHAIN[MODEL_FALLBACK_CHAIN.length - 1]) {
        console.log(`Model ${model} overloaded for score estimate, trying next fallback...`);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error("All Gemini models failed for score estimate");
}

/**
 * Analyze a cropped deer image with Gemini's Thinking feature enabled
 *
 * This function uses Gemini 2.5 Flash with the Thinking (Reasoning) capability
 * for more accurate antler point counting. The model internally reasons through
 * the antler structure before providing the final count.
 *
 * @param imageBuffer - Buffer containing the cropped deer image (JPEG)
 * @returns Detailed analysis result with sex, age, antlers, and reasoning trace
 */
export async function analyzeDeer(
  imageBuffer: Buffer
): Promise<DeerAnalysisResult> {
  const ai = getGeminiClient();
  const imageBase64 = imageBuffer.toString("base64");

  let lastError: Error | null = null;

  for (const model of MODEL_FALLBACK_CHAIN) {
    try {
      console.log(`Analyzing deer crop with model: ${model} (Thinking enabled)`);

      const { result: response } = await withRetry(async () => {
        return await ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                { text: DEER_ANALYSIS_PROMPT },
                { inlineData: { data: imageBase64, mimeType: "image/jpeg" } }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: DEER_ANALYSIS_SCHEMA,
            temperature: 0.2,
            thinkingConfig: {
              includeThoughts: false,
              thinkingBudget: 1024
            }
          }
        });
      });

      const text = response.text;
      if (!text) {
        throw new Error("Gemini returned empty response");
      }

      // Parse JSON response
      const parsed = JSON.parse(text);

      // Log token usage including thinking tokens
      if (response.usageMetadata) {
        console.log(`Gemini deer analysis token usage:`, {
          promptTokens: response.usageMetadata.promptTokenCount,
          responseTokens: response.usageMetadata.candidatesTokenCount,
          totalTokens: response.usageMetadata.totalTokenCount,
        });
      }

      // Validate against Zod schema
      const validated = deerAnalysisSchema.parse(parsed);

      console.log(`Deer analysis complete:`, {
        sex: validated.sex,
        age_class: validated.age_class,
        has_antlers: validated.antlers.has_antlers,
        size_class: validated.antlers.size_class,
        estimated_point_range: validated.antlers.estimated_point_range,
        confidence: validated.confidence,
        reasoning: validated.reasoning_trace
      });

      return validated;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isOverloaded = lastError.message.includes("503") ||
                           lastError.message.includes("overloaded") ||
                           lastError.message.includes("UNAVAILABLE");

      if (isOverloaded && model !== MODEL_FALLBACK_CHAIN[MODEL_FALLBACK_CHAIN.length - 1]) {
        console.log(`Model ${model} overloaded for deer analysis, trying next fallback...`);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error("All Gemini models failed for deer analysis");
}

/**
 * Result from extractAntlerFingerprint including metrics
 */
export interface ExtractFingerprintResult {
  result: AntlerFingerprintResult;
  metrics: GeminiMetrics;
}

/**
 * Extract detailed B&C-style antler fingerprint from a trophy buck image
 *
 * This function uses Gemini with Thinking enabled to carefully analyze
 * antler measurements, ratios, and distinctive features for trophy-tier bucks.
 * The resulting fingerprint is used for enhanced deer re-identification.
 *
 * @param imageBuffer - Buffer containing the cropped deer image (JPEG)
 * @returns Detailed antler fingerprint with measurements, scores, ratios, features, and confidence
 */
export async function extractAntlerFingerprint(
  imageBuffer: Buffer
): Promise<ExtractFingerprintResult> {
  const ai = getGeminiClient();
  const imageBase64 = imageBuffer.toString("base64");
  const startTime = Date.now();

  let lastError: Error | null = null;
  let totalRetryCount = 0;
  let wasRateLimited = false;

  for (const model of MODEL_FALLBACK_CHAIN) {
    try {
      console.log(`Extracting antler fingerprint with model: ${model} (Thinking enabled)`);

      const { result: response, retryCount, wasRateLimited: rateLimited } = await withRetry(async () => {
        return await ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                { text: ANTLER_FINGERPRINT_PROMPT },
                { inlineData: { data: imageBase64, mimeType: "image/jpeg" } }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: ANTLER_FINGERPRINT_SCHEMA,
            temperature: 0.1,
            thinkingConfig: {
              includeThoughts: false,
              thinkingBudget: 2048 // Higher budget for detailed measurements
            }
          }
        });
      });

      totalRetryCount += retryCount;
      wasRateLimited = wasRateLimited || rateLimited;
      const durationMs = Date.now() - startTime;

      const text = response.text;
      if (!text) {
        throw new Error("Gemini returned empty response");
      }

      // Parse JSON response
      const parsed = JSON.parse(text);

      // Extract token usage
      const promptTokens = response.usageMetadata?.promptTokenCount ?? 0;
      const responseTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
      const totalTokens = response.usageMetadata?.totalTokenCount ?? 0;
      // Thinking tokens are reported separately and billed at the OUTPUT rate; they
      // are NOT always folded into candidatesTokenCount, so capture them explicitly
      // for accurate cost tracking (see scripts/fingerprint-with-cost.ts).
      const thoughtsTokens = response.usageMetadata?.thoughtsTokenCount ?? 0;

      // Log token usage including thinking tokens
      console.log(`Gemini antler fingerprint token usage:`, {
        promptTokens,
        responseTokens,
        thoughtsTokens,
        totalTokens,
      });

      // Validate against Zod schema
      const validated = antlerFingerprintSchema.parse(parsed);

      console.log(`Antler fingerprint extraction complete:`, {
        score_class: validated.scores.score_class,
        gross_score: validated.scores.gross_score,
        net_score: validated.scores.net_score,
        total_points: validated.measurements.total_points,
        has_drop_tine: validated.features.has_drop_tine,
        overall_confidence: validated.confidence.overall,
      });

      return {
        result: validated,
        metrics: {
          promptTokens,
          responseTokens,
          totalTokens,
          thoughtsTokens,
          modelUsed: model,
          wasRateLimited,
          retryCount: totalRetryCount,
          durationMs,
        }
      };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isOverloaded = lastError.message.includes("503") ||
                           lastError.message.includes("overloaded") ||
                           lastError.message.includes("UNAVAILABLE");

      if (isOverloaded && model !== MODEL_FALLBACK_CHAIN[MODEL_FALLBACK_CHAIN.length - 1]) {
        console.log(`Model ${model} overloaded for fingerprint extraction, trying next fallback...`);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error("All Gemini models failed for fingerprint extraction");
}
