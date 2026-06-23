import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isVariantStoragePath,
  assertFullResolutionPath,
  assertFullResolutionDimensions,
  ANALYSIS_GUARD_DIMS,
} from "./analysis-source.ts";

test("isVariantStoragePath flags thumbnail/medium variant paths", () => {
  assert.equal(isVariantStoragePath("thumbnails/abc.webp"), true);
  assert.equal(isVariantStoragePath("medium/abc.webp"), true);
  // any webp is a variant (the only webp we store)
  assert.equal(isVariantStoragePath("somewhere/else/abc.webp"), true);
  // defensive: prefix nested under another segment
  assert.equal(isVariantStoragePath("cache/medium/abc.webp"), true);
});

test("isVariantStoragePath allows originals and crops", () => {
  assert.equal(isVariantStoragePath("user-id/batch-id/mud (1).JPG"), false);
  assert.equal(isVariantStoragePath("crops/det-id.jpg"), false);
  assert.equal(isVariantStoragePath(""), false);
  assert.equal(isVariantStoragePath(null), false);
  assert.equal(isVariantStoragePath(undefined), false);
});

test("assertFullResolutionPath throws on variants and empty paths", () => {
  assert.throws(() => assertFullResolutionPath("thumbnails/x.webp", "detection"), /downscaled variant/);
  assert.throws(() => assertFullResolutionPath("medium/x.webp", "fingerprint"), /downscaled variant/);
  assert.throws(() => assertFullResolutionPath("", "detection"), /missing storage path/);
  assert.throws(() => assertFullResolutionPath(null, "detection"), /missing storage path/);
});

test("assertFullResolutionPath passes originals and crops", () => {
  assert.doesNotThrow(() => assertFullResolutionPath("user/batch/IMG.JPG", "detection"));
  assert.doesNotThrow(() => assertFullResolutionPath("crops/det.jpg", "fingerprint"));
});

test("assertFullResolutionDimensions rejects variant-scale images (default medium floor)", () => {
  // thumbnail-scale and medium-scale must both fail the original guard
  assert.throws(() => assertFullResolutionDimensions(400, 300, "detection"), /downscaled variant/);
  assert.throws(() => assertFullResolutionDimensions(1080, 720, "detection"), /downscaled variant/);
  assert.throws(() => assertFullResolutionDimensions(0, 0, "detection"), /could not read image dimensions/);
});

test("assertFullResolutionDimensions accepts true full-res originals", () => {
  assert.doesNotThrow(() => assertFullResolutionDimensions(5376, 3024, "detection"));
  assert.doesNotThrow(() => assertFullResolutionDimensions(1920, 1080, "detection"));
});

test("assertFullResolutionDimensions with thumbnail floor allows small-but-full-res crops", () => {
  const floor = ANALYSIS_GUARD_DIMS.THUMBNAIL_MAX_DIM;
  // a modest crop from the original is fine under the crop (thumbnail) floor...
  assert.doesNotThrow(() => assertFullResolutionDimensions(800, 600, "crop", floor));
  // ...but a thumbnail-scale crop still fails
  assert.throws(() => assertFullResolutionDimensions(400, 220, "crop", floor), /downscaled variant/);
});
