// @ts-nocheck - Supabase Database generic types not properly resolved in build context
import { task, logger } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { Sam2Client } from "@/lib/sam2/client";
import { Sam2HealthListener } from "@/lib/sam2/health";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Detection as Sam2Detection } from "@/lib/sam2/client";

/**
 * Analyze Photo with SAM2 Job
 *
 * Processes a single image through SAM2 model on Vast.ai GPU worker for deer and antler detection.
 * This job is an alternative to the Gemini pipeline when SAM2_PIPELINE_ENABLED=true.
 *
 * Workflow:
 * 1. Check SAM2 worker health status and wait for ready state (max 3 minutes)
 * 2. Fetch image record from database to get storage_path
 * 3. Generate signed URL for the image
 * 4. Call SAM2 worker API for deer/antler detection
 * 5. Parse structured response with bounding boxes and scores
 * 6. Update images table with: has_deer, deer_count, analysis_source='sam2', analyzed_at
 * 7. Insert detection records with: bbox (center format), sam2_deer_score, sam2_antler_score, antler_bbox
 * 8. Update batch processed_images counter
 *
 * Error Handling:
 * - Retry on transient worker failures (max 3 attempts)
 * - Update image status to 'failed' with error message
 * - Increment batch failed_images counter
 * - Handle worker warmup timeout (3 minute limit)
 *
 * @module trigger/jobs/analyze-photo-sam2
 */

interface AnalyzePhotoSam2Payload {
  imageId: string;
  batchId: string;
}

export const analyzePhotoSam2 = task({
  id: "analyze-photo-sam2",
  // Limit concurrent GPU calls to manage worker capacity
  queue: {
    concurrencyLimit: 10,
  },
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
  },
  run: async (payload: AnalyzePhotoSam2Payload) => {
    const { imageId, batchId } = payload;

    logger.info("Starting SAM2 photo analysis", { imageId, batchId });

    // Cast to typed client - TypeScript has issues with Database generic in Trigger.dev context
    const supabase = createAdminClient() as SupabaseClient<Database>;

    try {
      // Step 1: Get worker URL and perform health check
      const workerUrl = process.env.SAM2_WORKER_URL;
      if (!workerUrl) {
        throw new Error("SAM2_WORKER_URL environment variable is not set");
      }

      logger.info("Checking SAM2 worker health", { workerUrl });

      const healthListener = new Sam2HealthListener(workerUrl);
      try {
        // Wait up to 3 minutes for worker to become ready
        await healthListener.waitForReady(180000);
        logger.info("SAM2 worker is ready", { workerUrl });
      } catch (healthError) {
        logger.error("SAM2 worker health check failed", {
          workerUrl,
          error: healthError instanceof Error ? healthError.message : String(healthError),
        });
        throw new Error(
          `SAM2 worker not ready: ${healthError instanceof Error ? healthError.message : String(healthError)}`
        );
      } finally {
        healthListener.close();
      }

      // Step 2: Fetch image record to get storage_path
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

      // Step 3: Update image status to 'processing'
      const { error: statusError } = await supabase
        .from("images")
        .update({ detection_status: "processing" })
        .eq("id", imageId);

      if (statusError) {
        logger.warn("Failed to update image status to processing", {
          imageId,
          error: statusError.message,
        });
        // Don't throw - we can continue with analysis
      }

      // Step 4: Generate signed URL for the image (1 hour expiry)
      logger.info("Generating signed URL", { imageId });

      const { data: signedUrlData, error: signedUrlError } =
        await supabase.storage
          .from("photos")
          .createSignedUrl(imageRecord.file_path, 3600);

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

      // Step 5: Call SAM2 worker API for analysis
      logger.info("Calling SAM2 for photo analysis", { imageId, imageUrl });

      const sam2Client = new Sam2Client(workerUrl);
      const analysisResult = await sam2Client.analyzeImage(imageUrl, {
        timeout: 60000, // 60 second timeout for analysis
      });

      logger.info("SAM2 analysis completed", {
        imageId,
        deerPresent: analysisResult.deer_present,
        detectionCount: analysisResult.detections.length,
        processingTimeMs: analysisResult.processing_time_ms,
        model: analysisResult.model?.name ?? "unknown",
      });

      // Step 6: Prepare detection records for database insert
      // SAM2 returns [xmin, ymin, xmax, ymax] in pixels
      // We need to convert to center-based format (x, y, width, height) on 0-10000 scale
      //
      // Note: We need to determine image dimensions to normalize coordinates
      // For now, we'll fetch the image to get dimensions
      logger.info("Fetching image dimensions for normalization", { imageId });

      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(
          `Failed to download image: ${imageResponse.status} ${imageResponse.statusText}`
        );
      }

      const imageBuffer = await imageResponse.arrayBuffer();

      // Use sharp to get image dimensions
      const sharp = (await import('sharp')).default;
      const imageMetadata = await sharp(Buffer.from(imageBuffer)).metadata();

      if (!imageMetadata.width || !imageMetadata.height) {
        throw new Error("Failed to determine image dimensions");
      }

      const imgWidth = imageMetadata.width;
      const imgHeight = imageMetadata.height;

      logger.info("Image dimensions determined", {
        imageId,
        width: imgWidth,
        height: imgHeight,
      });

      const detectionRecords = analysisResult.detections.map(
        (detection: Sam2Detection, index: number) => {
          // SAM2 returns [xmin, ymin, xmax, ymax] in pixels
          const [xmin, ymin, xmax, ymax] = detection.deer_box_xyxy;

          // Convert pixel coordinates to 0-10000 normalized scale
          const bboxX = Math.round(((xmin + xmax) / 2 / imgWidth) * 10000);
          const bboxY = Math.round(((ymin + ymax) / 2 / imgHeight) * 10000);
          const bboxWidth = Math.round(((xmax - xmin) / imgWidth) * 10000);
          const bboxHeight = Math.round(((ymax - ymin) / imgHeight) * 10000);

          // DEBUG: Log coordinate transformation for first 3 detections
          if (index < 3) {
            logger.info("SAM2 coordinate transformation debug", {
              imageId,
              detectionIndex: index,
              raw_deer_box: detection.deer_box_xyxy,
              image_dims: { width: imgWidth, height: imgHeight },
              normalized: {
                centerX: bboxX,
                centerY: bboxY,
                width: bboxWidth,
                height: bboxHeight,
              },
              deer_score: detection.deer_score,
              has_antlers: detection.antler_box_xyxy !== null,
            });
          }

          // Convert antler_bbox to JSONB format if present
          let antlerBbox = null;
          if (detection.antler_box_xyxy) {
            const [antlerXmin, antlerYmin, antlerXmax, antlerYmax] = detection.antler_box_xyxy;
            antlerBbox = {
              x: Math.round((antlerXmin / imgWidth) * 10000),
              y: Math.round((antlerYmin / imgHeight) * 10000),
              width: Math.round(((antlerXmax - antlerXmin) / imgWidth) * 10000),
              height: Math.round(((antlerYmax - antlerYmin) / imgHeight) * 10000),
            };
          }

          return {
            image_id: imageId,
            bbox_x: bboxX,
            bbox_y: bboxY,
            bbox_width: bboxWidth,
            bbox_height: bboxHeight,
            antler_bbox: antlerBbox,
            sam3_deer_score: detection.deer_score,
            sam3_antler_score: detection.antler_score,
            analysis_source: 'sam3',
            // Infer sex based on presence of antlers (bucks have antlers, does don't)
            sex: detection.antler_box_xyxy ? 'buck' : 'doe',
            species: 'whitetail', // SAM2 doesn't distinguish species, default to whitetail
            // Legacy fields for backward compatibility
            class: 'deer',
            confidence: detection.deer_score, // Already 0-1 range from SAM2
            deer_id: null, // Not linked to deer profile yet
          };
        }
      );

      logger.info("Detection records prepared", {
        imageId,
        recordCount: detectionRecords.length,
      });

      // Step 7: Insert detection records into database
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
      } else {
        logger.info("No deer detections to insert", { imageId });
      }

      // Step 8: Update image with analysis results
      const hasDeer = analysisResult.deer_present;
      const deerCount = analysisResult.detections.length;

      const { error: updateError } = await supabase
        .from("images")
        .update({
          detection_status: "completed",
          has_deer: hasDeer,
          deer_count: deerCount,
          analyzed_at: new Date().toISOString(),
          // Legacy fields for backward compatibility
          classification: hasDeer ? "deer" : null,
          confidence: hasDeer
            ? Math.max(...detectionRecords.map((d) => d.confidence))
            : null,
          retry_count: 0, // Reset retry count on success
          error_message: null, // Clear any previous error
        })
        .eq("id", imageId);

      if (updateError) {
        logger.error("Failed to update image with analysis results", {
          imageId,
          error: updateError.message,
        });
        // Don't throw - detections are already saved
      }

      // Step 9: Increment batch processed_images and successful_images counters
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
        // Don't throw - analysis processing succeeded
      }

      logger.info("SAM2 photo analysis completed successfully", {
        imageId,
        batchId,
        detectionCount: detectionRecords.length,
        hasDeer,
        deerCount,
        processingTimeMs: analysisResult.processing_time_ms,
      });

      return {
        success: true,
        imageId,
        batchId,
        detectionCount: detectionRecords.length,
        hasDeer,
        deerCount,
        processingTimeMs: analysisResult.processing_time_ms,
      };
    } catch (error) {
      // Error handling: Update image status to 'failed'
      logger.error("SAM2 photo analysis failed", {
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

      const currentRetryCount =
        (currentImage as { retry_count: number })?.retry_count || 0;

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
