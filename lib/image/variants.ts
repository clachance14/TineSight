/**
 * Image Variant Generation
 *
 * Server-side generation of display variants from a source trail-camera photo:
 *   - thumbnail: small WebP for the photo grid (the iOS-Safari memory fix)
 *   - medium:    WebP for the lightbox / public Showcase
 *
 * The original is never modified — variants are additive (see ADR 0003).
 *
 * Hardened for real trail-cam JPEGs: honors EXIF orientation (.rotate()),
 * normalizes colorspace, guards against decompression-bomb inputs, and tolerates
 * truncated/malformed files (failOn: 'none').
 */

import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Storage bucket holding originals, crops, and variants. */
const STORAGE_BUCKET = 'photos';

/** Cap input at 60 megapixels to avoid decompression-bomb memory blowups. */
const MAX_INPUT_PIXELS = 60_000_000;

/**
 * Variant lifecycle states, mirroring the images.variant_status DB constraint.
 * The generated Supabase types widen this to `string`; use this app-level union
 * wherever the value is read/written so the invariant survives in code.
 */
export type VariantStatus = 'pending' | 'processing' | 'ready' | 'failed';

/**
 * Variant size/quality budgets (see ADR 0002).
 * Dimensions are a bounding box (fit: 'inside'). Byte targets are advisory only
 * (thumbnail ~<40KB, medium ~<200KB) — we don't chase a byte ceiling into
 * quality/retry churn, so they live in this comment, not as enforced config.
 */
export const VARIANT_CONFIG = {
  thumbnail: { maxDim: 400, quality: 72, effort: 4 },
  medium: { maxDim: 1080, quality: 80, effort: 4 },
} as const;

export interface ImageVariants {
  thumbnail: Buffer;
  medium: Buffer;
  thumbnailBytes: number;
  mediumBytes: number;
}

export interface VariantPaths {
  thumbnailPath: string;
  mediumPath: string;
}

/**
 * Deterministic storage paths for an image's variants. Deterministic so retries
 * and backfill are idempotent (upsert overwrites equivalent bytes).
 */
export function variantStoragePaths(imageId: string): VariantPaths {
  return {
    thumbnailPath: `thumbnails/${imageId}.webp`,
    mediumPath: `medium/${imageId}.webp`,
  };
}

/**
 * Generate thumbnail + medium WebP variants from a source image buffer.
 *
 * @param imageBuffer - Source image (any format Sharp decodes)
 * @returns Both variant buffers and their byte sizes
 * @throws if the image cannot be decoded at all
 */
export async function generateImageVariants(
  imageBuffer: Buffer
): Promise<ImageVariants> {
  // Fresh pipeline per variant: Sharp instances are single-use once consumed.
  const pipeline = (): sharp.Sharp =>
    sharp(imageBuffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: 'none', // tolerate truncated/partial trail-cam JPEGs
    })
      .rotate() // bake in EXIF orientation, then strip metadata on encode
      .toColorspace('srgb');

  const thumbnail = await pipeline()
    .resize(VARIANT_CONFIG.thumbnail.maxDim, VARIANT_CONFIG.thumbnail.maxDim, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality: VARIANT_CONFIG.thumbnail.quality,
      effort: VARIANT_CONFIG.thumbnail.effort,
    })
    .toBuffer();

  const medium = await pipeline()
    .resize(VARIANT_CONFIG.medium.maxDim, VARIANT_CONFIG.medium.maxDim, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({
      quality: VARIANT_CONFIG.medium.quality,
      effort: VARIANT_CONFIG.medium.effort,
    })
    .toBuffer();

  return {
    thumbnail,
    medium,
    thumbnailBytes: thumbnail.length,
    mediumBytes: medium.length,
  };
}

/**
 * Upload both variants to storage at their deterministic paths.
 * Additive only — never touches the original. Uses upsert for retry idempotency.
 *
 * @returns The storage paths to persist on the images row
 */
export async function uploadImageVariants(
  supabase: SupabaseClient,
  imageId: string,
  variants: ImageVariants
): Promise<VariantPaths> {
  const paths = variantStoragePaths(imageId);

  const [thumbResult, mediumResult] = await Promise.all([
    supabase.storage.from(STORAGE_BUCKET).upload(paths.thumbnailPath, variants.thumbnail, {
      contentType: 'image/webp',
      upsert: true,
    }),
    supabase.storage.from(STORAGE_BUCKET).upload(paths.mediumPath, variants.medium, {
      contentType: 'image/webp',
      upsert: true,
    }),
  ]);

  if (thumbResult.error) {
    throw new Error(`Failed to upload thumbnail: ${thumbResult.error.message}`);
  }
  if (mediumResult.error) {
    throw new Error(`Failed to upload medium variant: ${mediumResult.error.message}`);
  }

  return paths;
}
