// @ts-nocheck - Supabase Database generic types not properly resolved in build context
import { withGeminiUsageContext, priceUsage, usageTokens } from "@/lib/gemini/usage";
import { GEMINI_TASK_QUEUE } from "@/lib/gemini/capacity";
import { task, logger } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractAntlerFingerprint } from "@/lib/gemini/client";
import {
  computeBcScores,
  rawFromFingerprintMeasurements,
  scoreClassFor,
} from "@/lib/scoring/boone-crockett";
import { assertFullResolutionPath, assertFullResolutionDimensions, ANALYSIS_GUARD_DIMS } from "@/lib/image/analysis-source";
import { reverseReidScan } from "./reverse-reid-scan";
import sharp from "sharp";
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
  queue: GEMINI_TASK_QUEUE,
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
        .select("id, image_id, crop_file_path, size_class, estimated_point_range, deer_id")
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

      // Full-resolution guard (ADR 0003): the fingerprint is the resolution-
      // sensitive stage — at variant scale a drop tine reads as a kicker and the
      // gross score / trophy decision silently corrupt. The crop must come from
      // the original (a `crops/…` path), never a display variant.
      assertFullResolutionPath(detection.crop_file_path, "generate-fingerprint:crop");

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

      // Full-resolution guard (ADR 0003), dimension half: reject a crop that is
      // thumbnail-scale (i.e. taken from a variant). Uses the thumbnail floor so
      // a legitimately small crop of a distant buck still passes.
      const cropMeta = await sharp(cropBuffer).metadata();
      assertFullResolutionDimensions(
        cropMeta.width,
        cropMeta.height,
        "generate-fingerprint:crop",
        ANALYSIS_GUARD_DIMS.THUMBNAIL_MAX_DIM
      );

      logger.info("Crop image downloaded", {
        detectionId,
        sizeBytes: cropBuffer.byteLength,
        dimensions: `${cropMeta.width}x${cropMeta.height}`,
      });

      // Step 4: Call extractAntlerFingerprint() with Gemini Thinking enabled
      logger.info("Calling Gemini to extract antler fingerprint (Thinking enabled)", {
        detectionId,
      });

      const { result: fingerprint, metrics } = await withGeminiUsageContext({ imageId: detection.image_id, detectionId }, () => extractAntlerFingerprint(cropBuffer));

      const generatedAt = new Date().toISOString();
      const tokenBreakdown = metrics.tokenBreakdown ?? usageTokens();
      const apiCost = priceUsage(metrics.modelUsed, tokenBreakdown, generatedAt);
      logger.info("Fingerprint API usage and cost", { detectionId, model: metrics.modelUsed, ...tokenBreakdown, ...apiCost });
      const { data: sourceImage } = await supabase.from("images").select("batch_id").eq("id", detection.image_id).single();
      if (sourceImage?.batch_id) {
        const { error: metricsError } = await supabase.from("batch_metrics").insert({
          batch_id: sourceImage.batch_id, image_id: detection.image_id,
          gemini_call_type: "fingerprint", model_used: metrics.modelUsed,
          prompt_tokens: metrics.promptTokens, response_tokens: metrics.responseTokens,
          total_tokens: metrics.totalTokens, duration_ms: metrics.durationMs,
          retry_count: metrics.retryCount, is_rate_limited: metrics.wasRateLimited,
        });
        if (metricsError) logger.error("Failed to persist fingerprint metrics", { detectionId, error: metricsError.message });
      }

      logger.info("Antler fingerprint extraction completed", {
        detectionId,
        model: metrics.modelUsed,
        scoreClass: fingerprint.scores.score_class,
        grossScore: fingerprint.scores.gross_score,
        netScore: fingerprint.scores.net_score,
        totalPoints: fingerprint.measurements.total_points,
        overallConfidence: fingerprint.confidence.overall,
        tokenUsage: metrics.totalTokens,
        tokenBreakdown,
        apiCost,
        durationMs: metrics.durationMs,
        wasRateLimited: metrics.wasRateLimited,
        retryCount: metrics.retryCount,
      });

      // Step 5: Compute the authoritative B&C scores in code from the model's raw
      // measurements (ADR 0006). The model EXTRACTS measurements; it is not trusted
      // to do the arithmetic. We overwrite fingerprint.scores with the deterministic
      // values so the persisted JSONB, score_gross, and is_trophy all agree.
      const bc = computeBcScores(
        rawFromFingerprintMeasurements(
          fingerprint.measurements,
          fingerprint.scores?.abnormal_points_total ?? null,
        ),
      );
      fingerprint.scores = {
        ...fingerprint.scores,
        gross_score: bc.grossScore,
        gross_typical: bc.grossTypical,
        deductions: bc.asymmetryDeductions,
        net_score: bc.netTypical,
        net_typical: bc.netTypical,
        net_non_typical: bc.netNonTypical,
        abnormal_points_total: bc.abnormalPointsTotal,
        score_class: scoreClassFor(bc.grossScore),
        // typical_status is a character call (drop tines/stickers), left to the model
        typical_status: fingerprint.scores?.typical_status ?? "typical",
      };

      // Step 5a: The authoritative trophy decision lives in the database. The
      // detection_numeric_trophy trigger (migration 061) derives is_trophy from the
      // rounded score_gross and profiles.trophy_threshold on every write, so a
      // worker-side verdict on the fractional score would only be overwritten, and
      // could disagree with it near the threshold. See ADR 0004.
      const grossScore = bc.grossScore;

      // Step 5b: Save fingerprint + authoritative score (trophy flag derived by trigger)
      logger.info("Saving antler fingerprint to database", { detectionId });

      const { error: updateError } = await supabase
        .from("detections")
        .update({
          antler_fingerprint: { ...fingerprint, model_used: metrics.modelUsed, generated_at: generatedAt, token_usage: tokenBreakdown, api_cost: apiCost } as any, // JSONB column
          // score_gross is an INTEGER column; the model returns a fractional
          // gross score (e.g. 178.2). Round to match the migration-043 backfill
          // convention — writing the raw float fails with Postgres 22P02 and
          // silently drops the entire fingerprint update (incl. is_trophy).
          score_gross: Math.round(grossScore),
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

      // Step 5c: Ongoing re-ID (ADR 0005). A freshly-fingerprinted, UNASSIGNED buck
      // is a re-ID candidate — scan it against the Catalog to propose Sightings.
      // Reference detections already carry a deer_id (post-creation-scan covers the
      // forward direction), so skip those.
      if (detection.deer_id == null) {
        try {
          await reverseReidScan.trigger({ detectionId, userId });
        } catch (scanErr) {
          logger.error("Failed to queue reverse re-ID scan", {
            detectionId,
            error: scanErr instanceof Error ? scanErr.message : String(scanErr),
          });
        }
      }

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
        tokenBreakdown,
        apiCost,
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
