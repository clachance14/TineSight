import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveUploadContentType } from "./config.ts";

test("a browser-reported MIME type is used as-is", () => {
  assert.equal(resolveUploadContentType("IMG_0001.HEIC", "image/heic"), "image/heic");
  assert.equal(resolveUploadContentType("weird.jpg", "image/png"), "image/png");
});

test("an empty MIME type falls back to the extension, case-insensitively", () => {
  assert.equal(resolveUploadContentType("STC_0888.JPG", ""), "image/jpeg");
  assert.equal(resolveUploadContentType("STC_0888.jpeg", undefined), "image/jpeg");
  assert.equal(resolveUploadContentType("cam.PNG", null), "image/png");
  assert.equal(resolveUploadContentType("cam.webp", ""), "image/webp");
});

test("an unknown extension with no MIME type resolves to empty so the server rejects it", () => {
  assert.equal(resolveUploadContentType("clip.AVI", ""), "");
  assert.equal(resolveUploadContentType("noext", ""), "");
});
