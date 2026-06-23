import { task, logger } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { compareDeers as compareWithGemini } from "@/lib/gemini/client";
import { compareFingerprints, type FingerprintComparisonResult } from "@/lib/fingerprint/compare";
import { assertFullResolutionPath } from "@/lib/image/analysis-source";
import type { AntlerFingerprint } from "@/types/fingerprint";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

interface CompareDeerPayload {
  detectionId: string;
  catalogDeer: Array<{
    id: string;
    name: string;
    reference_detection_id: string;
  }>;
}

export const compareDeer = task({
  id: "compare-deer",
  queue: { concurrencyLimit: 5 },
  retry: { maxAttempts: 2, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 10000 },
  run: async (payload: CompareDeerPayload) => {
    const { detectionId, catalogDeer } = payload;

    logger.info("Starting deer comparison", {
      detectionId,
      catalogSize: catalogDeer.length,
    });

    const supabase = createAdminClient() as SupabaseClient<Database>;

    try {
      // Get detection and its crop image, including antler fingerprint
      const { data: detection, error: detectionError } = await supabase
        .from("detections")
        .select("id, image_id, crop_file_path, antler_fingerprint")
        .eq("id", detectionId)
        .single();

      if (detectionError || !detection) {
        throw new Error(`Detection not found: ${detectionError?.message}`);
      }

      if (!detection.crop_file_path) {
        throw new Error(`Detection ${detectionId} has no crop_file_path - run crop generation first`);
      }

      // Full-resolution guard (ADR 0003): re-ID visual comparison must run on the
      // full-res crop, never a display variant.
      assertFullResolutionPath(detection.crop_file_path, "compare-deer:detection-crop");

      // Cast antler_fingerprint from JSONB
      const detectionFingerprint = detection.antler_fingerprint as AntlerFingerprint | null;

      // Generate signed URL for detection crop
      const { data: detectionCropUrl, error: cropUrlError } = await supabase.storage
        .from("photos")
        .createSignedUrl(detection.crop_file_path, 3600);

      if (cropUrlError || !detectionCropUrl) {
        throw new Error(`Failed to get detection crop URL: ${cropUrlError?.message}`);
      }

      // Download crop image as base64
      const cropResponse = await fetch(detectionCropUrl.signedUrl);
      if (!cropResponse.ok) {
        throw new Error(`Failed to download detection crop: ${cropResponse.statusText}`);
      }

      const cropBuffer = await cropResponse.arrayBuffer();
      const detectionBase64 = Buffer.from(cropBuffer).toString("base64");
      const detectionMimeType = "image/jpeg"; // Crops are saved as JPEG

      // Get reference crop images and fingerprints for all catalog deer
      const catalogDeerWithImages: Array<{
        id: string;
        name: string;
        referenceImageBase64: string;
        referenceImageMimeType: string;
        fingerprint: AntlerFingerprint | null;
      }> = [];

      for (const deer of catalogDeer) {
        const { data: refDetection, error: refError } = await supabase
          .from("detections")
          .select("id, crop_file_path, antler_fingerprint")
          .eq("id", deer.reference_detection_id)
          .single();

        if (refError || !refDetection) {
          logger.warn(`Reference detection not found for deer ${deer.name}`, {
            deerName: deer.name,
            referenceDetectionId: deer.reference_detection_id,
          });
          continue;
        }

        if (!refDetection.crop_file_path) {
          logger.warn(`Reference detection missing crop_file_path for deer ${deer.name}`, {
            deerName: deer.name,
            referenceDetectionId: deer.reference_detection_id,
          });
          continue;
        }

        // Full-resolution guard (ADR 0003): reference crop must be full-res too.
        assertFullResolutionPath(refDetection.crop_file_path, "compare-deer:reference-crop");

        // Generate signed URL for reference crop
        const { data: refCropUrl, error: refCropUrlError } = await supabase.storage
          .from("photos")
          .createSignedUrl(refDetection.crop_file_path, 3600);

        if (refCropUrlError || !refCropUrl) {
          logger.warn(`Failed to get reference crop URL for deer ${deer.name}`, {
            deerName: deer.name,
            error: refCropUrlError?.message,
          });
          continue;
        }

        // Download reference crop as base64
        const refCropResponse = await fetch(refCropUrl.signedUrl);
        if (!refCropResponse.ok) {
          logger.warn(`Failed to download reference crop for deer ${deer.name}`, {
            deerName: deer.name,
            status: refCropResponse.statusText,
          });
          continue;
        }

        const refCropBuffer = await refCropResponse.arrayBuffer();
        const referenceImageBase64 = Buffer.from(refCropBuffer).toString("base64");

        catalogDeerWithImages.push({
          id: deer.id,
          name: deer.name,
          referenceImageBase64,
          referenceImageMimeType: "image/jpeg", // Crops are saved as JPEG
          fingerprint: refDetection.antler_fingerprint as AntlerFingerprint | null,
        });
      }

      if (catalogDeerWithImages.length === 0) {
        throw new Error("No catalog reference images found - all reference detections missing crops");
      }

      logger.info("Calling Gemini for comparison", {
        detectionId,
        catalogImagesCount: catalogDeerWithImages.length,
      });

      // Call Gemini for comparison with base64 images
      const result = await compareWithGemini(
        detectionBase64,
        detectionMimeType,
        catalogDeerWithImages
      );

      logger.info("Gemini comparison complete", {
        detectionId,
        bestMatch: result.best_match?.deer_name,
        isNewDeer: result.is_likely_new_deer,
      });

      // Calculate fingerprint similarities for all catalog deer
      const fingerprintResults = new Map<string, FingerprintComparisonResult>();

      if (detectionFingerprint) {
        for (const catalogDeer of catalogDeerWithImages) {
          if (catalogDeer.fingerprint) {
            try {
              const fpResult = compareFingerprints(detectionFingerprint, catalogDeer.fingerprint);
              fingerprintResults.set(catalogDeer.id, fpResult);

              logger.info("Fingerprint comparison completed", {
                detectionId,
                catalogDeerId: catalogDeer.id,
                similarity: fpResult.overall_similarity,
                possibleBrokenTine: fpResult.flags.possible_broken_tine,
              });
            } catch (fpError) {
              logger.warn("Fingerprint comparison failed", {
                detectionId,
                catalogDeerId: catalogDeer.id,
                error: fpError instanceof Error ? fpError.message : String(fpError),
              });
            }
          }
        }
      }

      // Blend the two independent signals into the legacy `similarity_score`
      // column (NOT NULL, and the field the review UI sorts on): the documented
      // 35% visual (Gemini) + 65% structured fingerprint weighting. Falls back to
      // visual-only when no fingerprint similarity is available for the pair.
      const blendedScore = (geminiConfidence: number, fpSimilarity: number | null): number => {
        const visual = geminiConfidence / 100; // 0-1
        const blended = fpSimilarity === null ? visual : 0.35 * visual + 0.65 * fpSimilarity;
        return Math.round(blended * 10000) / 10000; // DECIMAL(5,4)
      };

      // A reject/confirm is an operator decision and must be sticky — never
      // resurrect a decided (detection, deer) pair back to pending on a rescan
      // (human-in-the-loop, constitution). Pre-fetch decided pairs and skip them.
      const { data: decidedRows } = await supabase
        .from("match_candidates")
        .select("candidate_deer_id")
        .eq("detection_id", detectionId)
        .in("status", ["rejected", "confirmed"]);
      const decidedDeerIds = new Set((decidedRows ?? []).map((r) => r.candidate_deer_id));

      // Store match candidates with fingerprint similarity
      if (result.best_match && !decidedDeerIds.has(result.best_match.deer_id)) {
        const fpResult = fingerprintResults.get(result.best_match.deer_id);
        const antlerPrintSimilarity = fpResult ? fpResult.overall_similarity / 100 : null; // Convert 0-100 to 0-1

        await supabase.from("match_candidates").upsert({
          detection_id: detectionId,
          candidate_deer_id: result.best_match.deer_id,
          similarity_score: blendedScore(result.best_match.confidence, antlerPrintSimilarity),
          gemini_confidence: Math.round(result.best_match.confidence),
          gemini_reasoning: result.best_match.reasoning,
          antler_print_similarity: antlerPrintSimilarity,
          status: "pending",
        }, { onConflict: "detection_id,candidate_deer_id" });

        if (fpResult?.flags.possible_broken_tine) {
          logger.info("Possible broken tine detected in best match", {
            detectionId,
            candidateDeerId: result.best_match.deer_id,
            reasoning: fpResult.reasoning,
          });
        }
      }

      // Store other possibilities with fingerprint similarity
      for (const other of result.other_possibilities) {
        if (decidedDeerIds.has(other.deer_id)) continue;
        const fpResult = fingerprintResults.get(other.deer_id);
        const antlerPrintSimilarity = fpResult ? fpResult.overall_similarity / 100 : null;

        await supabase.from("match_candidates").upsert({
          detection_id: detectionId,
          candidate_deer_id: other.deer_id,
          similarity_score: blendedScore(other.confidence, antlerPrintSimilarity),
          gemini_confidence: Math.round(other.confidence),
          gemini_reasoning: null,
          antler_print_similarity: antlerPrintSimilarity,
          status: "pending",
        }, { onConflict: "detection_id,candidate_deer_id" });
      }

      return {
        success: true,
        detectionId,
        bestMatch: result.best_match?.deer_name ?? null,
        isNewDeer: result.is_likely_new_deer,
        fingerprintComparisons: fingerprintResults.size,
      };
    } catch (error) {
      logger.error("Deer comparison failed", {
        detectionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
});
