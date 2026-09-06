// @ts-nocheck - Supabase Database generic types not properly resolved in build context
import { withGeminiUsageContext } from "@/lib/gemini/usage";
import { task, logger } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectDeer, classifyDeerCrop } from "@/lib/gemini/client";
import type { GeminiMetrics } from "@/lib/gemini/client";
import { cropToMemory, uploadCropBuffer } from "@/lib/image/crop";
import { generateBlurDataUrl } from "@/lib/image/blurhash";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { detectionOnlySchema, type DetectionOnlyBox, type DetectionOnlyResult } from "@/lib/gemini/types";
import { detectionIdentity } from "@/lib/image/detection-identity";
import pLimit from "p-limit";
import { GEMINI_TASK_QUEUE, GEMINI_CROP_CONCURRENCY } from "@/lib/gemini/capacity";
import { generateFingerprint } from "./generate-fingerprint";
import { generateImageVariantsJob } from "./generate-image-variants";
import { estimateAntlerScore } from "@/lib/gemini/client";
import { passesCoarseCut, shouldAutomaticallyFingerprint, AUTOMATIC_FINGERPRINT_MIN_SCORE } from "@/lib/scoring/gates";
import { assertFullResolutionPath, assertFullResolutionDimensions } from "@/lib/image/analysis-source";
import sharp from "sharp";

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
  queue: GEMINI_TASK_QUEUE,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload: AnalyzePhotoPayload, { ctx }) => {
    const { imageId, batchId } = payload;

    logger.info("Starting photo analysis", { imageId, batchId });

    // Cast to typed client - TypeScript has issues with Database generic in Trigger.dev context
    const supabase = createAdminClient() as SupabaseClient<Database>;

    const claimAt = new Date().toISOString();
    const { data: claims, error: claimError } = await supabase.rpc("claim_photo_work", { p_image_id: imageId, p_kind: "analysis", p_claim_at: claimAt });
    if (claimError) throw new Error(claimError.message);
    if (claims === null || claims.length === 0) return { skipped: true, imageId, reason: "already_claimed_or_complete" };
    try {
      // Check if batch was cancelled before this job started
      const jobStartTime = new Date();
      const { data: batch } = await supabase
        .from('processing_batches')
        .select('cancelled_at')
        .eq('id', batchId)
        .single();

      if (batch?.cancelled_at) {
        const cancelledAt = new Date(batch.cancelled_at);
        if (cancelledAt < jobStartTime) {
          logger.info('Batch was cancelled before job started, skipping', {
            imageId,
            batchId,
            cancelledAt: batch.cancelled_at,
          });
          return {
            skipped: true,
            reason: 'batch_cancelled',
            imageId,
            batchId,
          };
        }
      }

      // Step 1: Fetch image record to get storage_path
      logger.info("Fetching image record", { imageId });

      const { data: imageRecord, error: fetchError } = await supabase
        .from("images")
        .select("id, file_path, user_id, variant_status, analysis_result")
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

      // Full-resolution guard (ADR 0003): never analyze a downscaled display
      // variant. Detection + every downstream crop derive from this source, so
      // a thumbnail/medium here would silently corrupt scoring (drop tines read
      // as kickers). Path check is definitive; the dimension check below catches
      // a variant that slipped past it.
      assertFullResolutionPath(imageRecord.file_path, "analyze-photo:source");

      // Defensive: ensure display variants exist even if the on-upload fan-out
      // missed this image. Gated on the authoritative variant_status (symmetric
      // with the job's own claim predicate); the idempotent claim dedupes any
      // overlap with the batch fan-out. Decoupled so a Gemini failure never
      // blocks thumbnails.
      if (imageRecord.variant_status !== "ready") {
        try {
          await generateImageVariantsJob.trigger({ imageId });
        } catch (variantErr) {
          logger.warn("Failed to enqueue variant generation (non-fatal)", {
            imageId,
            error: variantErr instanceof Error ? variantErr.message : String(variantErr),
          });
        }
      }

      // Step 2: Update image status to 'processing'
      const { error: statusError } = await supabase
        .from("images")
        .update({ detection_status: "processing" })
        .eq("id", imageId)
        .eq("analysis_claimed_at", claimAt)
        .eq("is_cancelled", false);

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

      // Step 4b: Generate blur data URL for placeholder
      const imageBufferNode = Buffer.from(imageBuffer);

      // Full-resolution guard (ADR 0003), dimension half: a real trail-cam
      // original is always far larger than the medium variant ceiling. If what
      // we downloaded is variant-scale, refuse rather than score a downscaled
      // image. Reuses the sharp decode the blur step needs anyway.
      const sourceMeta = await sharp(imageBufferNode).metadata();
      assertFullResolutionDimensions(sourceMeta.width, sourceMeta.height, "analyze-photo:source");

      const blurDataUrl = await generateBlurDataUrl(imageBufferNode);
      if (blurDataUrl) {
        logger.info("Blur data URL generated", { imageId, blurDataUrlLength: blurDataUrl.length });
      } else {
        logger.warn("Failed to generate blur data URL", { imageId });
      }

      // Step 5: Stage 1 - Call Gemini for deer detection (bounding boxes only)
      logger.info("Stage 1: Calling Gemini for deer detection", { imageId });

      // A persisted checkpoint (a retry after the worker died between detection and
      // the detection inserts) goes through the SAME schema as fresh Gemini output;
      // a stored value that fails to parse is treated as absent and re-detected.
      // Only the validated result is persisted, so a replay never re-records the
      // original call's metrics as a second batch_metrics row.
      const storedCheckpoint = detectionOnlySchema.safeParse(imageRecord.analysis_result);
      let detectionResult: DetectionOnlyResult;
      let detectionMetrics: GeminiMetrics | null = null;
      if (storedCheckpoint.success) {
        detectionResult = storedCheckpoint.data;
        logger.info("Stage 1: Reusing persisted detection checkpoint", { imageId });
      } else {
        const fresh = await withGeminiUsageContext({ batchId, imageId }, () => detectDeer(imageBase64, mimeType));
        detectionResult = fresh.result;
        detectionMetrics = fresh.metrics;
        const { error: checkpointError } = await supabase.from("images")
          .update({ analysis_result: detectionResult })
          .eq("id", imageId).eq("analysis_claimed_at", claimAt).eq("is_cancelled", false);
        if (checkpointError) throw new Error(`Could not save detection checkpoint: ${checkpointError.message}`);
      }

      logger.info("Stage 1: Gemini detection completed", {
        imageId,
        model: detectionMetrics?.modelUsed ?? "checkpoint",
        deerPresent: detectionResult.deer_present,
        detectionCount: detectionResult.detections.length,
        qualityScore: detectionResult.image_quality_score,
        tokenUsage: detectionMetrics?.totalTokens ?? 0,
      });

      // Persist detection metrics to batch_metrics (fresh calls only; see above)
      if (detectionMetrics !== null) {
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

      // Split detections by class (from filtered detections for processing)
      const deerDetections = filteredDetections.filter((d: DetectionOnlyBox) => d.detection_class === 'deer');
      const hogDetections = filteredDetections.filter((d: DetectionOnlyBox) => d.detection_class === 'hog');
      const cowDetections = filteredDetections.filter((d: DetectionOnlyBox) => d.detection_class === 'cow');
      const goatDetections = filteredDetections.filter((d: DetectionOnlyBox) => d.detection_class === 'goat');
      const vehicleDetections = filteredDetections.filter((d: DetectionOnlyBox) => d.detection_class === 'vehicle');
      const personDetections = filteredDetections.filter((d: DetectionOnlyBox) => d.detection_class === 'person');

      // Count raw (unfiltered) detections for presence flags to avoid confidence filter mismatch
      const rawHogCount = detectionResult.detections.filter((d: DetectionOnlyBox) => d.detection_class === 'hog').length;
      const rawCowCount = detectionResult.detections.filter((d: DetectionOnlyBox) => d.detection_class === 'cow').length;
      const rawGoatCount = detectionResult.detections.filter((d: DetectionOnlyBox) => d.detection_class === 'goat').length;
      const rawPersonCount = detectionResult.detections.filter((d: DetectionOnlyBox) => d.detection_class === 'person').length;
      const rawVehicleCount = detectionResult.detections.filter((d: DetectionOnlyBox) => d.detection_class === 'vehicle').length;

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

      // Bound paid calls within each job as well as across the shared queue.
      const limit = pLimit(GEMINI_CROP_CONCURRENCY);

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
          const detectionId = detectionIdentity(imageId, "buck", index);

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
            withGeminiUsageContext({ batchId, imageId, detectionId }, () => classifyDeerCrop(cropBase64, "image/jpeg")),
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

          // Step 2b: Score estimate (Step 2 of the trophy gate) — only for bucks
          // that pass the coarse cut (drop spikes). See lib/scoring/gates.ts.
          let scoreEstimate: { gross_score_estimate: number; confidence: number } | null = null;
          if (passesCoarseCut(classification.size_class)) {
            try {
              const { result: estimate, metrics: estimateMetrics } = await withGeminiUsageContext({ batchId, imageId, detectionId }, () => estimateAntlerScore(
                cropBase64,
                "image/jpeg"
              ));
              scoreEstimate = estimate;
              classificationMetrics.push({
                batch_id: batchId,
                image_id: imageId,
                gemini_call_type: "score_estimate",
                model_used: estimateMetrics.modelUsed,
                prompt_tokens: estimateMetrics.promptTokens,
                response_tokens: estimateMetrics.responseTokens,
                total_tokens: estimateMetrics.totalTokens,
                is_rate_limited: estimateMetrics.wasRateLimited,
                retry_count: estimateMetrics.retryCount,
                duration_ms: estimateMetrics.durationMs,
              });
              logger.info("Buck score estimate completed", {
                imageId,
                detectionId,
                grossScoreEstimate: estimate.gross_score_estimate,
                confidence: estimate.confidence,
              });
            } catch (estErr) {
              logger.warn("Score estimate failed; buck will not advance to fingerprint", {
                imageId,
                detectionId,
                error: estErr instanceof Error ? estErr.message : String(estErr),
              });
            }
          }

          const coords = computeBboxCoords(detection.box_2d);

          return {
            id: detectionId,
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
            // Columns are INTEGER (gross inches); round the model's number so the
            // re-queried band value matches what we computed here.
            score_estimate: scoreEstimate ? Math.round(scoreEstimate.gross_score_estimate) : null,
            score_estimate_confidence: scoreEstimate ? Math.round(scoreEstimate.confidence) : null,
          };
        })
      );

      // Process DOES/FAWNS in parallel (NO Gemini classification - just crop + upload)
      const doePromises = doeDetections.map((detection: DetectionOnlyBox, index: number) =>
        limit(async () => {
          const detectionId = detectionIdentity(imageId, "doe", index);

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
            id: detectionId,
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
          const detectionId = detectionIdentity(imageId, "other", index);

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
            id: detectionId,
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

      if (failedCount > 0) throw new Error(`${failedCount} detections could not be processed; retrying photo`);

      // Step 7: Insert detection records into database
      if (detectionRecords.length > 0) {
        logger.info("Inserting detection records", {
          imageId,
          recordCount: detectionRecords.length,
        });

        const { error: insertError } = await supabase
          .from("detections")
          .upsert(detectionRecords, { onConflict: "id", ignoreDuplicates: true });

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

        // Step 7b: Queue fingerprint generation for bucks whose score estimate
        // is at least 140 gross inches. The fingerprint
        // produces the authoritative score and the final trophy decision.
        // See docs/adr/0004-trophy-gated-ai-cost-cascade.md.
        const { data: insertedDetections } = await supabase
          .from("detections")
          .select("id, score_estimate")
          .eq("image_id", imageId)
          .eq("class", "deer")
          .not("score_estimate", "is", null);

        const eligibleDetections = (insertedDetections ?? []).filter((d) =>
          shouldAutomaticallyFingerprint(d.score_estimate)
        );

        if (eligibleDetections.length > 0) {
          logger.info("Queuing fingerprint generation for eligible bucks", {
            imageId,
            eligibleCount: eligibleDetections.length,
            minimumEstimatedScore: AUTOMATIC_FINGERPRINT_MIN_SCORE,
          });

          // Using triggerAndWait would block, so we use trigger() for async queuing
          const fingerprintPromises = eligibleDetections.map((detection) =>
            generateFingerprint.trigger({
              detectionId: detection.id,
              userId: imageRecord.user_id,
            }, { idempotencyKey: `upload-fingerprint:${detection.id}`, idempotencyKeyTTL: "30d" })
          );

          try {
            await Promise.all(fingerprintPromises);
            logger.info("Fingerprint generation jobs queued successfully", {
              imageId,
              count: eligibleDetections.length,
            });
          } catch (fpError) {
            // Don't fail the main job if fingerprint queuing fails
            logger.warn("Failed to queue some fingerprint generation jobs", {
              imageId,
              error: fpError instanceof Error ? fpError.message : String(fpError),
            });
          }
        }
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
          // Deer flags (use filtered for deer since it's the main feature)
          has_deer: deerDetections.length > 0,
          deer_count: deerDetections.length,
          // Multi-class presence flags (derived from raw detections to avoid confidence mismatch)
          has_hogs: rawHogCount > 0,
          has_cows: rawCowCount > 0,
          has_goats: rawGoatCount > 0,
          has_people: rawPersonCount > 0,
          has_vehicles: rawVehicleCount > 0,
          hog_count: hogDetections.length,
          cow_count: cowDetections.length,
          goat_count: goatDetections.length,
          people_count: personDetections.length,
          vehicle_count: vehicleDetections.length,
          // Existing fields
          blur_data_url: blurDataUrl,
          analysis_notes: detectionResult.analysis_notes,
          analyzed_at: new Date().toISOString(),
          classification: deerDetections.length > 0 ? "deer" :
                         (rawHogCount > 0 || rawCowCount > 0 || rawGoatCount > 0) ? "other" : null,
          confidence: (deerDetections.length > 0 || rawHogCount > 0 || rawCowCount > 0 || rawGoatCount > 0)
            ? Math.max(...detectionRecords.map((d) => d.confidence))
            : null,
          retry_count: 0, // Reset retry count on success
          error_message: null, // Clear any previous error
        })
        .eq("id", imageId)
        .eq("analysis_claimed_at", claimAt)
        .eq("is_cancelled", false);

      if (updateError) {
        logger.error("Failed to update image with analysis results", {
          imageId,
          error: updateError.message,
        });
        throw new Error(`Failed to persist photo completion: ${updateError.message}`)
      }

      // Terminal photo transitions update batch counters atomically in PostgreSQL.

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
          detection_status: ctx.attempt.number >= 3 ? "failed" : "pending",
          retry_count: currentRetryCount + 1,
          error_message: error instanceof Error ? error.message : String(error),
        })
        .eq("id", imageId)
        .eq("analysis_claimed_at", claimAt)
        .eq("is_cancelled", false);

      if (failError) {
        logger.error("Failed to mark image as failed", {
          imageId,
          error: failError.message,
        });
      }

      // Re-throw error so Trigger.dev can handle retry logic
      throw error;
    }
  },
});
