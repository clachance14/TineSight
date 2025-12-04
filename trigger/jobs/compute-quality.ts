// @ts-nocheck - Supabase Database generic types not properly resolved in build context
import { task, logger } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Compute Quality Job
 *
 * Computes quality scores for detections based on similarity to reference ROIs.
 * This job:
 * 1. Checks if the user has enough reference ROIs (minimum 3)
 * 2. Calls the compute_quality_score database function
 * 3. Updates the detection's quality_status and quality_score
 *
 * Quality thresholds:
 * - >= 0.7: high_quality (auto-process)
 * - 0.4 - 0.7: manual_review
 * - < 0.4: low_quality (skip embedding generation)
 *
 * @module trigger/jobs/compute-quality
 */

interface ComputeQualityPayload {
  detectionId: string;
  userId: string;
}

interface BatchComputeQualityPayload {
  detectionIds: string[];
  userId: string;
}

const QUALITY_THRESHOLDS = {
  HIGH: 0.7,
  LOW: 0.4,
  MIN_REFERENCES: 3,
};

type QualityStatus = 'pending' | 'high_quality' | 'low_quality' | 'manual_review';

function scoreToStatus(score: number | null): QualityStatus {
  if (score === null) {
    return 'pending';
  }
  if (score >= QUALITY_THRESHOLDS.HIGH) {
    return 'high_quality';
  }
  if (score < QUALITY_THRESHOLDS.LOW) {
    return 'low_quality';
  }
  return 'manual_review';
}

export const computeQualityTask = task({
  id: "compute-quality",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload: ComputeQualityPayload) => {
    const { detectionId, userId } = payload;

    logger.info("Computing quality score", { detectionId, userId });

    const supabase = createAdminClient() as SupabaseClient<Database>;

    try {
      // Step 1: Check reference count
      const { data: refCount, error: refCountError } = await supabase
        .rpc('count_reference_rois', { query_user_id: userId });

      if (refCountError) {
        logger.error("Failed to count reference ROIs", {
          userId,
          error: refCountError.message,
        });
        throw new Error(`Failed to count references: ${refCountError.message}`);
      }

      const referenceCount = refCount as number;

      if (referenceCount < QUALITY_THRESHOLDS.MIN_REFERENCES) {
        logger.info("Not enough reference ROIs for quality scoring", {
          detectionId,
          userId,
          referenceCount,
          required: QUALITY_THRESHOLDS.MIN_REFERENCES,
        });

        // Update detection to pending status (can't compute without references)
        await supabase
          .from('detections')
          .update({
            quality_status: 'pending',
            quality_score: null,
          } as never)
          .eq('id', detectionId);

        return {
          success: true,
          detectionId,
          status: 'pending' as QualityStatus,
          score: null,
          reason: 'insufficient_references',
        };
      }

      // Step 2: Compute quality score
      const { data: score, error: scoreError } = await supabase
        .rpc('compute_quality_score', {
          target_detection_id: detectionId,
          query_user_id: userId,
        });

      if (scoreError) {
        logger.error("Failed to compute quality score", {
          detectionId,
          userId,
          error: scoreError.message,
        });
        throw new Error(`Failed to compute score: ${scoreError.message}`);
      }

      const qualityScore = score as number | null;
      const qualityStatus = scoreToStatus(qualityScore);

      logger.info("Quality score computed", {
        detectionId,
        score: qualityScore,
        status: qualityStatus,
      });

      // Step 3: Update detection
      const { error: updateError } = await supabase
        .from('detections')
        .update({
          quality_status: qualityStatus,
          quality_score: qualityScore,
        } as never)
        .eq('id', detectionId);

      if (updateError) {
        logger.error("Failed to update detection quality", {
          detectionId,
          error: updateError.message,
        });
        throw new Error(`Failed to update detection: ${updateError.message}`);
      }

      logger.info("Detection quality updated", {
        detectionId,
        status: qualityStatus,
        score: qualityScore,
      });

      return {
        success: true,
        detectionId,
        status: qualityStatus,
        score: qualityScore,
      };
    } catch (error) {
      logger.error("Quality computation failed", {
        detectionId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  },
});

/**
 * Batch compute quality scores for multiple detections
 */
export const batchComputeQualityTask = task({
  id: "batch-compute-quality",
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
  },
  run: async (payload: BatchComputeQualityPayload) => {
    const { detectionIds, userId } = payload;

    logger.info("Starting batch quality computation", {
      userId,
      detectionCount: detectionIds.length,
    });

    const results: Array<{
      detectionId: string;
      success: boolean;
      status?: QualityStatus;
      score?: number | null;
      error?: string;
    }> = [];

    for (const detectionId of detectionIds) {
      try {
        const result = await computeQualityTask.trigger({
          detectionId,
          userId,
        });

        // Wait for the task to complete
        const outcome = await result.wait();

        results.push({
          detectionId,
          success: true,
          status: outcome.status,
          score: outcome.score,
        });
      } catch (error) {
        logger.warn("Failed to compute quality for detection", {
          detectionId,
          error: error instanceof Error ? error.message : String(error),
        });

        results.push({
          detectionId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const successCount = results.filter(r => r.success).length;

    logger.info("Batch quality computation completed", {
      userId,
      total: detectionIds.length,
      successful: successCount,
      failed: detectionIds.length - successCount,
    });

    return {
      total: detectionIds.length,
      successful: successCount,
      failed: detectionIds.length - successCount,
      results,
    };
  },
});
