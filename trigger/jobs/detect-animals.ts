// @ts-nocheck - Supabase Database generic types not properly resolved in build context
import { task, logger } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { runMegaDetector } from "@/lib/replicate/client";
import { generateEmbeddingTask } from "./generate-embedding";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Detection as MegaDetectorDetection } from "@/lib/replicate/client";

/**
 * Detect Animals Job
 *
 * Processes a single image through MegaDetector AI model to identify wildlife.
 * This job is triggered for each image in a batch (fan-out pattern).
 *
 * Workflow:
 * 1. Fetch image record from database to get file_path
 * 2. Generate signed URL for the image (MegaDetector needs public URL)
 * 3. Call MegaDetector via Replicate API
 * 4. Parse detections (bbox coordinates, confidence scores)
 * 5. Filter to only "animal" category detections
 * 6. Convert normalized coordinates to pixel coordinates
 * 7. Store detection records in database
 * 8. Update image detection_status to 'completed' or 'failed'
 * 9. Increment batch processed_images counter
 *
 * Error Handling:
 * - Retry on transient failures (max 3 attempts)
 * - Update image status to 'failed' with error message
 * - Increment batch failed_images counter
 *
 * @module trigger/jobs/detect-animals
 */

interface DetectAnimalsPayload {
  imageId: string;
  batchId: string;
}

export const detectAnimals = task({
  id: "detect-animals",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload: DetectAnimalsPayload) => {
    const { imageId, batchId } = payload;

    logger.info("Starting animal detection", { imageId, batchId });

    // Cast to typed client - TypeScript has issues with Database generic in Trigger.dev context
    const supabase = createAdminClient() as SupabaseClient<Database>;

    try {
      // Step 1: Fetch image record to get file_path
      logger.info("Fetching image record", { imageId });

      const { data: imageRecord, error: fetchError } = await supabase
        .from("images")
        .select("id, file_path, user_id")
        .eq("id", imageId)
        .single();

      if (fetchError || !imageRecord) {
        logger.error("Failed to fetch image record", {
          imageId,
          error: fetchError?.message || "Image not found",
        });
        throw new Error(
          `Failed to fetch image: ${fetchError?.message || "Image not found"}`
        );
      }

      logger.info("Image record fetched", {
        imageId,
        filePath: imageRecord.file_path,
      });

      // Step 2: Update image status to 'processing'
      const { error: statusError } = await supabase
        .from("images")
        .update({ detection_status: "processing" })
        .eq("id", imageId);

      if (statusError) {
        logger.warn("Failed to update image status to processing", {
          imageId,
          error: statusError.message,
        });
        // Don't throw - we can continue with detection
      }

      // Step 3: Generate signed URL for the image
      // MegaDetector requires a publicly accessible URL
      logger.info("Generating signed URL", { imageId });

      const { data: signedUrlData, error: signedUrlError } =
        await supabase.storage
          .from("photos")
          .createSignedUrl(imageRecord.file_path, 3600); // 1 hour expiry

      if (signedUrlError || !signedUrlData) {
        logger.error("Failed to generate signed URL", {
          imageId,
          error: signedUrlError?.message || "No signed URL returned",
        });
        throw new Error(
          `Failed to generate signed URL: ${signedUrlError?.message || "Unknown error"}`
        );
      }

      const imageUrl = signedUrlData.signedUrl;
      logger.info("Signed URL generated", { imageId });

      // Step 4: Call MegaDetector via Replicate
      logger.info("Calling MegaDetector", { imageId, imageUrl });

      const megaDetectorOutput = await runMegaDetector(imageUrl);

      logger.info("MegaDetector completed", {
        imageId,
        detectionCount: megaDetectorOutput.detections.length,
      });

      // Step 5: Filter to only "animal" category detections
      const animalDetections = megaDetectorOutput.detections.filter(
        (detection: MegaDetectorDetection) =>
          detection.category === "animal"
      );

      logger.info("Filtered to animal detections", {
        imageId,
        totalDetections: megaDetectorOutput.detections.length,
        animalDetections: animalDetections.length,
      });

      // Step 6: Convert normalized coordinates to pixel coordinates
      // MegaDetector returns bbox as [x, y, width, height] normalized to [0, 1]
      // We need to convert to pixel coordinates using image dimensions
      const imageDimensions = megaDetectorOutput.info.image_dimensions;
      const [imageWidth, imageHeight] = imageDimensions;

      logger.info("Image dimensions", {
        imageId,
        width: imageWidth,
        height: imageHeight,
      });

      // Step 7: Prepare detection records for database insert
      const detectionRecords = animalDetections.map(
        (detection: MegaDetectorDetection) => {
          const [x, y, width, height] = detection.bbox;

          // Convert normalized coordinates to pixel coordinates
          const bboxX = Math.round(x * imageWidth);
          const bboxY = Math.round(y * imageHeight);
          const bboxWidth = Math.round(width * imageWidth);
          const bboxHeight = Math.round(height * imageHeight);

          return {
            image_id: imageId,
            bbox_x: bboxX,
            bbox_y: bboxY,
            bbox_width: bboxWidth,
            bbox_height: bboxHeight,
            class: detection.category, // "animal"
            confidence: detection.conf,
            deer_id: null, // Not linked to deer profile yet
          };
        }
      );

      // Step 8: Insert detection records into database
      if (detectionRecords.length > 0) {
        logger.info("Inserting detection records", {
          imageId,
          recordCount: detectionRecords.length,
        });

        const { error: insertError } = await supabase
          .from("detections")
          .insert(detectionRecords);

        if (insertError) {
          logger.error("Failed to insert detections", {
            imageId,
            error: insertError.message,
          });
          throw new Error(`Failed to insert detections: ${insertError.message}`);
        }

        logger.info("Detection records inserted", {
          imageId,
          recordCount: detectionRecords.length,
        });

        // Step 8b: Trigger embedding generation for each detection
        // Query the inserted detections to get their IDs
        const { data: insertedDetections, error: fetchDetectionsError } = await supabase
          .from("detections")
          .select("id")
          .eq("image_id", imageId)
          .order("created_at", { ascending: false })
          .limit(detectionRecords.length);

        if (fetchDetectionsError) {
          logger.warn("Failed to fetch inserted detection IDs for embedding", {
            imageId,
            error: fetchDetectionsError.message,
          });
          // Don't throw - detection processing succeeded, embedding can be retried later
        } else if (insertedDetections && insertedDetections.length > 0) {
          logger.info("Triggering embedding generation for detections", {
            imageId,
            detectionCount: insertedDetections.length,
          });

          // Trigger embedding generation for each detection
          for (const detection of insertedDetections) {
            try {
              await generateEmbeddingTask.trigger({
                detectionId: detection.id,
                imageId,
              });
              logger.info("Embedding generation triggered", {
                detectionId: detection.id,
                imageId,
              });
            } catch (triggerError) {
              logger.warn("Failed to trigger embedding generation", {
                detectionId: detection.id,
                imageId,
                error: triggerError instanceof Error ? triggerError.message : String(triggerError),
              });
              // Don't throw - detection processing succeeded, embedding can be retried later
            }
          }
        }
      } else {
        logger.info("No animal detections to insert", { imageId });
      }

      // Step 9: Update image detection_status to 'completed'
      const { error: completeError } = await supabase
        .from("images")
        .update({
          detection_status: "completed",
          retry_count: 0, // Reset retry count on success
          error_message: null, // Clear any previous error
        })
        .eq("id", imageId);

      if (completeError) {
        logger.error("Failed to mark image as completed", {
          imageId,
          error: completeError.message,
        });
        // Don't throw - detections are already saved
      }

      // Step 10: Increment batch processed_images and successful_images counters
      logger.info("Updating batch counters", { batchId });

      const { error: batchError } = await supabase.rpc(
        "increment_batch_counters",
        {
          batch_id: batchId,
          increment_processed: 1,
          increment_successful: 1,
        }
      );

      if (batchError) {
        logger.error("Failed to update batch counters", {
          batchId,
          error: batchError.message,
        });
        // Don't throw - detection processing succeeded
      }

      logger.info("Animal detection completed successfully", {
        imageId,
        batchId,
        detectionCount: detectionRecords.length,
      });

      return {
        success: true,
        imageId,
        batchId,
        detectionCount: detectionRecords.length,
      };
    } catch (error) {
      // Error handling: Update image status to 'failed'
      logger.error("Animal detection failed", {
        imageId,
        batchId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Increment retry count
      const { data: currentImage } = await supabase
        .from("images")
        .select("retry_count")
        .eq("id", imageId)
        .single();

      const currentRetryCount = (currentImage as { retry_count: number })?.retry_count || 0;

      const { error: failError } = await supabase
        .from("images")
        .update({
          detection_status: "failed",
          retry_count: currentRetryCount + 1,
          error_message: error instanceof Error ? error.message : String(error),
        })
        .eq("id", imageId);

      if (failError) {
        logger.error("Failed to mark image as failed", {
          imageId,
          error: failError.message,
        });
      }

      // Increment batch processed_images and failed_images counters
      const { error: batchError } = await supabase.rpc(
        "increment_batch_counters",
        {
          batch_id: batchId,
          increment_processed: 1,
          increment_failed: 1,
        }
      );

      if (batchError) {
        logger.error("Failed to update batch counters on error", {
          batchId,
          error: batchError.message,
        });
      }

      // Re-throw error so Trigger.dev can handle retry logic
      throw error;
    }
  },
});
