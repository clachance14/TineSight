// @ts-nocheck - Supabase Database generic types not properly resolved in build context
import { task, logger } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateImageVariantsJob } from "./generate-image-variants";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Backfill Variants Coordinator
 *
 * Enqueues generate-image-variants for every existing image that has no variants
 * yet (variant_status = 'pending'). See ADR 0003.
 *
 * - Keyset-paginates by (created_at, id) so it advances forward and never loops,
 *   even as enqueued jobs flip rows out of 'pending'.
 * - Only enqueues — the per-image job does the work, claims idempotently, and its
 *   queue concurrency caps actual parallelism against Supabase Storage / CPU.
 *   Re-enqueuing a row already claimed is harmless (the job skips it).
 * - Resumable: re-running picks up whatever is still 'pending'.
 *
 * @module trigger/jobs/backfill-variants
 */

interface BackfillVariantsPayload {
  /** Rows fetched + enqueued per page. Default 100. */
  pageSize?: number;
  /** Optional cap on total images enqueued (for a dry-run / sample). */
  maxImages?: number;
}

export const backfillVariants = task({
  id: "backfill-variants",
  run: async (payload: BackfillVariantsPayload = {}) => {
    const pageSize = payload.pageSize ?? 100;
    const maxImages = payload.maxImages ?? Infinity;
    const supabase = createAdminClient() as SupabaseClient<Database>;

    logger.info("Starting variant backfill", { pageSize, maxImages });

    let cursor: { created_at: string; id: string } | null = null;
    let totalEnqueued = 0;

    while (totalEnqueued < maxImages) {
      let query = supabase
        .from("images")
        .select("id, created_at")
        .eq("variant_status", "pending")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(pageSize);

      if (cursor) {
        // Keyset: strictly after the last row of the previous page.
        query = query.or(
          `created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`
        );
      }

      const { data: page, error } = await query;

      if (error) {
        throw new Error(`Backfill query failed: ${error.message}`);
      }
      if (!page || page.length === 0) {
        break;
      }

      const remaining = maxImages - totalEnqueued;
      const toEnqueue = page.slice(0, remaining);

      await generateImageVariantsJob.batchTrigger(
        toEnqueue.map((row) => ({ payload: { imageId: row.id } }))
      );

      totalEnqueued += toEnqueue.length;
      const last = page[page.length - 1];
      cursor = { created_at: last.created_at, id: last.id };

      logger.info("Backfill page enqueued", {
        pageCount: toEnqueue.length,
        totalEnqueued,
      });

      if (page.length < pageSize) {
        break; // last page
      }
    }

    logger.info("Variant backfill complete", { totalEnqueued });
    return { success: true, totalEnqueued };
  },
});
