// @ts-nocheck - Supabase Database generic types not properly resolved in build context
import { task, logger } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEmbedding } from "@/lib/replicate/client";
import { cropImageFromUrl, type ROICoordinates } from "@/lib/image/crop";
import { findMatchesTask } from "./find-matches";
import { computeQualityTask } from "./compute-quality";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Regenerate Embedding Job
 *
 * Regenerates the embedding for a detection using the user-defined ROI region.
 * This job:
 * 1. Fetches the image and crops it to the ROI region
 * 2. Uploads the cropped image to temporary storage
 * 3. Generates a new embedding from the cropped image
 * 4. Deletes the old embedding (if any)
 * 5. Stores the new embedding
 * 6. Triggers match finding with the new embedding
 * 7. Triggers quality computation for the detection
 *
 * @module trigger/jobs/regenerate-embedding
 */

interface RegenerateEmbeddingPayload {
  detectionId: string;
  imageId: string;
  roi: {
    x: number;      // 0-10000 normalized
    y: number;      // 0-10000 normalized
    width: number;  // 0-10000 normalized
    height: number; // 0-10000 normalized
  };
}

export const regenerateEmbeddingTask = task({
  id: "regenerate-embedding",
  // Limit concurrent Replicate API calls to avoid rate limiting
  queue: {
    concurrencyLimit: 5,
  },
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload: RegenerateEmbeddingPayload) => {
    const { detectionId, imageId, roi } = payload;

    logger.info("Starting embedding regeneration from ROI", {
      detectionId,
      imageId,
      roi,
    });

    const supabase = createAdminClient() as SupabaseClient<Database>;

    try {
      // Step 1: Fetch image record to get file_path
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

      // Step 2: Generate signed URL for the original image
      logger.info("Generating signed URL", { imageId });

      const { data: signedUrlData, error: signedUrlError } =
        await supabase.storage
          .from("photos")
          .createSignedUrl(imageRecord.file_path, 3600);

      if (signedUrlError || !signedUrlData) {
        logger.error("Failed to generate signed URL", {
          imageId,
          error: signedUrlError?.message || "No signed URL returned",
        });
        throw new Error(
          `Failed to generate signed URL: ${signedUrlError?.message || "Unknown error"}`
        );
      }

      const originalImageUrl = signedUrlData.signedUrl;
      logger.info("Signed URL generated", { imageId });

      // Step 3: Crop the image to the ROI region
      logger.info("Cropping image to ROI", {
        detectionId,
        roi,
      });

      const roiCoordinates: ROICoordinates = {
        x: roi.x,
        y: roi.y,
        width: roi.width,
        height: roi.height,
      };

      const croppedImageBuffer = await cropImageFromUrl(
        originalImageUrl,
        roiCoordinates
      );

      logger.info("Image cropped successfully", {
        detectionId,
        croppedSize: croppedImageBuffer.length,
      });

      // Step 4: Upload cropped image to temporary storage
      const tempPath = `temp/${imageRecord.user_id}/roi_${detectionId}_${Date.now()}.jpg`;

      logger.info("Uploading cropped image", { tempPath });

      const { error: uploadError } = await supabase.storage
        .from("photos")
        .upload(tempPath, croppedImageBuffer, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError) {
        logger.error("Failed to upload cropped image", {
          error: uploadError.message,
        });
        throw new Error(`Failed to upload cropped image: ${uploadError.message}`);
      }

      // Get signed URL for cropped image
      const { data: croppedUrlData, error: croppedUrlError } =
        await supabase.storage
          .from("photos")
          .createSignedUrl(tempPath, 3600);

      if (croppedUrlError || !croppedUrlData) {
        throw new Error("Failed to get signed URL for cropped image");
      }

      logger.info("Cropped image uploaded", { tempPath });

      // Step 5: Generate embedding from cropped image
      logger.info("Calling embedding model", { detectionId });

      const embeddingVector = await generateEmbedding(croppedUrlData.signedUrl);

      logger.info("Embedding generated", {
        detectionId,
        embeddingDimension: embeddingVector.length,
      });

      // Step 6: Delete old embedding (if any)
      logger.info("Deleting old embedding", { detectionId });

      const { error: deleteError } = await supabase
        .from("deer_embeddings")
        .delete()
        .eq("detection_id", detectionId);

      if (deleteError) {
        logger.warn("Failed to delete old embedding (may not exist)", {
          detectionId,
          error: deleteError.message,
        });
        // Continue anyway - embedding may not have existed
      }

      // Step 7: Store new embedding
      logger.info("Storing new embedding", { detectionId });

      const { data: embeddingRecord, error: insertError } = await supabase
        .from("deer_embeddings")
        .insert({
          detection_id: detectionId,
          deer_id: null, // Orphaned - will be linked during matching
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

      // Step 8: Clean up temporary file
      try {
        await supabase.storage.from("photos").remove([tempPath]);
        logger.info("Temporary file cleaned up", { tempPath });
      } catch (cleanupError) {
        logger.warn("Failed to clean up temporary file", {
          tempPath,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
        // Don't fail the job for cleanup errors
      }

      // Step 9: Trigger match finding
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
        // Don't throw - embedding regeneration succeeded
      }

      // Step 10: Trigger quality computation
      logger.info("Triggering quality computation", { detectionId, userId: imageRecord.user_id });

      try {
        await computeQualityTask.trigger({
          detectionId,
          userId: imageRecord.user_id,
        });
        logger.info("Quality computation triggered", { detectionId });
      } catch (triggerError) {
        logger.warn("Failed to trigger quality computation", {
          detectionId,
          error: triggerError instanceof Error ? triggerError.message : String(triggerError),
        });
        // Don't throw - embedding regeneration succeeded
      }

      logger.info("Embedding regeneration completed successfully", {
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
      logger.error("Embedding regeneration failed", {
        detectionId,
        imageId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  },
});
