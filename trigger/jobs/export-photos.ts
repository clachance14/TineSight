// @ts-nocheck - Supabase Database generic types not properly resolved in build context
import { task, logger, metadata } from "@trigger.dev/sdk/v3";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPhotosForExport,
  downloadPhotoBuffer,
  generateExportFilename,
  uploadZipToStorage,
  getExportDownloadUrl,
} from "@/lib/services/export";
import type { PhotoForExport } from "@/lib/services/export";
import archiver from "archiver";
import { Readable, PassThrough } from "stream";

/**
 * Export Photos Job
 *
 * Handles large photo exports (26-500 photos) asynchronously.
 * Creates a ZIP archive of selected photos with smart filenames.
 *
 * Workflow:
 * 1. Fetch photos metadata using getPhotosForExport()
 * 2. Initialize archiver for ZIP creation
 * 3. Create writable buffer stream
 * 4. Process photos in chunks of 5 (backpressure management):
 *    - Download photos using downloadPhotoBuffer()
 *    - Generate unique filename using generateExportFilename()
 *    - Append to archive
 *    - Update progress via metadata.set()
 *    - Small delay between chunks (100ms) for backpressure
 * 5. Finalize archive
 * 6. Upload ZIP to Supabase Storage using uploadZipToStorage()
 * 7. Generate signed download URL using getExportDownloadUrl()
 * 8. Return result with downloadUrl
 *
 * Error Handling:
 * - Log failed photo fetches but continue with others
 * - Track failedCount for partial success reporting
 * - If all photos fail, return error
 *
 * Progress Tracking:
 * - Uses metadata.set('progress', { current, total }) for real-time updates
 *
 * @module trigger/jobs/export-photos
 */

interface ExportPhotosInput {
  userId: string;
  photoIds: string[];
}

interface ExportPhotosOutput {
  success: boolean;
  downloadUrl?: string;
  exportedCount: number;
  failedCount: number;
  error?: string;
}

/**
 * Helper to convert stream to buffer
 */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Helper to delay for backpressure management
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const exportPhotosTask = task({
  id: "export-photos",
  // Limit concurrent export jobs to manage memory and storage I/O
  queue: {
    concurrencyLimit: 3,
  },
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload: ExportPhotosInput): Promise<ExportPhotosOutput> => {
    const { userId, photoIds } = payload;

    logger.info("Starting photo export", {
      userId,
      photoCount: photoIds.length,
    });

    // Initialize progress tracking
    metadata.set("progress", { current: 0, total: photoIds.length });
    metadata.set("status", "initializing");

    try {
      // Step 1: Fetch photos metadata
      logger.info("Fetching photos metadata", { userId, photoCount: photoIds.length });
      metadata.set("status", "fetching_metadata");

      const { data: photos, error: fetchError } = await getPhotosForExport(userId, photoIds);

      if (fetchError || !photos) {
        logger.error("Failed to fetch photos metadata", {
          userId,
          error: fetchError?.message || "No photos returned",
        });
        throw new Error(`Failed to fetch photos: ${fetchError?.message || "Unknown error"}`);
      }

      if (photos.length === 0) {
        logger.warn("No photos found for export", { userId, photoIds });
        return {
          success: false,
          exportedCount: 0,
          failedCount: photoIds.length,
          error: "No photos found for export",
        };
      }

      logger.info("Photos metadata fetched", {
        userId,
        fetchedCount: photos.length,
        requestedCount: photoIds.length,
      });

      // Step 2: Initialize archiver
      logger.info("Initializing ZIP archive");
      metadata.set("status", "creating_archive");

      const archive = archiver("zip", {
        zlib: { level: 5 }, // Compression level (0-9, 5 is balanced)
      });

      // Create writable stream to buffer
      const bufferStream = new PassThrough();
      archive.pipe(bufferStream);

      // Track used filenames for collision handling
      const usedFilenames = new Map<string, number>();
      let exportedCount = 0;
      let failedCount = 0;

      // Error handler for archive
      archive.on("error", (err) => {
        logger.error("Archive error", { error: err.message });
        throw err;
      });

      // Step 3: Process photos in chunks of 5 for backpressure
      const CHUNK_SIZE = 5;
      const BACKPRESSURE_DELAY_MS = 100;

      logger.info("Starting photo processing", {
        totalPhotos: photos.length,
        chunkSize: CHUNK_SIZE,
      });
      metadata.set("status", "processing_photos");

      for (let i = 0; i < photos.length; i += CHUNK_SIZE) {
        const chunk = photos.slice(i, Math.min(i + CHUNK_SIZE, photos.length));

        // Process chunk in parallel
        const chunkResults = await Promise.allSettled(
          chunk.map(async (photo: PhotoForExport) => {
            try {
              // Download photo buffer
              const { data: photoBuffer, error: downloadError } = await downloadPhotoBuffer(
                photo.file_path
              );

              if (downloadError || !photoBuffer) {
                logger.warn("Failed to download photo", {
                  photoId: photo.id,
                  filePath: photo.file_path,
                  error: downloadError?.message || "No data returned",
                });
                throw new Error(`Download failed: ${downloadError?.message || "Unknown error"}`);
              }

              // Generate unique filename
              const filename = generateExportFilename(photo, usedFilenames);

              // Append to archive
              archive.append(Buffer.from(photoBuffer), { name: filename });

              logger.info("Photo added to archive", {
                photoId: photo.id,
                filename,
              });

              return { success: true, filename };
            } catch (error) {
              logger.error("Failed to process photo", {
                photoId: photo.id,
                error: error instanceof Error ? error.message : String(error),
              });
              return { success: false, error };
            }
          })
        );

        // Count successes and failures
        for (const result of chunkResults) {
          if (result.status === "fulfilled" && result.value.success) {
            exportedCount++;
          } else {
            failedCount++;
          }
        }

        // Update progress
        const currentProgress = i + chunk.length;
        metadata.set("progress", { current: currentProgress, total: photos.length });

        logger.info("Chunk processed", {
          chunkIndex: Math.floor(i / CHUNK_SIZE) + 1,
          totalChunks: Math.ceil(photos.length / CHUNK_SIZE),
          exported: exportedCount,
          failed: failedCount,
          progress: `${currentProgress}/${photos.length}`,
        });

        // Backpressure delay between chunks (except for last chunk)
        if (i + CHUNK_SIZE < photos.length) {
          await delay(BACKPRESSURE_DELAY_MS);
        }
      }

      // Check if all photos failed
      if (exportedCount === 0) {
        logger.error("All photos failed to process", {
          userId,
          failedCount,
        });
        return {
          success: false,
          exportedCount: 0,
          failedCount,
          error: "All photos failed to process",
        };
      }

      // Step 4: Finalize archive
      logger.info("Finalizing ZIP archive", {
        exportedCount,
        failedCount,
      });
      metadata.set("status", "finalizing_archive");

      await archive.finalize();

      // Convert stream to buffer
      const zipBuffer = await streamToBuffer(bufferStream);

      logger.info("ZIP archive created", {
        sizeBytes: zipBuffer.length,
        exportedCount,
        failedCount,
      });

      // Step 5: Upload ZIP to Supabase Storage
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const zipFilename = `export_${timestamp}.zip`;

      logger.info("Uploading ZIP to storage", {
        userId,
        filename: zipFilename,
        sizeBytes: zipBuffer.length,
      });
      metadata.set("status", "uploading_zip");

      const { path: zipPath, error: uploadError } = await uploadZipToStorage(
        userId,
        zipBuffer,
        zipFilename
      );

      if (uploadError || !zipPath) {
        logger.error("Failed to upload ZIP to storage", {
          userId,
          error: uploadError?.message || "No path returned",
        });
        throw new Error(`Failed to upload ZIP: ${uploadError?.message || "Unknown error"}`);
      }

      logger.info("ZIP uploaded successfully", {
        userId,
        zipPath,
      });

      // Step 6: Generate signed download URL
      logger.info("Generating download URL", { zipPath });
      metadata.set("status", "generating_download_url");

      const { data: downloadUrl, error: urlError } = await getExportDownloadUrl(zipPath);

      if (urlError || !downloadUrl) {
        logger.error("Failed to generate download URL", {
          zipPath,
          error: urlError?.message || "No URL returned",
        });
        throw new Error(`Failed to generate download URL: ${urlError?.message || "Unknown error"}`);
      }

      logger.info("Export completed successfully", {
        userId,
        downloadUrl,
        exportedCount,
        failedCount,
      });

      metadata.set("status", "completed");
      metadata.set("progress", { current: photos.length, total: photos.length });

      return {
        success: true,
        downloadUrl,
        exportedCount,
        failedCount,
      };
    } catch (error) {
      logger.error("Export job failed", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });

      metadata.set("status", "failed");

      throw error;
    }
  },
});
