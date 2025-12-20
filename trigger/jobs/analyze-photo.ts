// @ts-nocheck - Supabase Database generic types not properly resolved in build context
import { task, logger } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectDeer, classifyDeerCrop } from "@/lib/gemini/client";
import type { GeminiMetrics } from "@/lib/gemini/client";
import { cropToMemory, uploadCropBuffer } from "@/lib/image/crop";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { DetectionOnlyBox } from "@/lib/gemini/types";
import crypto from "crypto";
import pLimit from "p-limit";

/**
 * Analyze Photo Job
 *
 * Processes a single image through Gemini vision model using a two-stage pipeline:
 * Stage 1 (Detection): Identify multi-class bounding boxes in full image (deer, hogs, cows, goats, vehicles, people)
 * Stage 2 (Classification): Classify each cropped BUCK for sex, antlers, age (does/non-deer get crops only)
 *
 * Workflow:
 * 1. Fetch image record from database to get storage_path
 * 2. Generate signed URL and download image as base64
 * 3. Stage 1: Call detectDeer() to get bounding boxes for all classes
 * 4. For each detection:
 *    a. Crop region and upload to storage
 *    b. Stage 2: Call classifyDeerCrop() ONLY for bucks (has_antlers=true)
 *    c. Does/non-deer get default classification (no Gemini call)
 *    d. Insert detection record with crop_file_path + classification + detection_class
 * 5. Update images table with: has_deer, deer_count, has_hogs, hog_count, etc.
 * 6. Update batch processed_images counter
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
  // Configurable via TRIGGER_CONCURRENCY_LIMIT environment variable
  queue: {
    concurrencyLimit: parseInt(process.env.TRIGGER_CONCURRENCY_LIMIT || '50', 10),
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

      // Step 5: Stage 1 - Call Gemini for deer detection (bounding boxes only)
      logger.info("Stage 1: Calling Gemini for deer detection", { imageId });

      const { result: detectionResult, metrics: detectionMetrics } = await detectDeer(imageBase64, mimeType);

      logger.info("Stage 1: Gemini detection completed", {
        imageId,
        model: detectionMetrics.modelUsed,
        deerPresent: detectionResult.deer_present,
        detectionCount: detectionResult.detections.length,
        qualityScore: detectionResult.image_quality_score,
        tokenUsage: detectionMetrics.totalTokens,
      });

      // Persist detection metrics to batch_metrics table
      const { error: detectionMetricsError } = await supabase
        .from("batch_metrics")
        .insert({
          batch_id: batchId,
          image_id: imageId,
          gemini_call_type: "detection",
          model_used: detectionMetrics.modelUsed,
          prompt_tokens: detectionMetrics.promptTokens,
          response_tokens: detectionMetrics.responseTokens,
          total_tokens: detectionMetrics.totalTokens,
          is_rate_limited: detectionMetrics.wasRateLimited,
          retry_count: detectionMetrics.retryCount,
          duration_ms: detectionMetrics.durationMs,
        });

      if (detectionMetricsError) {
        logger.warn("Failed to persist detection metrics", {
          imageId,
          error: detectionMetricsError.message,
        });
        // Don't throw - metrics are optional
      }

      // Filter out low-confidence detections to reduce false positives
      const MIN_CONFIDENCE = 70;
      const filteredDetections = detectionResult.detections.filter(
        (d: DetectionOnlyBox) => d.confidence >= MIN_CONFIDENCE
      );

      logger.info("Confidence filtering applied", {
        imageId,
        before: detectionResult.detections.length,
        after: filteredDetections.length,
        threshold: MIN_CONFIDENCE,
      });

      // Step 6: Stage 2 - PARALLEL processing with multi-class splitting
      // Keep imageBuffer for cropping operations
      const imageBufferForCrop = Buffer.from(imageBuffer);

      // Split detections by class
      const deerDetections = filteredDetections.filter((d: DetectionOnlyBox) => d.detection_class === 'deer');
      const hogDetections = filteredDetections.filter((d: DetectionOnlyBox) => d.detection_class === 'hog');
      const cowDetections = filteredDetections.filter((d: DetectionOnlyBox) => d.detection_class === 'cow');
      const goatDetections = filteredDetections.filter((d: DetectionOnlyBox) => d.detection_class === 'goat');
      const vehicleDetections = filteredDetections.filter((d: DetectionOnlyBox) => d.detection_class === 'vehicle');
      const personDetections = filteredDetections.filter((d: DetectionOnlyBox) => d.detection_class === 'person');

      // Within deer, split by antlers (for Stage 2 classification)
      const buckDetections = deerDetections.filter((d: DetectionOnlyBox) => d.has_antlers);
      const doeDetections = deerDetections.filter((d: DetectionOnlyBox) => !d.has_antlers);

      logger.info("Stage 2: Splitting detections by class", {
        imageId,
        deer: deerDetections.length,
        bucks: buckDetections.length,
        does: doeDetections.length,
        hogs: hogDetections.length,
        cows: cowDetections.length,
        goats: goatDetections.length,
        vehicles: vehicleDetections.length,
        people: personDetections.length,
      });

      // Create concurrency limiter (10 parallel Gemini calls max)
      const limit = pLimit(10);

      // Start timing Stage 2
      const stage2Start = Date.now();

      // Helper function to compute bbox coordinates
      // Gemini returns [ymin, xmin, ymax, xmax] on 0-1000 scale (Google's format)
      // See: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/bounding-box-detection
      const computeBboxCoords = (boxCoords: [number, number, number, number]) => {
        const [ymin, xmin, ymax, xmax] = boxCoords;
        const scale = 10;
        return {
          bboxX: Math.round(((xmin + xmax) / 2) * scale),
          bboxY: Math.round(((ymin + ymax) / 2) * scale),
          bboxWidth: Math.round((xmax - xmin) * scale),
          bboxHeight: Math.round((ymax - ymin) * scale),
        };
      };

      // Collect classification metrics for batch insert
      const classificationMetrics: Array<{
        batch_id: string;
        image_id: string;
        gemini_call_type: string;
        model_used: string;
        prompt_tokens: number;
        response_tokens: number;
        total_tokens: number;
        is_rate_limited: boolean;
        retry_count: number;
        duration_ms: number;
      }> = [];

      // Process BUCKS in parallel (with Gemini classification)
      const buckPromises = buckDetections.map((detection: DetectionOnlyBox, index: number) =>
        limit(async () => {
          const detectionId = crypto.randomUUID();

          logger.info(`Stage 2: Processing buck ${index + 1}/${buckDetections.length}`, {
            imageId,
            detectionId,
            confidence: detection.confidence,
          });

          // Step 1: Crop to memory (fast - no storage round-trip)
          const { buffer: cropBuffer, base64: cropBase64 } = await cropToMemory(
            imageBufferForCrop,
            detection.box_2d
          );

          // Step 2 & 3: Classify with Gemini AND upload crop in parallel
          const [classificationResult, cropPath] = await Promise.all([
            classifyDeerCrop(cropBase64, "image/jpeg"),
            uploadCropBuffer(supabase, cropBuffer, detectionId),
          ]);

          const { result: classification, metrics: classifyMetrics } = classificationResult;

          // Collect metrics for batch insert
          classificationMetrics.push({
            batch_id: batchId,
            image_id: imageId,
            gemini_call_type: "classification",
            model_used: classifyMetrics.modelUsed,
            prompt_tokens: classifyMetrics.promptTokens,
            response_tokens: classifyMetrics.responseTokens,
            total_tokens: classifyMetrics.totalTokens,
            is_rate_limited: classifyMetrics.wasRateLimited,
            retry_count: classifyMetrics.retryCount,
            duration_ms: classifyMetrics.durationMs,
          });

          logger.info("Buck classification completed", {
            imageId,
            detectionId,
            model: classifyMetrics.modelUsed,
            sex: classification.sex,
            sizeClass: classification.size_class,
            estimatedPointRange: classification.estimated_point_range,
            ageClass: classification.age_class,
            tokenUsage: classifyMetrics.totalTokens,
          });

          const coords = computeBboxCoords(detection.box_2d);

          return {
            image_id: imageId,
            bbox_x: coords.bboxX,
            bbox_y: coords.bboxY,
            bbox_width: coords.bboxWidth,
            bbox_height: coords.bboxHeight,
            crop_file_path: cropPath,
            head_bbox: null,
            species: "whitetail",
            sex: classification.sex,
            size_class: classification.size_class,
            estimated_point_range: classification.estimated_point_range,
            antler_description: classification.antler_description || null,
            age_class: classification.age_class,
            distinguishing_features: null,
            gemini_confidence: detection.confidence,
            deer_id: null,
            class: "deer",
            confidence: detection.confidence / 100,
          };
        })
      );

      // Process DOES/FAWNS in parallel (NO Gemini classification - just crop + upload)
      const doePromises = doeDetections.map((detection: DetectionOnlyBox, index: number) =>
        limit(async () => {
          const detectionId = crypto.randomUUID();

          logger.info(`Stage 2: Processing doe/fawn ${index + 1}/${doeDetections.length}`, {
            imageId,
            detectionId,
            confidence: detection.confidence,
          });

          // Step 1: Crop to memory (fast)
          const { buffer: cropBuffer } = await cropToMemory(
            imageBufferForCrop,
            detection.box_2d
          );

          // Step 2: Upload crop for audit trail
          const cropPath = await uploadCropBuffer(supabase, cropBuffer, detectionId);

          const coords = computeBboxCoords(detection.box_2d);

          // Default classification for does/fawns - no Gemini call needed
          return {
            image_id: imageId,
            bbox_x: coords.bboxX,
            bbox_y: coords.bboxY,
            bbox_width: coords.bboxWidth,
            bbox_height: coords.bboxHeight,
            crop_file_path: cropPath,
            head_bbox: null,
            species: "whitetail",
            sex: "doe" as const,
            size_class: null,
            estimated_point_range: null,
            antler_description: null,
            age_class: "unknown" as const,
            distinguishing_features: null,
            gemini_confidence: detection.confidence,
            deer_id: null,
            class: "deer",
            confidence: detection.confidence / 100,
          };
        })
      );

      // Process NON-DEER detections (hogs, cows, goats, vehicles, people) - crop only, NO Gemini classification
      const nonDeerDetections = [...hogDetections, ...cowDetections, ...goatDetections, ...vehicleDetections, ...personDetections];
      const nonDeerPromises = nonDeerDetections.map((detection: DetectionOnlyBox, index: number) =>
        limit(async () => {
          const detectionId = crypto.randomUUID();

          logger.info(`Stage 2: Processing non-deer ${index + 1}/${nonDeerDetections.length}`, {
            imageId,
            detectionId,
            detectionClass: detection.detection_class,
            confidence: detection.confidence,
          });

          // Crop to memory
          const { buffer: cropBuffer } = await cropToMemory(
            imageBufferForCrop,
            detection.box_2d
          );

          // Upload crop for audit trail
          const cropPath = await uploadCropBuffer(supabase, cropBuffer, detectionId);

          const coords = computeBboxCoords(detection.box_2d);

          return {
            image_id: imageId,
            bbox_x: coords.bboxX,
            bbox_y: coords.bboxY,
            bbox_width: coords.bboxWidth,
            bbox_height: coords.bboxHeight,
            crop_file_path: cropPath,
            head_bbox: null,
            species: null,
            sex: null,
            size_class: null,
            estimated_point_range: null,
            antler_description: null,
            age_class: null,
            distinguishing_features: null,
            gemini_confidence: detection.confidence,
            deer_id: null,
            detection_class: detection.detection_class,
            class: detection.detection_class,
            confidence: detection.confidence / 100,
          };
        })
      );

      // Wait for all processing to complete
      const [buckResults, doeResults, nonDeerResults] = await Promise.all([
        Promise.allSettled(buckPromises),
        Promise.allSettled(doePromises),
        Promise.allSettled(nonDeerPromises),
      ]);

      // End timing Stage 2
      const stage2Duration = Date.now() - stage2Start;

      // Combine and filter successful results
      const allResults = [...buckResults, ...doeResults, ...nonDeerResults];
      const detectionRecords = allResults
        .filter((r): r is PromiseFulfilledResult<typeof buckPromises extends Promise<infer T>[] ? T : never> =>
          r.status === 'fulfilled'
        )
        .map(r => r.value);

      // Log any failures
      const failedCount = allResults.filter(r => r.status === 'rejected').length;
      if (failedCount > 0) {
        const failedReasons = allResults
          .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
          .map(r => r.reason instanceof Error ? r.reason.message : String(r.reason));

        logger.warn("Some detections failed to process", {
          imageId,
          failedCount,
          successCount: detectionRecords.length,
          reasons: failedReasons.slice(0, 3), // Log first 3 reasons
        });
      }

      logger.info("Stage 2: Parallel processing completed", {
        imageId,
        durationMs: stage2Duration,
        bucksProcessed: buckResults.filter(r => r.status === 'fulfilled').length,
        doesProcessed: doeResults.filter(r => r.status === 'fulfilled').length,
        nonDeerProcessed: nonDeerResults.filter(r => r.status === 'fulfilled').length,
        totalSuccess: detectionRecords.length,
        totalFailed: failedCount,
      });

      // Batch insert classification metrics
      if (classificationMetrics.length > 0) {
        const { error: classMetricsError } = await supabase
          .from("batch_metrics")
          .insert(classificationMetrics);

        if (classMetricsError) {
          logger.warn("Failed to persist classification metrics", {
            imageId,
            count: classificationMetrics.length,
            error: classMetricsError.message,
          });
          // Don't throw - metrics are optional
        } else {
          logger.info("Classification metrics persisted", {
            imageId,
            count: classificationMetrics.length,
            totalTokens: classificationMetrics.reduce((sum, m) => sum + m.total_tokens, 0),
          });
        }
      }

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
      const hasDeer = detectionResult.deer_present;
      const deerCount = detectionResult.detections.length;

      const { error: updateError } = await supabase
        .from("images")
        .update({
          detection_status: "completed",
          // Deer flags
          has_deer: detectionResult.deer_present,
          deer_count: deerDetections.length,
          // Multi-class presence flags
          has_hogs: detectionResult.hogs_present,
          has_cows: detectionResult.cows_present,
          has_goats: detectionResult.goats_present,
          has_people: detectionResult.people_present,
          has_vehicles: detectionResult.vehicles_present,
          hog_count: hogDetections.length,
          cow_count: cowDetections.length,
          goat_count: goatDetections.length,
          people_count: personDetections.length,
          vehicle_count: vehicleDetections.length,
          // Existing fields
          analysis_notes: detectionResult.analysis_notes,
          analyzed_at: new Date().toISOString(),
          classification: detectionResult.deer_present ? "deer" : 
                         (detectionResult.hogs_present || detectionResult.cows_present || detectionResult.goats_present) ? "other" : null,
          confidence: (detectionResult.deer_present || detectionResult.hogs_present || detectionResult.cows_present || detectionResult.goats_present)
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

      // Note: Batch auto-completion is now handled by the batch_auto_complete database trigger
      // The trigger automatically marks batches as 'completed' when processed_images >= total_images

      logger.info("Photo analysis completed successfully", {
        imageId,
        batchId,
        detectionCount: detectionRecords.length,
        deer: deerDetections.length,
        bucks: buckDetections.length,
        does: doeDetections.length,
        hogs: hogDetections.length,
        cows: cowDetections.length,
        goats: goatDetections.length,
        vehicles: vehicleDetections.length,
        people: personDetections.length,
        qualityScore: detectionResult.image_quality_score,
      });

      return {
        success: true,
        imageId,
        batchId,
        detectionCount: detectionRecords.length,
        hasDeer: detectionResult.deer_present,
        deerCount: deerDetections.length,
        hogCount: hogDetections.length,
        cowCount: cowDetections.length,
        goatCount: goatDetections.length,
        vehicleCount: vehicleDetections.length,
        peopleCount: personDetections.length,
        qualityScore: detectionResult.image_quality_score,
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
