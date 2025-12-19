/**
 * Image Cropping Utilities
 *
 * Server-side image cropping using Sharp for ROI-based embedding generation.
 * Used to crop detected deer regions or user-defined ROIs before sending
 * to the embedding model.
 */

import sharp from 'sharp';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * ROI coordinates (normalized 0-10000 scale)
 */
export interface ROICoordinates {
  /** X coordinate of top-left corner (0-10000) */
  x: number;
  /** Y coordinate of top-left corner (0-10000) */
  y: number;
  /** Width of ROI (0-10000) */
  width: number;
  /** Height of ROI (0-10000) */
  height: number;
}

/**
 * Detection bounding box (normalized 0-1 scale from MegaDetector)
 */
export interface BoundingBox {
  /** X coordinate (0-1) */
  x: number;
  /** Y coordinate (0-1) */
  y: number;
  /** Width (0-1) */
  width: number;
  /** Height (0-1) */
  height: number;
}

/**
 * Convert normalized ROI coordinates (0-10000) to pixel coordinates
 */
function roiToPixels(
  roi: ROICoordinates,
  imageWidth: number,
  imageHeight: number
): { left: number; top: number; width: number; height: number } {
  return {
    left: Math.round((roi.x / 10000) * imageWidth),
    top: Math.round((roi.y / 10000) * imageHeight),
    width: Math.round((roi.width / 10000) * imageWidth),
    height: Math.round((roi.height / 10000) * imageHeight),
  };
}

/**
 * Convert normalized bounding box (0-1) to pixel coordinates
 */
function bboxToPixels(
  bbox: BoundingBox,
  imageWidth: number,
  imageHeight: number
): { left: number; top: number; width: number; height: number } {
  return {
    left: Math.round(bbox.x * imageWidth),
    top: Math.round(bbox.y * imageHeight),
    width: Math.round(bbox.width * imageWidth),
    height: Math.round(bbox.height * imageHeight),
  };
}

/**
 * Ensure crop region is within image bounds
 */
function clampRegion(
  region: { left: number; top: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number
): { left: number; top: number; width: number; height: number } {
  const left = Math.max(0, Math.min(region.left, imageWidth - 1));
  const top = Math.max(0, Math.min(region.top, imageHeight - 1));
  const width = Math.max(1, Math.min(region.width, imageWidth - left));
  const height = Math.max(1, Math.min(region.height, imageHeight - top));

  return { left, top, width, height };
}

/**
 * Crop image buffer to ROI region
 *
 * @param imageBuffer - Source image buffer (any format Sharp supports)
 * @param roi - ROI coordinates (normalized 0-10000 scale)
 * @returns Cropped image as JPEG buffer
 */
export async function cropToROI(
  imageBuffer: Buffer,
  roi: ROICoordinates
): Promise<Buffer> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Unable to read image dimensions');
  }

  const pixelRegion = roiToPixels(roi, metadata.width, metadata.height);
  const clampedRegion = clampRegion(pixelRegion, metadata.width, metadata.height);

  return image
    .extract(clampedRegion)
    .jpeg({ quality: 80 })
    .toBuffer();
}

/**
 * Crop image buffer to bounding box region
 *
 * @param imageBuffer - Source image buffer (any format Sharp supports)
 * @param bbox - Bounding box coordinates (normalized 0-1 scale)
 * @returns Cropped image as JPEG buffer
 */
export async function cropToBoundingBox(
  imageBuffer: Buffer,
  bbox: BoundingBox
): Promise<Buffer> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Unable to read image dimensions');
  }

  const pixelRegion = bboxToPixels(bbox, metadata.width, metadata.height);
  const clampedRegion = clampRegion(pixelRegion, metadata.width, metadata.height);

  return image
    .extract(clampedRegion)
    .jpeg({ quality: 80 })
    .toBuffer();
}

/**
 * Download image from URL and return as buffer
 *
 * @param imageUrl - URL to fetch image from
 * @returns Image buffer
 */
export async function fetchImageAsBuffer(imageUrl: string): Promise<Buffer> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout

  try {
    const response = await fetch(imageUrl, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Image fetch timed out after 30 seconds');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Crop image from URL to ROI region
 *
 * Convenience function that fetches the image, crops it, and returns the buffer.
 *
 * @param imageUrl - URL to fetch image from
 * @param roi - ROI coordinates (normalized 0-10000 scale)
 * @returns Cropped image as JPEG buffer
 */
export async function cropImageFromUrl(
  imageUrl: string,
  roi: ROICoordinates
): Promise<Buffer> {
  const imageBuffer = await fetchImageAsBuffer(imageUrl);
  return cropToROI(imageBuffer, roi);
}

/**
 * Crop image from URL to bounding box region
 *
 * Convenience function that fetches the image, crops it, and returns the buffer.
 *
 * @param imageUrl - URL to fetch image from
 * @param bbox - Bounding box coordinates (normalized 0-1 scale)
 * @returns Cropped image as JPEG buffer
 */
export async function cropImageFromUrlToBbox(
  imageUrl: string,
  bbox: BoundingBox
): Promise<Buffer> {
  const imageBuffer = await fetchImageAsBuffer(imageUrl);
  return cropToBoundingBox(imageBuffer, bbox);
}

/**
 * Get image dimensions from buffer
 *
 * @param imageBuffer - Image buffer
 * @returns Image dimensions { width, height }
 */
export async function getImageDimensions(
  imageBuffer: Buffer
): Promise<{ width: number; height: number }> {
  const metadata = await sharp(imageBuffer).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Unable to read image dimensions');
  }

  return {
    width: metadata.width,
    height: metadata.height,
  };
}

/**
 * Convert Gemini bounding box coordinates (0-1000 scale, [ymin, xmin, ymax, xmax])
 * to pixel coordinates for Sharp extraction
 *
 * Per Google docs: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/bounding-box-detection
 * Gemini returns bounding boxes as [ymin, xmin, ymax, xmax] normalized 0-1000
 */
function geminiBoxToPixels(
  boxCoords: [number, number, number, number],
  imageWidth: number,
  imageHeight: number
): { left: number; top: number; width: number; height: number } {
  const [ymin, xmin, ymax, xmax] = boxCoords;

  // Convert from 0-1000 scale to pixels
  const left = Math.round((xmin / 1000) * imageWidth);
  const top = Math.round((ymin / 1000) * imageHeight);
  const right = Math.round((xmax / 1000) * imageWidth);
  const bottom = Math.round((ymax / 1000) * imageHeight);

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

/**
 * Crop image and upload to Supabase Storage
 *
 * Takes an image buffer and Gemini bounding box coordinates, crops the image,
 * and uploads it to the photos bucket under the crops/ folder.
 *
 * @param supabase - Supabase client instance
 * @param imageBuffer - Source image buffer (any format Sharp supports)
 * @param boxCoords - Gemini bounding box [ymin, xmin, ymax, xmax] on 0-1000 scale
 * @param detectionId - Detection ID to use as filename
 * @returns Storage path like "crops/{detectionId}.jpg"
 */
export async function cropAndUpload(
  supabase: SupabaseClient,
  imageBuffer: Buffer,
  boxCoords: [number, number, number, number],
  detectionId: string
): Promise<string> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Unable to read image dimensions');
  }

  // Convert Gemini coordinates to pixel coordinates
  const pixelRegion = geminiBoxToPixels(boxCoords, metadata.width, metadata.height);

  // Ensure region is within image bounds
  const clampedRegion = clampRegion(pixelRegion, metadata.width, metadata.height);

  // Crop the image
  const croppedBuffer = await image
    .extract(clampedRegion)
    .jpeg({ quality: 80 })
    .toBuffer();

  // Upload to Supabase Storage
  const filePath = `crops/${detectionId}.jpg`;
  const { error } = await supabase.storage
    .from('photos')
    .upload(filePath, croppedBuffer, {
      contentType: 'image/jpeg',
      upsert: true, // Allow overwriting if needed
    });

  if (error) {
    throw new Error(`Failed to upload crop: ${error.message}`);
  }

  return filePath;
}

/**
 * Crop image to memory without uploading
 *
 * Takes an image buffer and Gemini bounding box coordinates, crops the image,
 * and returns both the buffer and base64-encoded string. This is optimized for
 * the parallel processing pipeline where classification happens before upload.
 *
 * @param imageBuffer - Source image buffer (any format Sharp supports)
 * @param boxCoords - Gemini bounding box [ymin, xmin, ymax, xmax] on 0-1000 scale
 * @returns Object with cropped buffer and base64 string
 */
export async function cropToMemory(
  imageBuffer: Buffer,
  boxCoords: [number, number, number, number]
): Promise<{ buffer: Buffer; base64: string }> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Unable to read image dimensions');
  }

  // Convert Gemini coordinates to pixel coordinates
  const pixelRegion = geminiBoxToPixels(boxCoords, metadata.width, metadata.height);

  // Ensure region is within image bounds
  const clampedRegion = clampRegion(pixelRegion, metadata.width, metadata.height);

  // Crop the image
  const croppedBuffer = await image
    .extract(clampedRegion)
    .jpeg({ quality: 80 })
    .toBuffer();

  return {
    buffer: croppedBuffer,
    base64: croppedBuffer.toString('base64'),
  };
}

/**
 * Upload a pre-cropped buffer to Supabase Storage
 *
 * Used after classification to upload the crop for audit trail.
 * This separates the upload from the crop operation for better
 * parallel processing.
 *
 * @param supabase - Supabase client instance
 * @param cropBuffer - Pre-cropped JPEG buffer
 * @param detectionId - Detection ID to use as filename
 * @returns Storage path like "crops/{detectionId}.jpg"
 */
export async function uploadCropBuffer(
  supabase: SupabaseClient,
  cropBuffer: Buffer,
  detectionId: string
): Promise<string> {
  const filePath = `crops/${detectionId}.jpg`;
  const { error } = await supabase.storage
    .from('photos')
    .upload(filePath, cropBuffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload crop: ${error.message}`);
  }

  return filePath;
}
