// @ts-nocheck - Supabase Database generic types not properly resolved in build context
import { task, logger } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { compareFingerprints } from "@/lib/fingerprint/compare";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { AntlerFingerprint } from "@/types/fingerprint";

/**
 * Post-Creation Scan Job
 *
 * When a deer profile is created, this job scans all unassigned trophy detections
 * to find additional photos that might be the same buck based on antler print similarity.
 *
 * Workflow:
 * 1. Fetch the deer's reference detection and its antler fingerprint
 * 2. Call get_unassigned_trophy_detections RPC to get candidates
 * 3. Compare fingerprints using compareFingerprints()
 * 4. Create match_candidates for detections with 85%+ similarity
 * 5. Return summary of matches found
 *
 * Error Handling:
 * - If reference detection has no fingerprint, log warning and exit gracefully
 * - If no unassigned detections found, exit gracefully (not an error)
 * - Retry on transient database failures (max 3 attempts)
 * - Log detailed error information for debugging
 *
 * @module trigger/jobs/post-creation-scan
 */

interface PostCreationScanPayload {
  deerId: string;
  userId: string;
}

interface MatchCandidate {
  detectionId: string;
  similarity: number;
  capturedAt: string | null;
}

export const postCreationScan = task({
  id: "post-creation-scan",
  queue: {
    concurrencyLimit: 5,
  },
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload: PostCreationScanPayload) => {
    const { deerId, userId } = payload;

    logger.info("Starting post-creation scan", { deerId, userId });

    // Cast to typed client - TypeScript has issues with Database generic in Trigger.dev context
    const supabase = createAdminClient() as SupabaseClient<Database>;

    try {
      // Step 1: Fetch deer's reference detection and fingerprint
      logger.info("Fetching deer reference detection", { deerId });

      const { data: deer, error: deerError } = await supabase
        .from("deer")
        .select("id, reference_detection_id")
        .eq("id", deerId)
        .single();

      if (deerError || !deer) {
        logger.error("Failed to fetch deer record", {
          deerId,
          error: deerError?.message || "Deer not found",
        });
        return {
          success: false,
          deerId,
          error: deerError?.message || "Deer not found",
        };
      }

      if (!deer.reference_detection_id) {
        logger.warn("Deer has no reference detection", { deerId });
        return {
          success: true,
          deerId,
          matchesFound: 0,
          message: "No reference detection - skipping scan",
        };
      }

      logger.info("Fetching reference detection fingerprint", {
        deerId,
        referenceDetectionId: deer.reference_detection_id,
      });

      const { data: refDetection, error: refError } = await supabase
        .from("detections")
        .select("id, antler_fingerprint")
        .eq("id", deer.reference_detection_id)
        .single();

      if (refError || !refDetection) {
        logger.error("Failed to fetch reference detection", {
          deerId,
          referenceDetectionId: deer.reference_detection_id,
          error: refError?.message || "Detection not found",
        });
        return {
          success: false,
          deerId,
          error: `Failed to fetch reference detection: ${refError?.message || "Not found"}`,
        };
      }

      const referenceFingerprint = refDetection.antler_fingerprint as AntlerFingerprint | null;

      if (!referenceFingerprint) {
        logger.warn("Reference detection has no fingerprint", {
          deerId,
          referenceDetectionId: deer.reference_detection_id,
        });
        return {
          success: true,
          deerId,
          matchesFound: 0,
          message: "Reference detection has no fingerprint - skipping scan",
        };
      }

      logger.info("Reference fingerprint loaded", {
        deerId,
        scoreClass: referenceFingerprint.scores.score_class,
        totalPoints: referenceFingerprint.measurements.total_points,
      });

      // Step 2: Get unassigned trophy detections using RPC
      logger.info("Fetching unassigned trophy detections", { userId });

      const { data: candidates, error: candidatesError } = await supabase.rpc(
        "get_unassigned_trophy_detections" as never,
        {
          p_user_id: userId,
        } as never
      );

      if (candidatesError) {
        logger.error("Failed to fetch unassigned trophy detections", {
          deerId,
          userId,
          error: candidatesError.message,
        });
        return {
          success: false,
          deerId,
          error: `Failed to fetch candidates: ${candidatesError.message}`,
        };
      }

      if (!candidates || candidates.length === 0) {
        logger.info("No unassigned trophy detections found", { deerId, userId });
        return {
          success: true,
          deerId,
          matchesFound: 0,
          message: "No unassigned trophy detections to scan",
        };
      }

      logger.info("Unassigned detections fetched", {
        deerId,
        candidateCount: candidates.length,
      });

      // Step 3: Compare fingerprints and find matches with 85%+ similarity
      const matches: MatchCandidate[] = [];
      const threshold = 85; // 85% similarity threshold from spec

      for (const candidate of candidates as Array<{
        detection_id: string;
        fingerprint: AntlerFingerprint;
        crop_file_path: string | null;
        captured_at: string | null;
      }>) {
        try {
          logger.info("Comparing fingerprints", {
            deerId,
            candidateDetectionId: candidate.detection_id,
          });

          const comparisonResult = compareFingerprints(
            referenceFingerprint,
            candidate.fingerprint
          );

          logger.info("Fingerprint comparison completed", {
            deerId,
            candidateDetectionId: candidate.detection_id,
            similarity: comparisonResult.overall_similarity,
            ratioScore: comparisonResult.component_scores.ratios,
            featureScore: comparisonResult.component_scores.features,
            measurementScore: comparisonResult.component_scores.measurements,
          });

          if (comparisonResult.overall_similarity >= threshold) {
            matches.push({
              detectionId: candidate.detection_id,
              similarity: comparisonResult.overall_similarity,
              capturedAt: candidate.captured_at,
            });

            logger.info("Match found above threshold", {
              deerId,
              candidateDetectionId: candidate.detection_id,
              similarity: comparisonResult.overall_similarity,
              reasoning: comparisonResult.reasoning,
            });
          }
        } catch (comparisonError) {
          logger.error("Fingerprint comparison failed", {
            deerId,
            candidateDetectionId: candidate.detection_id,
            error:
              comparisonError instanceof Error
                ? comparisonError.message
                : String(comparisonError),
          });
          // Continue with next candidate - don't fail entire scan
        }
      }

      logger.info("Fingerprint comparison phase completed", {
        deerId,
        totalCandidates: candidates.length,
        matchesFound: matches.length,
      });

      // Step 4: Create match_candidates for high-similarity matches
      if (matches.length > 0) {
        logger.info("Creating match candidates", {
          deerId,
          matchCount: matches.length,
        });

        // A reject/confirm is an operator decision and must be sticky — never
        // resurrect a decided (detection, deer) pair back to pending on a rescan
        // (human-in-the-loop, constitution). Drop matches the operator already
        // decided for THIS buck.
        const { data: decidedRows } = await supabase
          .from("match_candidates")
          .select("detection_id")
          .eq("candidate_deer_id", deerId)
          .in("status", ["rejected", "confirmed"]);
        const decidedDetectionIds = new Set(
          (decidedRows ?? []).map((r) => r.detection_id)
        );

        // Correct match_candidates columns: candidate_deer_id (not deer_id),
        // similarity_score (NOT NULL, not "similarity"), antler_print_similarity.
        // The previous column names silently failed under this file's @ts-nocheck,
        // which is why this scan never produced rows.
        const matchCandidateRecords = matches
          .filter((match) => !decidedDetectionIds.has(match.detectionId))
          .map((match) => {
            const sim01 = Math.round((match.similarity / 100) * 10000) / 10000;
            return {
              candidate_deer_id: deerId,
              detection_id: match.detectionId,
              similarity_score: sim01,
              antler_print_similarity: sim01, // 0-1 for DECIMAL(3,2)
              status: "pending",
              reviewed_at: null,
            };
          });

        const { error: insertError } = matchCandidateRecords.length === 0
          ? { error: null }
          : await supabase
              .from("match_candidates")
              .upsert(matchCandidateRecords as never, { onConflict: "detection_id,candidate_deer_id" });

        if (insertError) {
          logger.error("Failed to create match candidates", {
            deerId,
            matchCount: matches.length,
            error: insertError.message,
          });
          return {
            success: false,
            deerId,
            matchesFound: matches.length,
            error: `Failed to create match candidates: ${insertError.message}`,
          };
        }

        logger.info("Match candidates created successfully", {
          deerId,
          matchCount: matches.length,
        });
      }

      // Step 5: Return success summary
      return {
        success: true,
        deerId,
        matchesFound: matches.length,
        scannedDetections: candidates.length,
        threshold,
        matches: matches.map((m) => ({
          detectionId: m.detectionId,
          similarity: m.similarity,
          capturedAt: m.capturedAt,
        })),
      };
    } catch (error) {
      // Error handling: Log detailed error and return failure
      logger.error("Post-creation scan failed", {
        deerId,
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Don't throw - we want to return graceful failure
      return {
        success: false,
        deerId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
