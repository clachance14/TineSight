/**
 * Full-resolution analysis guard (ADR 0003).
 *
 * AI analysis — detection, classification, score estimate, and especially the
 * antler fingerprint — MUST run on the full-resolution original (or a crop taken
 * from it), NEVER on a generated display variant. The display variants
 * (`thumbnails/{id}.webp` ≤400px, `medium/{id}.webp` ≤1080px; see ./variants.ts)
 * destroy the fine antler structure the scorer depends on: at variant resolution
 * a drop tine is indistinguishable from a kicker, which silently corrupts the
 * gross score and the trophy decision.
 *
 * These are pure functions so they can be unit-tested without sharp/storage, and
 * are called at every point where the pipeline picks an image to send to Gemini.
 */

// Mirrors VARIANT_CONFIG in ./variants.ts. Kept local so this guard stays
// dependency-free (no sharp import) and fast to unit-test.
const THUMBNAIL_MAX_DIM = 400;
const MEDIUM_MAX_DIM = 1080;

/** Storage-path prefixes under which generated display variants live. */
export const VARIANT_PATH_PREFIXES = ['thumbnails/', 'medium/'] as const;

/**
 * True when a storage path points at a generated display variant rather than a
 * full-resolution original or crop. Variants are the only WebP we store, and
 * always live under the variant prefixes — either signal is sufficient.
 */
export function isVariantStoragePath(path: string | null | undefined): boolean {
  const p = (path ?? '').trim().toLowerCase();
  if (!p) return false;
  if (p.endsWith('.webp')) return true;
  return VARIANT_PATH_PREFIXES.some(
    (prefix) => p.startsWith(prefix) || p.includes(`/${prefix}`)
  );
}

/**
 * Throw unless `path` is a valid full-resolution analysis source (an original or
 * a `crops/…` crop derived from one). Use at every site that selects an image to
 * send to the vision model.
 */
export function assertFullResolutionPath(path: string | null | undefined, context: string): void {
  if (!path || !path.trim()) {
    throw new Error(
      `[full-res-guard] ${context}: missing storage path; analysis requires the full-resolution original.`
    );
  }
  if (isVariantStoragePath(path)) {
    throw new Error(
      `[full-res-guard] ${context}: refusing to analyze downscaled variant "${path}". ` +
        `Analysis must use the full-resolution original/crop, never a thumbnail/medium variant (ADR 0003).`
    );
  }
}

/**
 * Throw when decoded image dimensions are at-or-below a variant ceiling, catching
 * a downscaled image that slipped past the path check (e.g. a renamed variant, or
 * a crop accidentally taken from a variant buffer).
 *
 * @param minLargestDim  Largest-dimension floor. Defaults to the medium ceiling
 *   (1080px) — safe for trail-cam originals, which are always far larger. For
 *   crops (whose size depends on how far the animal was), pass the thumbnail
 *   ceiling ({@link THUMBNAIL_MAX_DIM}) to avoid false rejects on legitimately
 *   small-but-full-res crops.
 */
export function assertFullResolutionDimensions(
  width: number | null | undefined,
  height: number | null | undefined,
  context: string,
  minLargestDim: number = MEDIUM_MAX_DIM
): void {
  const largest = Math.max(width ?? 0, height ?? 0);
  if (largest === 0) {
    throw new Error(`[full-res-guard] ${context}: could not read image dimensions.`);
  }
  if (largest <= minLargestDim) {
    throw new Error(
      `[full-res-guard] ${context}: source is ${width ?? '?'}x${height ?? '?'}; largest dimension ` +
        `${largest}px ≤ ${minLargestDim}px indicates a downscaled variant, not a full-resolution photo (ADR 0003).`
    );
  }
}

export const ANALYSIS_GUARD_DIMS = { THUMBNAIL_MAX_DIM, MEDIUM_MAX_DIM } as const;
