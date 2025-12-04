/**
 * Image Cropping Utilities
 *
 * Server-side image cropping using Sharp for ROI-based embedding generation.
 * Used to crop detected deer regions or user-defined ROIs before sending
 * to the embedding model.
 */

import sharp from 'sharp';

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
    .jpeg({ quality: 90 })
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
    .jpeg({ quality: 90 })
    .toBuffer();
}

/**
 * Download image from URL and return as buffer
 *
 * @param imageUrl - URL to fetch image from
 * @returns Image buffer
 */
export async function fetchImageAsBuffer(imageUrl: string): Promise<Buffer> {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
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
