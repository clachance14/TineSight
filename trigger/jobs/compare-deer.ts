// @ts-nocheck - Supabase Database generic types not properly resolved in build context
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
      // Get detection and its image
      const { data: detection, error: detectionError } = await supabase
        .from("detections")
        .select("id, image_id, head_bbox, images!inner(file_path)")
        .eq("id", detectionId)
        .single();

      if (detectionError || !detection) {
        throw new Error(`Detection not found: ${detectionError?.message}`);
      }

      // Generate signed URL for detection image
      const { data: detectionUrl } = await supabase.storage
        .from("photos")
        .createSignedUrl((detection as any).images.file_path, 3600);

      if (!detectionUrl) {
        throw new Error("Failed to get detection image URL");
      }

      // Get reference images for all catalog deer
      const catalogImages: Array<{ id: string; name: string; url: string }> = [];

      for (const deer of catalogDeer) {
        const { data: refDetection } = await supabase
          .from("detections")
          .select("image_id, images!inner(file_path)")
          .eq("id", deer.reference_detection_id)
          .single();

        if (refDetection) {
          const { data: refUrl } = await supabase.storage
            .from("photos")
            .createSignedUrl((refDetection as any).images.file_path, 3600);

          if (refUrl) {
            catalogImages.push({
              id: deer.id,
              name: deer.name,
              url: refUrl.signedUrl,
            });
          }
        }
      }

      if (catalogImages.length === 0) {
        throw new Error("No catalog reference images found");
      }

      logger.info("Calling Gemini for comparison", {
        detectionId,
        catalogImagesCount: catalogImages.length,
      });

      // Call Gemini for comparison
      const result = await compareWithGemini(
        detectionUrl.signedUrl,
        catalogImages
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
