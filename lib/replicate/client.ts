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

// Model version configuration
const MEGADETECTOR_VERSION = process.env['MEGADETECTOR_MODEL_VERSION'] ||
  'latest'; // Will be updated with actual deployed model version

const EMBEDDING_MODEL_VERSION = process.env['EMBEDDING_MODEL_VERSION'] ||
  'latest'; // Will be updated with MegaDescriptor or CLIP model version

/**
 * Detection result from MegaDetector
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
 * MegaDetector output structure
 */
export interface MegaDetectorOutput {
  /** Array of detected objects */
  detections: Detection[];
  /** Processing metadata */
  info: {
    /** Model version used */
    detector: string;
    /** Image dimensions */
    image_dimensions: [number, number];
  };
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
  try {
    const output = await getReplicateClient().run(
      MEGADETECTOR_VERSION as `${string}/${string}:${string}`,
      {
        input: {
          image: imageUrl,
          // MegaDetector standard parameters
          confidence_threshold: 0.1, // Low threshold, we filter server-side
          render_boxes: false, // We render boxes client-side
        },
      }
    );

    // Validate output structure
    if (!output || typeof output !== 'object') {
      throw new Error('Invalid MegaDetector output: expected object');
    }

    const result = output as MegaDetectorOutput;

    if (!Array.isArray(result.detections)) {
      throw new Error('Invalid MegaDetector output: missing detections array');
    }

    return result;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`MegaDetector failed: ${error.message}`);
    }
    throw new Error('MegaDetector failed: unknown error');
  }
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
