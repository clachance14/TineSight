// @ts-nocheck - Supabase Database generic types not properly resolved in build context
import { task, logger } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateImageVariants, uploadImageVariants } from "@/lib/image/variants";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Generate Image Variants Job
 *
 * Produces server-side display variants (thumbnail + medium WebP) for one image
 * and persists their storage paths. This is the single source of truth for
 * variants — used both on upload (fanned out by batch-process) and by the
 * backfill coordinator. See ADR 0003.
 *
 * Design:
 * - Idempotent DB claim: marks variant_status='processing' only if currently
 *   'pending' or 'failed'. If no row is claimed, another run owns it — skip.
 * - Additive only: never deletes or overwrites the original. Variant uploads use
 *   deterministic paths with upsert for retry safety.
 * - Failure isolation: variant failures set variant_status='failed' +
 *   variant_error. They do NOT touch detection/analysis state.
 *
 * @module trigger/jobs/generate-image-variants
 */

interface GenerateImageVariantsPayload {
  imageId: string;
}

export const generateImageVariantsJob = task({
  id: "generate-image-variants",
  queue: {
    concurrencyLimit: parseInt(process.env.TRIGGER_VARIANT_CONCURRENCY || "10", 10),
  },
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload: GenerateImageVariantsPayload) => {
    const { imageId } = payload;
    const supabase = createAdminClient() as SupabaseClient<Database>;

    logger.info("Generating image variants", { imageId });

    // Step 1: Idempotent claim. Only proceed if this image still needs variants.
    // Re-claims 'failed' so retries (transient errors) regenerate; skips 'ready'
    // and 'processing' (owned by another run).
    const { data: claimed, error: claimError } = await supabase
      .from("images")
      .update({ variant_status: "processing" })
      .eq("id", imageId)
      .in("variant_status", ["pending", "failed"])
      .select("id, file_path")
      .maybeSingle();

    if (claimError) {
      throw new Error(`Failed to claim image for variants: ${claimError.message}`);
    }

    if (!claimed) {
      logger.info("Image variants already done or in progress, skipping", { imageId });
      return { skipped: true, imageId, reason: "not_claimable" };
    }

    try {
      // Step 2: Download the original (signed URL, mirrors analyze-photo).
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("photos")
        .createSignedUrl(claimed.file_path, 3600);

      if (signedUrlError || !signedUrlData) {
        throw new Error(
          `Failed to sign original URL: ${signedUrlError?.message || "no URL"}`
        );
      }

      const response = await fetch(signedUrlData.signedUrl);
      if (!response.ok) {
        throw new Error(`Failed to download original: ${response.status} ${response.statusText}`);
      }
      const imageBuffer = Buffer.from(await response.arrayBuffer());

      // Step 3: Generate variants (Sharp, EXIF-rotated, hardened).
      const variants = await generateImageVariants(imageBuffer);

      logger.info("Variants generated", {
        imageId,
        thumbnailBytes: variants.thumbnailBytes,
        mediumBytes: variants.mediumBytes,
      });

      // Step 4: Upload variants (additive, deterministic paths, upsert).
      const paths = await uploadImageVariants(supabase, imageId, variants);

      // Step 5: Persist paths + mark ready.
      const { error: persistError } = await supabase
        .from("images")
        .update({
          thumbnail_path: paths.thumbnailPath,
          medium_path: paths.mediumPath,
          variant_status: "ready",
          variant_error: null,
        })
        .eq("id", imageId);

      if (persistError) {
        throw new Error(`Failed to persist variant paths: ${persistError.message}`);
      }

      logger.info("Image variants ready", { imageId, ...paths });
      return { success: true, imageId, ...paths };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Image variant generation failed", { imageId, error: message });

      // Failure isolation: mark variant_status='failed', do not touch analysis.
      await supabase
        .from("images")
        .update({ variant_status: "failed", variant_error: message })
        .eq("id", imageId);

      // Re-throw so Trigger.dev retries transient failures (bounded by maxAttempts).
      throw error;
    }
  },
});
