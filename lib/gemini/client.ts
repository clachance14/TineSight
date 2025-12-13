import { GoogleGenAI } from "@google/genai";
import { zodToJsonSchema } from "zod-to-json-schema";
import { analysisSchema, comparisonSchema, type AnalysisResult, type ComparisonResult } from "./types";
import { PHOTO_ANALYSIS_PROMPT, buildComparisonPromptWithCatalog } from "./prompts";

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
 * Parse a detection string into a structured object
 * Handles Gemini's inconsistent output formats like:
 * - "box_2d: [350,614,793,829], species: whitetail, sex: buck, ..."
 */
function parseDetectionString(str: string): Record<string, unknown> | null {
  try {
    const result: Record<string, unknown> = {};

    // Match patterns for simplified detection format
    const patterns = [
      { key: 'box_2d', regex: /box_2d:\s*\[([^\]]+)\]/i },
      { key: 'species', regex: /species:\s*"?(\w+)"?/i },
      { key: 'sex', regex: /sex:\s*"?(\w+)"?/i },
      { key: 'antler_points', regex: /antler_points:\s*(\d+|null)/i },
      { key: 'confidence', regex: /confidence:\s*(\d+)/i },
    ];

    for (const { key, regex } of patterns) {
      const match = str.match(regex);
      if (match && match[1]) {
        if (key === 'box_2d') {
          const nums = match[1].split(',').map(n => parseInt(n.trim(), 10));
          if (nums.length === 4 && nums.every(n => !isNaN(n))) {
            result[key] = nums as [number, number, number, number];
          }
        } else if (key === 'antler_points') {
          result[key] = match[1] === 'null' ? null : parseInt(match[1], 10);
        } else if (key === 'confidence') {
          result[key] = parseInt(match[1], 10);
        } else {
          result[key] = match[1].toLowerCase();
        }
      }
    }

    // Validate we have box_2d
    if (!result['box_2d']) {
      return null;
    }

    // Set defaults for missing required fields
    if (!result['species']) result['species'] = 'unknown';
    if (!result['sex']) result['sex'] = 'unknown';
    if (result['antler_points'] === undefined) result['antler_points'] = null;
    if (result['confidence'] === undefined) result['confidence'] = 50;

    return result;
  } catch {
    console.warn('Failed to parse detection string:', str);
    return null;
  }
}

/**
 * Group individual field strings into detection objects
 * Handles case where Gemini returns each field as a separate array element
 */
function groupDetectionStrings(detections: unknown[]): unknown[] {
  if (detections.length === 0) return [];

  const firstStr = detections[0];
  if (typeof firstStr !== 'string') return detections;

  // If first string contains multiple fields (comma-separated values), parse each string individually
  if (firstStr.includes(',') && firstStr.includes('box_2d')) {
    return detections.map(d => typeof d === 'string' ? parseDetectionString(d) : d).filter(Boolean);
  }

  // Otherwise, group every 5 strings into one detection
  // (box_2d, species, sex, antler_points, confidence)
  const grouped: unknown[] = [];
  const fieldsPerDetection = 5;

  for (let i = 0; i < detections.length; i += fieldsPerDetection) {
    const chunk = detections.slice(i, i + fieldsPerDetection);
    const combined = chunk.filter(s => typeof s === 'string').join(', ');
    const parsed = parseDetectionString(combined);
    if (parsed) {
      grouped.push(parsed);
    }
  }

  return grouped;
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
 * Model fallback chain - try these in order if primary is overloaded
 */
const MODEL_FALLBACK_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

/**
 * Exponential backoff retry wrapper
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  attemptNumber: number = 1
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (attemptNumber >= RETRY_CONFIG.maxAttempts) {
      throw error;
    }

    // Check if error is retryable (rate limit, network error, etc.)
    const isRetryable =
      error instanceof Error &&
      (error.message.includes("rate limit") ||
       error.message.includes("timeout") ||
       error.message.includes("network") ||
       error.message.includes("503") ||
       error.message.includes("429"));

    if (!isRetryable) {
      throw error;
    }

    // Calculate delay with exponential backoff
    const delay = RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attemptNumber - 1);

    console.log(`Retry attempt ${attemptNumber}/${RETRY_CONFIG.maxAttempts} after ${delay}ms delay`);
    await new Promise(resolve => setTimeout(resolve, delay));

    return withRetry(fn, attemptNumber + 1);
  }
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
      const result = await withRetry(async () => {
        const response = await ai.models.generateContent({
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
            // Use JSON response mode WITHOUT responseJsonSchema
            // Google's bounding box detection works better with prompt-specified format
            // See: https://ai.google.dev/gemini-api/docs/image-understanding
            responseMimeType: "application/json",
          }
        });
        return response;
      });

      // If we get here, the model worked - process the response
      const text = result.text;
      if (!text) {
        throw new Error("Gemini returned empty response");
      }

      // Parse and validate response against schema
      const parsed = JSON.parse(text);

      // Debug: Log raw Gemini response
      console.log(`Gemini (${model}) raw response:`, JSON.stringify(parsed, null, 2));

      // Clean up Gemini response quirks before validation
      // Gemini sometimes returns detections as strings or nulls instead of objects
      if (parsed.detections && Array.isArray(parsed.detections)) {
        const originalCount = parsed.detections.length;

        // First, check if we need to group individual field strings into detection objects
        // This handles the case where Gemini returns ["box_2d: [1,2,3,4]", "species: whitetail", ...]
        const hasStringFields = parsed.detections.some(
          (d: unknown) => typeof d === 'string' && /^(box_2d|head_bbox|species|sex|antler_points|age_class|distinguishing_features|confidence):/i.test(d as string)
        );

        if (hasStringFields) {
          parsed.detections = groupDetectionStrings(parsed.detections);
        } else {
          // Filter out nulls and non-objects, attempt to parse strings
          parsed.detections = parsed.detections
            .filter((d: unknown) => d !== null && d !== undefined)
            .map((d: unknown) => {
              // If already an object with expected properties, use as-is
              if (typeof d === 'object' && d !== null && 'box_2d' in d) {
                return d;
              }
              // If it's a string, try to parse it (Gemini sometimes returns "key: value" format)
              if (typeof d === 'string') {
                return parseDetectionString(d);
              }
              return null;
            })
            .filter((d: unknown) => d !== null && typeof d === 'object' && 'box_2d' in d);
        }

        console.log(`Filtered detections: ${originalCount} -> ${parsed.detections.length}`);
      }

      // Provide defaults for optional top-level fields if missing
      if (parsed.image_quality_score === undefined) {
        parsed.image_quality_score = 50; // Default to medium quality
      }
      if (parsed.analysis_notes === undefined) {
        parsed.analysis_notes = "";
      }

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
      const response = await withRetry(async () => {
        return await ai.models.generateContent({
          model,
          contents,
          config: {
            responseMimeType: "application/json",
            responseJsonSchema: zodToJsonSchema(comparisonSchema as any) as any,
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
