// @ts-nocheck - Supabase Database generic types not properly resolved in build context
import { task, logger } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Cleanup Cancelled Images Job
 *
 * Cleans up images marked with `is_cancelled = true` in chunks to avoid timeout.
 * This job processes cancelled images in batches of 50 to prevent long-running operations.
 *
 * Workflow:
 * 1. Query images where is_cancelled = true (limit 50)
 * 2. For each image, collect storage paths (file_path, thumbnail_path)
 * 3. Query detections for each image to get crop_file_path
 * 4. Delete from database (CASCADE handles detections)
 * 5. Delete storage files (non-blocking, log errors)
 * 6. If more images remain, trigger self recursively
 * 7. Return stats
 *
 * Error Handling:
 * - Database errors will fail the job (retryable)
 * - Storage deletion errors are logged but don't fail the job
 * - Recursive trigger failures are logged but don't fail current batch
 *
 * @module trigger/jobs/cleanup-cancelled-images
 */

interface CleanupCancelledImagesPayload {
  userId: string; // Required for RLS and scoping
  sessionId?: string; // Optional: only cleanup this session's images
}

export const cleanupCancelledImages = task({
  id: "cleanup-cancelled-images",
  queue: {
    concurrencyLimit: 1, // Only one cleanup job at a time per user
  },
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
  },
  run: async (payload: CleanupCancelledImagesPayload) => {
    const { userId, sessionId } = payload;

    logger.info("Starting cleanup of cancelled images", {
      userId,
      sessionId: sessionId || "all sessions",
    });

    // Cast to typed client - TypeScript has issues with Database generic in Trigger.dev context
    const supabase = createAdminClient() as SupabaseClient<Database>;

    try {
      // Step 1: Query cancelled images (chunk of 50)
      logger.info("Querying cancelled images", {
        userId,
        sessionId,
        chunkSize: 50,
      });

      // If session ID provided, get batch IDs first (images don't have upload_session_id directly)
      let batchIds: string[] | null = null;
      if (sessionId) {
        const { data: sessionBatches, error: batchError } = await supabase
          .from("processing_batches")
          .select("id")
          .eq("upload_session_id", sessionId);

        if (batchError) {
          logger.warn("Failed to fetch batches for session", {
            sessionId,
            error: batchError.message,
          });
        } else if (sessionBatches && sessionBatches.length > 0) {
          batchIds = sessionBatches.map((b) => b.id);
          logger.info("Found batches for session", {
            sessionId,
            batchCount: batchIds.length,
          });
        } else {
          logger.info("No batches found for session, nothing to clean up", {
            sessionId,
          });
          return {
            deletedCount: 0,
            storageFilesDeleted: 0,
            hasMore: false,
          };
        }
      }

      let query = supabase
        .from("images")
        .select("id, file_path, thumbnail_path")
        .eq("user_id", userId)
        .eq("is_cancelled", true)
        .limit(50);

      // Filter by batch IDs if session was provided
      if (batchIds) {
        query = query.in("batch_id", batchIds);
      }

      const { data: images, error: fetchError } = await query;

      if (fetchError) {
        logger.error("Failed to fetch cancelled images", {
          userId,
          sessionId,
          error: fetchError.message,
        });
        throw new Error(
          `Failed to fetch cancelled images: ${fetchError.message}`
        );
      }

      if (!images || images.length === 0) {
        logger.info("No cancelled images found", { userId, sessionId });
        return {
          deletedCount: 0,
          storageFilesDeleted: 0,
          hasMore: false,
        };
      }

      logger.info("Cancelled images fetched", {
        userId,
        sessionId,
        count: images.length,
      });

      // Step 2: Collect storage paths for each image
      const imageIds = images.map((img) => img.id);
      const storagePaths: string[] = [];

      // Collect main file paths and thumbnails
      for (const img of images) {
        if (img.file_path) {
          storagePaths.push(img.file_path);
        }
        if (img.thumbnail_path) {
          storagePaths.push(img.thumbnail_path);
        }
      }

      logger.info("Collecting detection crop paths", {
        userId,
        imageCount: images.length,
        imageIds: imageIds.slice(0, 5), // Log first 5 IDs
      });

      // Step 3: Query detections for each image to get crop_file_path
      const { data: detections, error: detectionsError } = await supabase
        .from("detections")
        .select("crop_file_path")
        .in("image_id", imageIds);

      if (detectionsError) {
        logger.warn("Failed to fetch detections for cleanup", {
          userId,
          error: detectionsError.message,
        });
        // Don't fail - we can still clean up images
      } else if (detections && detections.length > 0) {
        for (const detection of detections) {
          if (detection.crop_file_path) {
            storagePaths.push(detection.crop_file_path);
          }
        }
        logger.info("Detection crop paths collected", {
          userId,
          detectionCount: detections.length,
          cropPathsCount: detections.filter((d) => d.crop_file_path).length,
        });
      }

      logger.info("Total storage paths to delete", {
        userId,
        count: storagePaths.length,
      });

      // Step 4: Delete from database (CASCADE handles detections)
      logger.info("Deleting images from database", {
        userId,
        imageCount: images.length,
      });

      const { error: deleteError } = await supabase
        .from("images")
        .delete()
        .in("id", imageIds);

      if (deleteError) {
        logger.error("Failed to delete images from database", {
          userId,
          error: deleteError.message,
        });
        throw new Error(
          `Failed to delete images from database: ${deleteError.message}`
        );
      }

      logger.info("Images deleted from database", {
        userId,
        deletedCount: images.length,
      });

      // Step 5: Delete storage files (non-blocking - log errors but don't fail)
      if (storagePaths.length > 0) {
        logger.info("Deleting storage files", {
          userId,
          pathCount: storagePaths.length,
        });

        const { data: deleteData, error: storageError } = await supabase.storage
          .from("photos")
          .remove(storagePaths);

        if (storageError) {
          logger.warn("Failed to delete some storage files", {
            userId,
            error: storageError.message,
            pathCount: storagePaths.length,
          });
          // Don't throw - database cleanup succeeded, storage is secondary
        } else {
          logger.info("Storage files deleted", {
            userId,
            deletedCount: deleteData?.length || storagePaths.length,
          });
        }
      } else {
        logger.info("No storage files to delete", { userId });
      }

      // Step 6: Recursive trigger if more images exist
      const hasMore = images.length === 50;

      if (hasMore) {
        logger.info("More cancelled images remain, triggering recursive cleanup", {
          userId,
          sessionId,
        });

        try {
          await cleanupCancelledImages.trigger(payload);
          logger.info("Recursive cleanup triggered", { userId, sessionId });
        } catch (triggerError) {
          logger.error("Failed to trigger recursive cleanup", {
            userId,
            sessionId,
            error:
              triggerError instanceof Error
                ? triggerError.message
                : String(triggerError),
          });
          // Don't throw - current batch succeeded
        }
      } else {
        logger.info("Cleanup complete - no more cancelled images", {
          userId,
          sessionId,
        });
      }

      // Step 7: Return stats
      const stats = {
        deletedCount: images.length,
        storageFilesDeleted: storagePaths.length,
        hasMore,
      };

      logger.info("Cleanup batch completed", {
        userId,
        sessionId,
        stats,
      });

      return stats;
    } catch (error) {
      logger.error("Cleanup cancelled images failed", {
        userId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Re-throw error so Trigger.dev can handle retry logic
      throw error;
    }
  },
});
