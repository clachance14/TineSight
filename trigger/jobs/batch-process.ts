// @ts-nocheck - Supabase Database generic types not properly resolved in build context
import { task, logger } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectAnimals } from "./detect-animals";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Batch Process Job
 *
 * Orchestrates the processing of a batch of images by:
 * 1. Updating batch status to 'processing'
 * 2. Triggering individual detect-animals jobs for each image (fan-out pattern)
 * 3. Updating batch status to 'completed' or 'failed'
 *
 * This job uses the fan-out pattern to enable parallel processing of images.
 * Each image is processed independently by the detect-animals job.
 *
 * @module trigger/jobs/batch-process
 */

interface BatchProcessPayload {
  batchId: string;
  imageIds: string[];
}

export const batchProcess = task({
  id: "batch-process",
  run: async (payload: BatchProcessPayload) => {
    const { batchId, imageIds } = payload;

    logger.info("Starting batch processing", {
      batchId,
      imageCount: imageIds.length,
    });

    // Cast to typed client - TypeScript has issues with Database generic in Trigger.dev context
    const supabase = createAdminClient() as SupabaseClient<Database>;

    try {
      // Update batch status to 'processing'
      logger.info("Updating batch status to processing", { batchId });
      const { error: updateError } = await supabase
        .from("processing_batches")
        .update({
          status: "processing",
        })
        .eq("id", batchId);

      if (updateError) {
        logger.error("Failed to update batch status", {
          batchId,
          error: updateError.message,
        });
        throw new Error(`Failed to update batch status: ${updateError.message}`);
      }

      logger.info("Batch status updated to processing", { batchId });

      // Fan-out: Trigger detect-animals job for each image
      logger.info("Fan-out: triggering detect-animals jobs", {
        batchId,
        imageCount: imageIds.length,
      });

      for (const imageId of imageIds) {
        await detectAnimals.trigger({ imageId, batchId });
        logger.info("Triggered detect-animals job", {
          imageId,
          batchId,
        });
      }

      // Update batch status to 'completed'
      logger.info("All image jobs triggered, updating batch to completed", {
        batchId,
      });

      const { error: completeError } = await supabase
        .from("processing_batches")
        .update({
          status: "completed",
        })
        .eq("id", batchId);

      if (completeError) {
        logger.error("Failed to mark batch as completed", {
          batchId,
          error: completeError.message,
        });
        throw new Error(`Failed to complete batch: ${completeError.message}`);
      }

      logger.info("Batch processing completed successfully", {
        batchId,
        processedImages: imageIds.length,
      });

      return {
        success: true,
        batchId,
        processedImages: imageIds.length,
      };
    } catch (error) {
      // Update batch status to 'failed'
      logger.error("Batch processing failed", {
        batchId,
        error: error instanceof Error ? error.message : String(error),
      });

      const { error: failError } = await supabase
        .from("processing_batches")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : String(error),
        })
        .eq("id", batchId);

      if (failError) {
        logger.error("Failed to mark batch as failed", {
          batchId,
          error: failError.message,
        });
      }

      throw error;
    }
  },
});
