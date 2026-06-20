// @ts-nocheck - Supabase Database generic types not properly resolved in build context
import { task, logger } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzePhoto } from "./analyze-photo";
import { generateImageVariantsJob } from "./generate-image-variants";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import pLimit from "p-limit";

/**
 * Batch Process Job
 *
 * Orchestrates the processing of a batch of uploaded photos by:
 * 1. Updating batch status to 'processing'
 * 2. Triggering individual analyze-photo jobs for each image (fan-out pattern)
 * 3. Tracking progress via batch and session counters
 *
 * This job uses the fan-out pattern to enable parallel processing of images.
 * Each image is processed independently by the analyze-photo job.
 *
 * Called after each chunk (typically 25 files) completes uploading during
 * bulk upload sessions. Supports both legacy single-batch uploads and new
 * multi-batch upload sessions.
 *
 * @module trigger/jobs/batch-process
 */

interface BatchProcessPayload {
  /** ID of the processing_batch record */
  batchId: string;
  /** IDs of uploaded images to process */
  imageIds: string[];
  /** Optional: ID of the parent upload session for progress tracking */
  sessionId?: string;
}

export const batchProcess = task({
  id: "batch-process",
  run: async (payload: BatchProcessPayload) => {
    const { batchId, imageIds, sessionId } = payload;

    logger.info("Starting batch processing", {
      batchId,
      sessionId: sessionId || "none",
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

      // Rate limit job triggering to avoid overwhelming the Trigger.dev API
      // Configurable via TRIGGER_BATCH_RATE environment variable
      const batchRate = parseInt(process.env.TRIGGER_BATCH_RATE || '20', 10);
      const triggerLimit = pLimit(batchRate);

      logger.info("Rate limiting batch triggers", {
        batchId,
        rateLimit: batchRate,
        imageCount: imageIds.length,
      });

      // Use batchTrigger (fire and forget) instead of batchTriggerAndWait
      // This is faster and more reliable - individual jobs update batch counters themselves
      // Apply rate limiting by chunking the triggers
      const chunks: string[][] = [];
      for (let i = 0; i < imageIds.length; i += batchRate) {
        chunks.push(imageIds.slice(i, i + batchRate));
      }

      await Promise.all(
        chunks.map((chunk, index) =>
          triggerLimit(async () => {
            logger.info(`Triggering batch chunk ${index + 1}/${chunks.length}`, {
              batchId,
              chunkSize: chunk.length,
            });

            await analyzePhoto.batchTrigger(
              chunk.map(imageId => ({
                payload: { imageId, batchId, sessionId }
              }))
            );

            // Fan-out variant generation in parallel with analysis. Variants are
            // decoupled from analysis (ADR 0003): the grid gets thumbnails even
            // if Gemini detection fails for an image.
            await generateImageVariantsJob.batchTrigger(
              chunk.map(imageId => ({
                payload: { imageId }
              }))
            );
          })
        )
      );

      logger.info("All analyze-photo jobs triggered", {
        batchId,
        sessionId: sessionId || "none",
        imageCount: imageIds.length,
      });

      // Note: batch status will remain 'processing' - individual jobs update counters
      // The batch will be marked 'completed' when all jobs finish (tracked via counters)
      // Session counters are updated by individual analyze-photo jobs if sessionId provided
      logger.info("Batch fan-out completed - jobs are processing", {
        batchId,
        sessionId: sessionId || "none",
        triggeredJobs: imageIds.length,
      });

      return {
        success: true,
        batchId,
        sessionId: sessionId || null,
        processedImages: imageIds.length,
      };
    } catch (error) {
      // Update batch status to 'failed'
      logger.error("Batch processing failed", {
        batchId,
        sessionId: sessionId || "none",
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
          sessionId: sessionId || "none",
          error: failError.message,
        });
      }

      throw error;
    }
  },
});
