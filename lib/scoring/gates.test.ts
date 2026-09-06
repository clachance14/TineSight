import { test } from "node:test";
import assert from "node:assert/strict";
import {
  passesCoarseCut,
  passesScoreEstimateBand,
  isTrophyScore,
  buckScoreFromDetections,
  TROPHY_CONFIRM_BAND_INCHES,
  DEFAULT_TROPHY_THRESHOLD_INCHES,
  shouldAutomaticallyFingerprint,
  AUTOMATIC_FINGERPRINT_MIN_SCORE,
} from "./gates.ts";

test("automatic fingerprints start at exactly 140 estimated gross inches", () => {
  assert.equal(AUTOMATIC_FINGERPRINT_MIN_SCORE, 140);
  for (const score of [120, 130, 139, 139.99, null, undefined, NaN, Infinity, -Infinity]) {
    assert.equal(shouldAutomaticallyFingerprint(score), false, String(score));
  }
  for (const score of [140, 140.01, 160, 200]) {
    assert.equal(shouldAutomaticallyFingerprint(score), true, String(score));
  }
});

test("coarse cut drops only spikes", () => {
  assert.equal(passesCoarseCut("spike"), false);
  assert.equal(passesCoarseCut("basket"), true);
  assert.equal(passesCoarseCut("standard"), true);
  assert.equal(passesCoarseCut("trophy"), true);
  assert.equal(passesCoarseCut("unknown"), true);
  assert.equal(passesCoarseCut(null), true);
});

test("score-estimate band includes the confirm band below threshold", () => {
  // threshold 130, band 10 -> gate at 120
  assert.equal(passesScoreEstimateBand(119, 130), false);
  assert.equal(passesScoreEstimateBand(120, 130), true);
  assert.equal(passesScoreEstimateBand(135, 130), true);
  assert.equal(passesScoreEstimateBand(null, 130), false);
});

test("score-estimate band respects a custom band width", () => {
  assert.equal(passesScoreEstimateBand(120, 130, 0), false);
  assert.equal(passesScoreEstimateBand(130, 130, 0), true);
});

test("trophy decision is on authoritative gross score vs threshold", () => {
  assert.equal(isTrophyScore(129, 130), false);
  assert.equal(isTrophyScore(130, 130), true);
  assert.equal(isTrophyScore(180, 130), true);
  assert.equal(isTrophyScore(null, 130), false);
  // The database decides on the rounded integer score_gross; the helper agrees with it.
  assert.equal(isTrophyScore(129.6, 130), true);
  assert.equal(isTrophyScore(129.4, 130), false);
});

test("buck score is the max across detections, ignoring nulls", () => {
  assert.equal(buckScoreFromDetections([120, 145, null, 130]), 145);
  assert.equal(buckScoreFromDetections([null, null]), null);
  assert.equal(buckScoreFromDetections([]), null);
});

test("defaults match the ADR", () => {
  assert.equal(DEFAULT_TROPHY_THRESHOLD_INCHES, 130);
  assert.equal(TROPHY_CONFIRM_BAND_INCHES, 10);
});
