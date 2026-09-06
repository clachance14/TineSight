import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeBatchInits } from "./run-outcome.ts";

test("every chunk failing is a failed run that surfaces the first server error", () => {
  const summary = summarizeBatchInits([
    { ok: false, error: "Validation failed" },
    { ok: false, error: "Unauthorized" },
  ]);
  assert.equal(summary.allFailed, true);
  assert.equal(summary.attempted, 2);
  assert.equal(summary.failed, 2);
  assert.equal(summary.message, "Upload could not start: Validation failed");
});

test("a partial failure is not a failed run but still explains itself", () => {
  const summary = summarizeBatchInits([
    { ok: true },
    { ok: false, error: "Failed to create upload batch" },
    { ok: true },
  ]);
  assert.equal(summary.allFailed, false);
  assert.equal(summary.failed, 1);
  assert.equal(
    summary.message,
    "1 of 3 upload batches could not start: Failed to create upload batch"
  );
});

test("a clean run has nothing to report", () => {
  const summary = summarizeBatchInits([{ ok: true }, { ok: true }]);
  assert.deepEqual(summary, { attempted: 2, failed: 0, allFailed: false, message: null });
});

test("no chunks attempted is not a failure", () => {
  const summary = summarizeBatchInits([]);
  assert.equal(summary.allFailed, false);
  assert.equal(summary.message, null);
});
