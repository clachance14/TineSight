// @ts-nocheck - Supabase Database generic types not properly resolved in build context
import { task, logger } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractAntlerFingerprint } from "@/lib/gemini/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Generate Antler Fingerprint Job
 *
 * Processes a single deer detection crop to extract a detailed B&C-style antler fingerprint
 * using Gemini's advanced reasoning capabilities (Thinking feature).
 *
 * This is a separate job from analyze-photo to enable:
 * 1. Selective processing - only called for trophy-tier bucks (score_class: typical, potential_trophy, trophy)
 * 2. Lower concurrency - expensive operation with higher token usage
 * 3. Independent scaling - can be triggered on-demand or in batches
 *
 * Workflow:
 * 1. Fetch detection record to get crop_file_path
 * 2. Generate signed URL for crop image
 * 3. Download crop image as buffer
 * 4. Call extractAntlerFingerprint() with Gemini Thinking enabled
 * 5. Save fingerprint JSONB to detections.antler_fingerprint
 * 6. Log metrics (tokens, duration, model used)
 * 7. Return success with score_class and confidence
 *
 * Error Handling:
 * - Retry on transient Gemini API failures (max 3 attempts)
 * - Don't fail entire batch if one fingerprint extraction fails
 * - Log detailed error information for debugging
 * - Return { success: false, error: message } on failure
 *
 * @module trigger/jobs/generate-fingerprint
 */

interface GenerateFingerprintPayload {
  detectionId: string;
  userId: string;
}

export const generateFingerprint = task({
  id: "generate-fingerprint",
  // Lower concurrency for expensive operation with Thinking enabled
  // Gemini Thinking uses ~2x token budget, so we limit parallelism
  queue: {
    concurrencyLimit: 10,
  },
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000, // Longer timeout for Thinking-enabled calls
  },
  run: async (payload: GenerateFingerprintPayload) => {
    const { detectionId, userId } = payload;

    logger.info("Starting antler fingerprint generation", { detectionId, userId });

    // Cast to typed client - TypeScript has issues with Database generic in Trigger.dev context
    const supabase = createAdminClient() as SupabaseClient<Database>;

    try {
      // Step 1: Fetch detection record to get crop_file_path
      logger.info("Fetching detection record", { detectionId });

      const { data: detection, error: fetchError } = await supabase
        .from("detections")
        .select("id, image_id, crop_file_path, size_class, estimated_point_range")
        .eq("id", detectionId)
        .single();

      if (fetchError || !detection) {
        logger.error("Failed to fetch detection record", {
          detectionId,
          error: fetchError?.message || "Detection not found",
        });
        return {
          success: false,
          detectionId,
          error: fetchError?.message || "Detection not found",
        };
      }

      if (!detection.crop_file_path) {
        logger.error("Detection has no crop_file_path", { detectionId });
        return {
          success: false,
          detectionId,
          error: "No crop image available",
        };
      }

      logger.info("Detection record fetched", {
        detectionId,
        imageId: detection.image_id,
        cropPath: detection.crop_file_path,
        sizeClass: detection.size_class,
        estimatedPoints: detection.estimated_point_range,
      });

      // Step 2: Generate signed URL for crop image
      logger.info("Generating signed URL for crop", { detectionId });

      const { data: signedUrlData, error: signedUrlError } =
        await supabase.storage
          .from("photos")
          .createSignedUrl(detection.crop_file_path, 3600); // 1 hour expiry

      if (signedUrlError || !signedUrlData) {
        logger.error("Failed to generate signed URL for crop", {
          detectionId,
          error: signedUrlError?.message || "No signed URL returned",
        });
        return {
          success: false,
          detectionId,
          error: `Failed to generate signed URL: ${signedUrlError?.message || "Unknown error"}`,
        };
      }

      const cropUrl = signedUrlData.signedUrl;
      logger.info("Signed URL generated for crop", { detectionId });

      // Step 3: Download crop image as buffer
      logger.info("Downloading crop image", { detectionId, cropUrl });

      const cropResponse = await fetch(cropUrl);
      if (!cropResponse.ok) {
        logger.error("Failed to download crop image", {
          detectionId,
          status: cropResponse.status,
          statusText: cropResponse.statusText,
        });
        return {
          success: false,
          detectionId,
          error: `Failed to download crop: ${cropResponse.status} ${cropResponse.statusText}`,
        };
      }

      const cropArrayBuffer = await cropResponse.arrayBuffer();
      const cropBuffer = Buffer.from(cropArrayBuffer);

      logger.info("Crop image downloaded", {
        detectionId,
        sizeBytes: cropBuffer.byteLength,
      });

      // Step 4: Call extractAntlerFingerprint() with Gemini Thinking enabled
      logger.info("Calling Gemini to extract antler fingerprint (Thinking enabled)", {
        detectionId,
      });

      const { result: fingerprint, metrics } = await extractAntlerFingerprint(cropBuffer);

      logger.info("Antler fingerprint extraction completed", {
        detectionId,
        model: metrics.modelUsed,
        scoreClass: fingerprint.scores.score_class,
        grossScore: fingerprint.scores.gross_score,
        netScore: fingerprint.scores.net_score,
        totalPoints: fingerprint.measurements.total_points,
        overallConfidence: fingerprint.confidence.overall,
        tokenUsage: metrics.totalTokens,
        durationMs: metrics.durationMs,
        wasRateLimited: metrics.wasRateLimited,
        retryCount: metrics.retryCount,
      });

      // Step 5: Save fingerprint to detections.antler_fingerprint (JSONB column)
      logger.info("Saving antler fingerprint to database", { detectionId });

      const { error: updateError } = await supabase
        .from("detections")
        .update({
          antler_fingerprint: fingerprint as any, // JSONB column
        })
        .eq("id", detectionId);

      if (updateError) {
        logger.error("Failed to save antler fingerprint", {
          detectionId,
          error: updateError.message,
        });
        return {
          success: false,
          detectionId,
          error: `Failed to save fingerprint: ${updateError.message}`,
        };
      }

      logger.info("Antler fingerprint saved successfully", { detectionId });

      // Step 6: Return success with key fingerprint details
      return {
        success: true,
        detectionId,
        imageId: detection.image_id,
        scoreClass: fingerprint.scores.score_class,
        grossScore: fingerprint.scores.gross_score,
        netScore: fingerprint.scores.net_score,
        totalPoints: fingerprint.measurements.total_points,
        confidence: fingerprint.confidence.overall,
        tokenUsage: metrics.totalTokens,
        durationMs: metrics.durationMs,
        modelUsed: metrics.modelUsed,
      };

    } catch (error) {
      // Error handling: Log detailed error and return failure
      logger.error("Antler fingerprint generation failed", {
        detectionId,
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Don't throw - we want to return graceful failure for batch processing
      return {
        success: false,
        detectionId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
