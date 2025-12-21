// @ts-nocheck - Supabase Database generic types not properly resolved in build context
import { schedules, logger } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Cleanup Exports Scheduled Job
 *
 * Runs hourly to delete old export ZIP files from the exports bucket.
 * Export files are temporary downloads and should be cleaned up after 1 hour.
 *
 * Workflow:
 * 1. Create Supabase admin client (service role)
 * 2. List all files in exports bucket
 * 3. For each file:
 *    a. Parse creation timestamp from filename or use file metadata
 *    b. If older than 1 hour, delete it
 * 4. Log cleanup results
 *
 * Filename Pattern:
 * Export ZIPs follow pattern: {userId}/TineSight_Export_YYYY-MM-DD-HHmmss.zip
 * - Extract timestamp from filename (YYYY-MM-DD-HHmmss)
 * - Compare against current time
 *
 * Alternative: Use Supabase Storage file metadata created_at if available
 *
 * Error Handling:
 * - Storage list errors will fail the job (retryable)
 * - Individual file deletion errors are logged but don't fail the job
 * - Malformed filenames are logged and skipped
 *
 * @module trigger/jobs/cleanup-exports
 */

interface CleanupResult {
  deletedCount: number;
  errors: string[];
}

export const cleanupExportsSchedule = schedules.task({
  id: "cleanup-exports",
  cron: "0 * * * *", // Every hour on the hour
  run: async (): Promise<CleanupResult> => {
    logger.info("Starting scheduled export cleanup");

    // Cast to typed client - TypeScript has issues with Database generic in Trigger.dev context
    const supabase = createAdminClient() as SupabaseClient<Database>;

    let deletedCount = 0;
    const errors: string[] = [];

    try {
      // Step 1: Determine cutoff time (1 hour ago)
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - 1);

      logger.info("Starting export cleanup with cutoff time", {
        cutoffTime: cutoffTime.toISOString(),
      });

      // Step 2: List all folders (user IDs) in exports bucket
      logger.info("Listing user folders in exports bucket");

      const { data: userFolders, error: foldersError } = await supabase.storage
        .from("exports")
        .list("", {
          limit: 1000,
          sortBy: { column: "name", order: "asc" },
        });

      if (foldersError) {
        logger.error("Failed to list user folders in exports bucket", {
          error: foldersError.message,
        });
        throw new Error(`Failed to list user folders: ${foldersError.message}`);
      }

      if (!userFolders || userFolders.length === 0) {
        logger.info("No user folders found in exports bucket");
        return { deletedCount: 0, errors: [] };
      }

      logger.info("User folders found", { count: userFolders.length });

      // Step 3: Process each user folder
      for (const folder of userFolders) {
        // Skip if not a directory
        if (!folder.id) {
          // In Supabase storage list(), directories have null id
          const userId = folder.name;

          if (!userId) {
            continue;
          }

          logger.info("Processing user folder", { userId });

          // List files in this user's folder
          const { data: userFiles, error: filesError } = await supabase.storage
            .from("exports")
            .list(userId, {
              limit: 100, // Most users won't have more than 100 export files
              sortBy: { column: "created_at", order: "asc" }, // Oldest first
            });

          if (filesError) {
            logger.warn("Failed to list files for user", {
              userId,
              error: filesError.message,
            });
            errors.push(`Failed to list files for user ${userId}: ${filesError.message}`);
            continue;
          }

          if (!userFiles || userFiles.length === 0) {
            logger.info("No files found for user", { userId });
            continue;
          }

          logger.info("Files found for user", { userId, count: userFiles.length });

          // Step 4: Check each file's age and mark for deletion
          const filesToDelete: string[] = [];

          for (const file of userFiles) {
            // Skip if not a file
            if (!file.name || !file.id) {
              continue;
            }

            let fileAge: Date | null = null;

            // Try to parse timestamp from filename first
            // Pattern: TineSight_Export_YYYY-MM-DD-HHmmss.zip
            const filenameMatch = file.name.match(
              /TineSight_Export_(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.zip$/
            );

            if (filenameMatch) {
              const [, year, month, day, hour, minute, second] = filenameMatch;
              fileAge = new Date(
                parseInt(year),
                parseInt(month) - 1, // JS months are 0-indexed
                parseInt(day),
                parseInt(hour),
                parseInt(minute),
                parseInt(second)
              );

              logger.info("Parsed timestamp from filename", {
                userId,
                filename: file.name,
                timestamp: fileAge.toISOString(),
              });
            } else if (file.created_at) {
              // Fallback to file metadata created_at
              fileAge = new Date(file.created_at);

              logger.info("Using metadata timestamp", {
                userId,
                filename: file.name,
                timestamp: fileAge.toISOString(),
              });
            } else {
              // Can't determine age - log and skip
              logger.warn("Cannot determine file age, skipping", {
                userId,
                filename: file.name,
              });
              errors.push(`Cannot determine age for file: ${userId}/${file.name}`);
              continue;
            }

            // Check if file is older than cutoff
            if (fileAge < cutoffTime) {
              // Construct full path: {userId}/{filename}
              const fullPath = `${userId}/${file.name}`;
              filesToDelete.push(fullPath);

              const ageMinutes = Math.floor(
                (cutoffTime.getTime() - fileAge.getTime()) / 1000 / 60
              );

              logger.info("File marked for deletion", {
                userId,
                filename: file.name,
                age: fileAge.toISOString(),
                ageMinutes,
              });
            }
          }

          // Step 5: Delete files for this user
          if (filesToDelete.length > 0) {
            logger.info("Deleting old export files for user", {
              userId,
              count: filesToDelete.length,
            });

            const { data: deletedFiles, error: deleteError } = await supabase.storage
              .from("exports")
              .remove(filesToDelete);

            if (deleteError) {
              logger.error("Failed to delete export files for user", {
                userId,
                error: deleteError.message,
                fileCount: filesToDelete.length,
              });
              errors.push(`Batch delete failed for user ${userId}: ${deleteError.message}`);
            } else {
              const userDeletedCount = deletedFiles?.length || filesToDelete.length;
              deletedCount += userDeletedCount;

              logger.info("Export files deleted successfully for user", {
                userId,
                count: userDeletedCount,
              });
            }
          } else {
            logger.info("No files need deletion for user", { userId });
          }
        }
      }

      logger.info("Export cleanup completed", {
        deletedCount,
        errorCount: errors.length,
      });

      return { deletedCount, errors };
    } catch (error) {
      logger.error("Export cleanup failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      // Re-throw error so Trigger.dev can handle retry logic
      throw error;
    }
  },
});
