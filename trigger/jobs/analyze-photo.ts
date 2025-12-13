// @ts-nocheck - Supabase Database generic types not properly resolved in build context
import { task, logger } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzePhoto as analyzeWithGemini } from "@/lib/gemini/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { DeerDetectionResult } from "@/lib/gemini/types";

/**
 * Analyze Photo Job
 *
 * Processes a single image through Gemini vision model for deer detection and classification.
 * This job replaces the previous detect-animals + generate-embedding pipeline.
 *
 * Workflow:
 * 1. Fetch image record from database to get storage_path
 * 2. Generate signed URL and download image as base64
 * 3. Call Gemini vision API for analysis (species, sex, antler points, etc.)
 * 4. Parse structured response with deer detections
 * 5. Update images table with: has_deer, deer_count, analysis_notes, analyzed_at
 * 6. Insert detection records with: species, sex, antler_points, age_class, gemini_confidence, head_bbox
 * 7. Update batch processed_images counter
 *
 * Error Handling:
 * - Retry on transient Gemini API failures (max 3 attempts)
 * - Update image status to 'failed' with error message
 * - Increment batch failed_images counter
 * - Handle rate limits with exponential backoff (built into Gemini client)
 *
 * @module trigger/jobs/analyze-photo
 */

interface AnalyzePhotoPayload {
  imageId: string;
  batchId: string;
}

export const analyzePhoto = task({
  id: "analyze-photo",
  // Limit concurrent Gemini API calls to manage rate limits
  // Gemini Flash has generous limits but we want controlled parallelism
  queue: {
    concurrencyLimit: 15,
  },
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload: AnalyzePhotoPayload) => {
    const { imageId, batchId } = payload;

    logger.info("Starting photo analysis", { imageId, batchId });

    // Cast to typed client - TypeScript has issues with Database generic in Trigger.dev context
    const supabase = createAdminClient() as SupabaseClient<Database>;

    try {
      // Step 1: Fetch image record to get storage_path
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
        // Don't throw - we can continue with analysis
      }

      // Step 3: Generate signed URL for the image
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

      // Step 4: Download image as base64
      logger.info("Downloading image for Gemini", { imageId, imageUrl });

      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(
          `Failed to download image: ${imageResponse.status} ${imageResponse.statusText}`
        );
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const imageBase64 = Buffer.from(imageBuffer).toString("base64");

      // Determine MIME type from content-type header or file extension
      const contentType =
        imageResponse.headers.get("content-type") || "image/jpeg";
      const mimeType = contentType.split(";")[0]; // Remove charset if present

      logger.info("Image downloaded for analysis", {
        imageId,
        mimeType,
        sizeBytes: imageBuffer.byteLength,
      });

      // Step 5: Call Gemini vision API for analysis
      logger.info("Calling Gemini for photo analysis", { imageId });

      const analysisResult = await analyzeWithGemini(imageBase64, mimeType);

      logger.info("Gemini analysis completed", {
        imageId,
        deerPresent: analysisResult.deer_present,
        detectionCount: analysisResult.detections.length,
        qualityScore: analysisResult.image_quality_score,
      });

      // Filter out low-confidence detections to reduce false positives
      const MIN_CONFIDENCE = 70;
      const filteredDetections = analysisResult.detections.filter(
        (d: DeerDetectionResult) => d.confidence >= MIN_CONFIDENCE
      );

      logger.info("Confidence filtering applied", {
        imageId,
        before: analysisResult.detections.length,
        after: filteredDetections.length,
        threshold: MIN_CONFIDENCE,
      });

      // Step 6: Prepare detection records for database insert
      // Convert Gemini's normalized coordinates (0-1000) to our scaled format (0-10000)
      //
      // Gemini returns box_2d in [ymin, xmin, ymax, xmax] format (Google's documented format)
      // See: https://ai.google.dev/gemini-api/docs/image-understanding
      const detectionRecords = filteredDetections.map(
        (detection: DeerDetectionResult, index: number) => {
          // Gemini returns [ymin, xmin, ymax, xmax] on 0-1000 scale
          const [ymin, xmin, ymax, xmax] = detection.box_2d;

          // Scale coordinates from 0-1000 to 0-10000 for integer storage
          const scale = 10;
          const bboxWidth = Math.round((xmax - xmin) * scale);
          const bboxHeight = Math.round((ymax - ymin) * scale);

          // DEBUG: Log coordinate transformation for first 3 detections
          if (index < 3) {
            logger.info("Coordinate transformation debug", {
              imageId,
              detectionIndex: index,
              raw_box_2d: detection.box_2d,
              interpreted_as: { xmin, ymin, xmax, ymax },
              calculated: {
                width: bboxWidth,
                height: bboxHeight,
                centerX: Math.round(((xmin + xmax) / 2) * scale),
                centerY: Math.round(((ymin + ymax) / 2) * scale),
              },
              aspect_ratio: (bboxWidth / bboxHeight).toFixed(2),
              // Normalized percentages for visual verification
              normalized_box: {
                left_pct: (xmin / 10).toFixed(1) + "%",
                top_pct: (ymin / 10).toFixed(1) + "%",
                right_pct: (xmax / 10).toFixed(1) + "%",
                bottom_pct: (ymax / 10).toFixed(1) + "%",
              },
            });
          }

          // Convert to CENTER coordinates (YOLO format) for overlay compatibility
          // Overlay expects (x, y) as center point, not top-left corner
          const bboxX = Math.round(((xmin + xmax) / 2) * scale);
          const bboxY = Math.round(((ymin + ymax) / 2) * scale);

          // Convert head_bbox to JSONB format if present
          let headBbox = null;
          if (detection.head_bbox) {
            headBbox = {
              x: Math.round(detection.head_bbox.xmin * scale),
              y: Math.round(detection.head_bbox.ymin * scale),
              width: Math.round(
                (detection.head_bbox.xmax - detection.head_bbox.xmin) * scale
              ),
              height: Math.round(
                (detection.head_bbox.ymax - detection.head_bbox.ymin) * scale
              ),
            };
          }

          return {
            image_id: imageId,
            bbox_x: bboxX,
            bbox_y: bboxY,
            bbox_width: bboxWidth,
            bbox_height: bboxHeight,
            head_bbox: headBbox,
            species: detection.species,
            sex: detection.sex,
            antler_points: detection.antler_points,
            antler_description: detection.antler_description || null,
            age_class: detection.age_class,
            distinguishing_features: detection.distinguishing_features,
            gemini_confidence: detection.confidence,
            deer_id: null, // Not linked to deer profile yet
            // Legacy fields (keep for backward compatibility)
            class: "animal",
            confidence: detection.confidence / 100, // Convert 0-100 to 0-1
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
          analysis_notes: analysisResult.analysis_notes,
          analyzed_at: new Date().toISOString(),
          // Legacy fields for backward compatibility
          classification: hasDeer ? "animal" : null,
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

      logger.info("Photo analysis completed successfully", {
        imageId,
        batchId,
        detectionCount: detectionRecords.length,
        hasDeer,
        deerCount,
        qualityScore: analysisResult.image_quality_score,
      });

      return {
        success: true,
        imageId,
        batchId,
        detectionCount: detectionRecords.length,
        hasDeer,
        deerCount,
        qualityScore: analysisResult.image_quality_score,
      };
    } catch (error) {
      // Error handling: Update image status to 'failed'
      logger.error("Photo analysis failed", {
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
