// @ts-nocheck - Supabase Database generic types not properly resolved in build context
import { task, logger } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzePhoto } from "./analyze-photo";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Batch Process Job
 *
 * Orchestrates the processing of a batch of images by:
 * 1. Updating batch status to 'processing'
 * 2. Triggering individual analyze-photo jobs for each image (fan-out pattern)
 * 3. Updating batch status to 'completed' or 'failed'
 *
 * This job uses the fan-out pattern to enable parallel processing of images.
 * Each image is processed independently by the analyze-photo job.
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

      // Fan-out: Trigger analyze-photo job for each image using Gemini pipeline
      logger.info("Fan-out: triggering analyze-photo jobs", {
        batchId,
        imageCount: imageIds.length,
      });

      // Use batchTrigger (fire and forget) instead of batchTriggerAndWait
      // This is faster and more reliable - individual jobs update batch counters themselves
      await analyzePhoto.batchTrigger(
        imageIds.map(imageId => ({ payload: { imageId, batchId } }))
      );

      logger.info("All analyze-photo jobs triggered", {
        batchId,
        imageCount: imageIds.length,
      });

      // Note: batch status will remain 'processing' - individual jobs update counters
      // The batch will be marked 'completed' when all jobs finish (tracked via counters)
      logger.info("Batch fan-out completed - jobs are processing", {
        batchId,
        triggeredJobs: imageIds.length,
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
