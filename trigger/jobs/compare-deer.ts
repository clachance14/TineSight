import { task, logger } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { compareDeers as compareWithGemini } from "@/lib/gemini/client";
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
      // Get detection and its crop image
      const { data: detection, error: detectionError } = await supabase
        .from("detections")
        .select("id, image_id, crop_file_path")
        .eq("id", detectionId)
        .single();

      if (detectionError || !detection) {
        throw new Error(`Detection not found: ${detectionError?.message}`);
      }

      if (!detection.crop_file_path) {
        throw new Error(`Detection ${detectionId} has no crop_file_path - run crop generation first`);
      }

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

      // Get reference crop images for all catalog deer
      const catalogDeerWithImages: Array<{
        id: string;
        name: string;
        referenceImageBase64: string;
        referenceImageMimeType: string;
      }> = [];

      for (const deer of catalogDeer) {
        const { data: refDetection, error: refError } = await supabase
          .from("detections")
          .select("id, crop_file_path")
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

      // Store match candidates
      if (result.best_match) {
        await supabase.from("match_candidates").insert({
          detection_id: detectionId,
          candidate_deer_id: result.best_match.deer_id,
          gemini_confidence: result.best_match.confidence,
          gemini_reasoning: result.best_match.reasoning,
          status: "pending",
        } as never);
      }

      // Store other possibilities
      for (const other of result.other_possibilities) {
        await supabase.from("match_candidates").insert({
          detection_id: detectionId,
          candidate_deer_id: other.deer_id,
          gemini_confidence: other.confidence,
          gemini_reasoning: null,
          status: "pending",
        } as never);
      }

      return {
        success: true,
        detectionId,
        bestMatch: result.best_match?.deer_name ?? null,
        isNewDeer: result.is_likely_new_deer,
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
