import { test } from "node:test";
import assert from "node:assert/strict";
import {
  spreadCredit,
  computeBcScores,
  scoreClassFor,
  rawFromFingerprintMeasurements,
  type BcRawMeasurements,
} from "./boone-crockett.ts";

/** A clean, symmetric 5x5 typical rack used as a baseline across tests. */
const symmetric5x5 = (): BcRawMeasurements => ({
  insideSpread: 18,
  mainBeamLeft: 24,
  mainBeamRight: 24,
  tinesLeft: [5, 10, 9, 6, null, null, null],
  tinesRight: [5, 10, 9, 6, null, null, null],
  massLeft: [4.5, 4, 3.5, 3],
  massRight: [4.5, 4, 3.5, 3],
  abnormalPointsTotal: 0,
});

test("spread credit is capped at the longer main beam", () => {
  // spread 22 but longer beam is 20 → credit clamps to 20
  assert.equal(spreadCredit(22, 20, 19), 20);
  // spread below the longer beam is taken as-is
  assert.equal(spreadCredit(15, 20, 19), 15);
  // missing measurements coerce to 0, never NaN
  assert.equal(spreadCredit(null, null, null), 0);
});

test("symmetric typical rack: gross math and zero deductions", () => {
  const s = computeBcScores(symmetric5x5());
  // spread 18 + beams 48 + normal points 60 + mass 30 = 156
  assert.equal(s.spreadCredit, 18);
  assert.equal(s.grossTypical, 156);
  assert.equal(s.grossScore, 156);
  assert.equal(s.asymmetryDeductions, 0);
  assert.equal(s.netTypical, 156);
  assert.equal(s.netNonTypical, 156);
});

test("an unmatched normal point is wholly an asymmetry deduction", () => {
  const m = symmetric5x5();
  m.tinesRight = [5, 10, 9, null, null, null, null]; // right G4 (6") missing
  const s = computeBcScores(m);
  // gross drops by the missing 6" point; net typical drops by another 6" (the
  // full length of the unmatched point counts as asymmetry)
  assert.equal(s.grossTypical, 150);
  assert.equal(s.asymmetryDeductions, 6);
  assert.equal(s.netTypical, 144);
});

test("abnormal points: subtracted for net typical, added for non-typical", () => {
  const m = symmetric5x5();
  m.abnormalPointsTotal = 8; // e.g. an 8" drop tine
  const s = computeBcScores(m);
  // headline gross includes abnormal points
  assert.equal(s.grossScore, 164);
  // typical frame gross is unchanged by abnormal points
  assert.equal(s.grossTypical, 156);
  assert.equal(s.netTypical, 148); // 156 − 0 − 8
  assert.equal(s.netNonTypical, 164); // 156 − 0 + 8
});

test("beam and mass asymmetry both contribute to deductions", () => {
  const m = symmetric5x5();
  m.mainBeamRight = 21; // 3" beam asymmetry
  m.massRight = [4.5, 4, 3.5, 1]; // 2" off on H4
  const s = computeBcScores(m);
  assert.equal(s.asymmetryDeductions, 5); // 3 (beam) + 2 (mass)
});

test("scoreClassFor brackets gross scores at the documented edges", () => {
  assert.equal(scoreClassFor(119), "unknown");
  assert.equal(scoreClassFor(120), "120s");
  assert.equal(scoreClassFor(139), "120s");
  assert.equal(scoreClassFor(140), "140s");
  assert.equal(scoreClassFor(160), "160s");
  assert.equal(scoreClassFor(180), "180s");
  assert.equal(scoreClassFor(200), "200s");
  assert.equal(scoreClassFor(219), "200s");
  assert.equal(scoreClassFor(220), "world_class");
  assert.equal(scoreClassFor(null), "unknown");
});

test("rawFromFingerprintMeasurements flattens the nested g/h shape", () => {
  const raw = rawFromFingerprintMeasurements(
    {
      inside_spread: 18,
      main_beam_left: 24,
      main_beam_right: 23,
      tines: {
        left: { g1: 5, g2: 10, g3: 9, g4: 6, g5: null, g6: null, g7: null },
        right: { g1: 5, g2: 10, g3: 8, g4: null, g5: null, g6: null, g7: null },
      },
      mass: {
        left: { h1: 4.5, h2: 4, h3: 3.5, h4: 3 },
        right: { h1: 4.5, h2: 4, h3: 3.5, h4: 3 },
      },
    },
    4, // abnormal points total
  );
  assert.deepEqual(raw.tinesLeft, [5, 10, 9, 6, null, null, null]);
  assert.deepEqual(raw.tinesRight, [5, 10, 8, null, null, null, null]);
  assert.deepEqual(raw.massRight, [4.5, 4, 3.5, 3]);
  assert.equal(raw.abnormalPointsTotal, 4);
  // and it threads straight into the scorer
  const s = computeBcScores(raw);
  assert.equal(s.spreadCredit, 18);
  assert.ok(s.grossScore > 0);
});
