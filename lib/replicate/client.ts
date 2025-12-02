/**
 * Replicate API Client Wrapper
 *
 * Provides typed interfaces for MegaDetector (deer detection) and embedding models.
 * Used by Trigger.dev jobs for AI inference.
 */

import Replicate from 'replicate';

// Initialize Replicate client lazily to avoid throwing at module load
let replicateInstance: Replicate | null = null;

function getReplicateClient(): Replicate {
  if (!replicateInstance) {
    const token = process.env['REPLICATE_API_TOKEN'];
    if (!token) {
      throw new Error('REPLICATE_API_TOKEN is not set in environment variables');
    }
    replicateInstance = new Replicate({ auth: token });
  }
  return replicateInstance;
}

export { getReplicateClient as replicate };

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry configuration for rate-limited requests
 */
const RETRY_CONFIG = {
  maxRetries: 5,
  baseDelayMs: 5000, // 5 seconds base delay
  maxDelayMs: 30000, // 30 seconds max delay
};

// Model version configuration
const MEGADETECTOR_VERSION = process.env['MEGADETECTOR_MODEL_VERSION'] ||
  'bencevans/megadetector-v5a:cd30d71e39a456a2b43580b03c199bb305200e7c62b0054d8c9014c4e11e7259';

const EMBEDDING_MODEL_VERSION = process.env['EMBEDDING_MODEL_VERSION'] ||
  'latest'; // Will be updated with MegaDescriptor or CLIP model version

/**
 * Raw detection result from MegaDetector API
 */
interface RawDetection {
  /** Bounding box coordinates [x1, y1, x2, y2] normalized to [0, 1] */
  bbox: number[];
  /** Detection class: 1=animal, 2=person, 3=vehicle */
  category: number;
  /** Confidence score [0, 1] */
  conf: number;
}

/** Category mapping for MegaDetector */
const CATEGORY_MAP: Record<number, string> = {
  1: 'animal',
  2: 'person',
  3: 'vehicle',
};

/**
 * Detection result from MegaDetector (normalized)
 */
export interface Detection {
  /** Bounding box coordinates [x, y, width, height] normalized to [0, 1] */
  bbox: [number, number, number, number];
  /** Detection class (animal, person, vehicle) */
  category: string;
  /** Confidence score [0, 1] */
  conf: number;
}

/**
 * MegaDetector output structure (normalized)
 */
export interface MegaDetectorOutput {
  /** Array of detected objects */
  detections: Detection[];
}

/**
 * Embedding model output structure
 */
export interface EmbeddingOutput {
  /** 512-dimensional feature vector */
  embedding: number[];
}

/**
 * Run MegaDetector on an image to detect wildlife
 *
 * @param imageUrl - Public URL to the image file
 * @returns Detection results with bounding boxes and confidence scores
 * @throws Error if API call fails or returns invalid data
 */
export async function runMegaDetector(imageUrl: string): Promise<MegaDetectorOutput> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const output = await getReplicateClient().run(
        MEGADETECTOR_VERSION as `${string}/${string}:${string}`,
        {
          input: {
            image: imageUrl,
            conf: 0.1, // Low threshold, we filter server-side
          },
        }
      );

      // API returns array of detections directly
      if (!Array.isArray(output)) {
        throw new Error('Invalid MegaDetector output: expected array');
      }

      const rawDetections = output as RawDetection[];

      // Normalize detections: convert category integers to strings and bbox format
      const detections: Detection[] = rawDetections.map((raw) => {
        // Convert x1,y1,x2,y2 to x,y,width,height if needed
        const bbox = raw.bbox;
        const normalizedBbox: [number, number, number, number] = bbox.length === 4
          ? [bbox[0] ?? 0, bbox[1] ?? 0, bbox[2] ?? 0, bbox[3] ?? 0]
          : [0, 0, 0, 0];

        return {
          bbox: normalizedBbox,
          category: CATEGORY_MAP[raw.category] ?? `unknown-${raw.category}`,
          conf: raw.conf,
        };
      });

      return { detections };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('unknown error');

      // Check if it's a rate limit error (429)
      const errorMessage = lastError.message;
      const isRateLimited = errorMessage.includes('429') ||
                           errorMessage.includes('Too Many Requests') ||
                           errorMessage.includes('rate limit');

      if (isRateLimited && attempt < RETRY_CONFIG.maxRetries - 1) {
        // Extract retry_after from error message if available
        const retryAfterMatch = errorMessage.match(/retry_after["\s:]+(\d+)/);
        const retryAfter = retryAfterMatch ? parseInt(retryAfterMatch[1], 10) * 1000 : null;

        // Calculate delay with exponential backoff
        const exponentialDelay = Math.min(
          RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt),
          RETRY_CONFIG.maxDelayMs
        );

        // Use the larger of retry_after or exponential backoff
        const delay = retryAfter ? Math.max(retryAfter, exponentialDelay) : exponentialDelay;

        console.log(`Rate limited. Retry ${attempt + 1}/${RETRY_CONFIG.maxRetries} after ${delay}ms`);
        await sleep(delay);
        continue;
      }

      // Non-rate-limit error or max retries exceeded
      break;
    }
  }

  throw new Error(`MegaDetector failed: ${lastError?.message || 'unknown error'}`);
}

/**
 * Generate embedding vector for deer re-identification
 *
 * @param imageUrl - Public URL to the cropped deer image (from bounding box)
 * @returns 512-dimensional embedding vector
 * @throws Error if API call fails or returns invalid data
 */
export async function generateEmbedding(imageUrl: string): Promise<number[]> {
  try {
    const output = await getReplicateClient().run(
      EMBEDDING_MODEL_VERSION as `${string}/${string}:${string}`,
      {
        input: {
          image: imageUrl,
          // Model-specific parameters will be added when model is deployed
        },
      }
    );

    // Validate output structure
    if (!output || typeof output !== 'object') {
      throw new Error('Invalid embedding output: expected object');
    }

    const result = output as EmbeddingOutput;

    if (!Array.isArray(result.embedding)) {
      throw new Error('Invalid embedding output: missing embedding array');
    }

    if (result.embedding.length !== 512) {
      throw new Error(
        `Invalid embedding dimension: expected 512, got ${result.embedding.length}`
      );
    }

    // Validate all values are numbers
    if (!result.embedding.every((v) => typeof v === 'number' && !isNaN(v))) {
      throw new Error('Invalid embedding output: contains non-numeric values');
    }

    return result.embedding;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
    throw new Error('Embedding generation failed: unknown error');
  }
}

/**
 * Format embedding array for PostgreSQL vector type
 *
 * @param embedding - 512-dimensional number array
 * @returns Formatted string for pgvector (e.g., "[0.1, 0.2, ...]")
 */
export function formatEmbeddingForPostgres(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
