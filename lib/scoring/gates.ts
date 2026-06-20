/**
 * Pure decision logic for the trophy-gated AI cost cascade.
 * See docs/adr/0004-trophy-gated-ai-cost-cascade.md.
 *
 * No I/O, no Gemini, no DB — just the gate math, so it is unit-testable with
 * Node's built-in test runner (`node --test`).
 */

/**
 * Confirm band (gross inches) below the trophy threshold within which a buck is
 * still sent to the expensive fingerprint, so an estimate that under-calls a
 * real trophy still gets measured.
 */
export const TROPHY_CONFIRM_BAND_INCHES = 10;

/** Per-account trophy threshold (gross inches) used when none is set. */
export const DEFAULT_TROPHY_THRESHOLD_INCHES = 130;

/**
 * Coarse cut (Step 1): is this buck worth the mid-cost score estimate?
 * We drop only spikes; baskets and up advance (the estimate is only mid-cost,
 * so we stay conservative against missed trophies).
 */
export function passesCoarseCut(sizeClass: string | null | undefined): boolean {
  return sizeClass !== "spike";
}

/**
 * Confirm-band gate (Step 2 → Step 3): is the score estimate high enough to
 * spend the expensive fingerprint on? Includes the confirm band.
 */
export function passesScoreEstimateBand(
  scoreEstimate: number | null | undefined,
  threshold: number,
  band: number = TROPHY_CONFIRM_BAND_INCHES,
): boolean {
  if (scoreEstimate == null) return false;
  return scoreEstimate >= threshold - band;
}

/** Final trophy decision, made on the authoritative fingerprint gross score. */
export function isTrophyScore(
  grossScore: number | null | undefined,
  threshold: number,
): boolean {
  if (grossScore == null) return false;
  return grossScore >= threshold;
}

/**
 * A Buck's canonical score is the highest authoritative gross score across all
 * its detections (best rack view wins); a poorer later photo never lowers it.
 */
export function buckScoreFromDetections(
  detectionGrossScores: Array<number | null | undefined>,
): number | null {
  const valid = detectionGrossScores.filter(
    (s): s is number => typeof s === "number",
  );
  if (valid.length === 0) return null;
  return Math.max(...valid);
}
