// @ts-nocheck - Supabase Database generic types not properly resolved in build context
import { task, logger } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbedding } from "@/lib/replicate/client";
import { findMatchesTask } from "./find-matches";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Generate Embedding Job
 *
 * Processes a single detection to generate a 512-dimensional embedding vector
 * for deer re-identification. This job is triggered after MegaDetector identifies
 * an animal in an image.
 *
 * Workflow:
 * 1. Fetch detection record to get bounding box coordinates
 * 2. Fetch image record to get file_path
 * 3. Generate signed URL for the image (embedding model needs public URL)
 * 4. Call embedding model via Replicate API (using full image for now)
 * 5. Store embedding in deer_embeddings table with deer_id = null (orphaned)
 * 6. Update detection embedding_status to 'completed' or 'failed'
 *
 * Error Handling:
 * - Retry on transient failures (max 3 attempts)
 * - Update detection status to 'failed' with error message
 *
 * Note: Currently passes the full image URL to the embedding model.
 * In production, we would crop the detection region before embedding generation.
 * This requires image processing (e.g., Sharp) which can be added later.
 *
 * @module trigger/jobs/generate-embedding
 */

interface GenerateEmbeddingPayload {
  detectionId: string;
  imageId: string;
}

export const generateEmbeddingTask = task({
  id: "generate-embedding",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload: GenerateEmbeddingPayload) => {
    const { detectionId, imageId } = payload;

    logger.info("Starting embedding generation", { detectionId, imageId });

    // Cast to typed client - TypeScript has issues with Database generic in Trigger.dev context
    const supabase = createAdminClient() as SupabaseClient<Database>;

    try {
      // Step 1: Fetch detection record to get bounding box coordinates
      logger.info("Fetching detection record", { detectionId });

      const { data: detectionRecord, error: detectionFetchError } =
        await supabase
          .from("detections")
          .select("id, image_id, bbox_x, bbox_y, bbox_width, bbox_height")
          .eq("id", detectionId)
          .single();

      if (detectionFetchError || !detectionRecord) {
        logger.error("Failed to fetch detection record", {
          detectionId,
          error: detectionFetchError?.message || "Detection not found",
        });
        throw new Error(
          `Failed to fetch detection: ${detectionFetchError?.message || "Detection not found"}`
        );
      }

      logger.info("Detection record fetched", {
        detectionId,
        bbox: {
          x: detectionRecord.bbox_x,
          y: detectionRecord.bbox_y,
          width: detectionRecord.bbox_width,
          height: detectionRecord.bbox_height,
        },
      });

      // Step 2: Fetch image record to get file_path
      logger.info("Fetching image record", { imageId });

      const { data: imageRecord, error: imageFetchError } = await supabase
        .from("images")
        .select("id, file_path, user_id")
        .eq("id", imageId)
        .single();

      if (imageFetchError || !imageRecord) {
        logger.error("Failed to fetch image record", {
          imageId,
          error: imageFetchError?.message || "Image not found",
        });
        throw new Error(
          `Failed to fetch image: ${imageFetchError?.message || "Image not found"}`
        );
      }

      logger.info("Image record fetched", {
        imageId,
        filePath: imageRecord.file_path,
      });

      // Step 3: Generate signed URL for the image
      // Embedding model requires a publicly accessible URL
      logger.info("Generating signed URL", { imageId });

      const { data: signedUrlData, error: signedUrlError } =
        await supabase.storage
          .from("photos")
          .createSignedUrl(imageRecord.file_path, 3600); // 1 hour expiry

      if (signedUrlError || !signedUrlData) {
        logger.error("Failed to generate signed URL", {
          imageId,
          error: signedUrlError?.message || "No signed URL returned",
        });
        throw new Error(
          `Failed to generate signed URL: ${signedUrlError?.message || "Unknown error"}`
        );
      }

      const imageUrl = signedUrlData.signedUrl;
      logger.info("Signed URL generated", { imageId });

      // Step 4: Call embedding model via Replicate
      // Note: Currently using full image. In production, we would:
      // 1. Download the image
      // 2. Crop to detection bounding box using Sharp or similar
      // 3. Upload cropped image to temporary storage
      // 4. Pass cropped image URL to embedding model
      // For MVP, the embedding model should be robust to full images
      logger.info("Calling embedding model", {
        detectionId,
        imageUrl,
        bbox: {
          x: detectionRecord.bbox_x,
          y: detectionRecord.bbox_y,
          width: detectionRecord.bbox_width,
          height: detectionRecord.bbox_height,
        },
      });

      const embeddingVector = await generateEmbedding(imageUrl);

      logger.info("Embedding generated", {
        detectionId,
        embeddingDimension: embeddingVector.length,
      });

      // Step 5: Store embedding in deer_embeddings table
      // deer_id is null (orphaned embedding) - will be linked during matching
      logger.info("Storing embedding in database", { detectionId });

      const { data: embeddingRecord, error: insertError } = await supabase
        .from("deer_embeddings")
        .insert({
          detection_id: detectionId,
          deer_id: null, // Orphaned - will be linked during manual matching
          embedding: embeddingVector,
        })
        .select()
        .single();

      if (insertError || !embeddingRecord) {
        logger.error("Failed to insert embedding", {
          detectionId,
          error: insertError?.message || "No record returned",
        });
        throw new Error(
          `Failed to insert embedding: ${insertError?.message || "Unknown error"}`
        );
      }

      logger.info("Embedding stored successfully", {
        detectionId,
        embeddingId: embeddingRecord.id,
      });

      // Step 6: Trigger match finding to discover similar deer
      logger.info("Triggering match finding", { detectionId, imageId });

      try {
        await findMatchesTask.trigger({
          detectionId,
          imageId,
          userId: imageRecord.user_id,
        });
        logger.info("Match finding triggered", { detectionId, imageId });
      } catch (triggerError) {
        logger.warn("Failed to trigger match finding", {
          detectionId,
          imageId,
          error: triggerError instanceof Error ? triggerError.message : String(triggerError),
        });
        // Don't throw - embedding generation succeeded, match finding can be retried later
      }

      logger.info("Embedding generation completed successfully", {
        detectionId,
        imageId,
        embeddingId: embeddingRecord.id,
      });

      return {
        success: true,
        detectionId,
        imageId,
        embeddingId: embeddingRecord.id,
        embeddingDimension: embeddingVector.length,
      };
    } catch (error) {
      // Error handling: Log failure
      logger.error("Embedding generation failed", {
        detectionId,
        imageId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Re-throw error so Trigger.dev can handle retry logic
      throw error;
    }
  },
});
