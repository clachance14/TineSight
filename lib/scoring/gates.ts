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

/** Minimum estimated gross score for automatic upload fingerprint generation. */
export const AUTOMATIC_FINGERPRINT_MIN_SCORE = 140;

export function shouldAutomaticallyFingerprint(
  scoreEstimate: number | null | undefined,
): boolean {
  return typeof scoreEstimate === "number"
    && Number.isFinite(scoreEstimate)
    && scoreEstimate >= AUTOMATIC_FINGERPRINT_MIN_SCORE;
}

/**
 * Coarse cut (Step 1): is this buck worth the mid-cost score estimate?
 * We drop only spikes; baskets and up advance (the estimate is only mid-cost,
 * so we stay conservative against missed trophies).
 */
export function passesCoarseCut(sizeClass: string | null | undefined): boolean {
  return sizeClass !== "spike";
}

/**
 * Legacy confirm-band calculation. Automatic uploads now use
 * shouldAutomaticallyFingerprint with a fixed 140-inch minimum.
 */
export function passesScoreEstimateBand(
  scoreEstimate: number | null | undefined,
  threshold: number,
  band: number = TROPHY_CONFIRM_BAND_INCHES,
): boolean {
  if (scoreEstimate == null) return false;
  return scoreEstimate >= threshold - band;
}

/**
 * Mirror of the database's trophy predicate (trigger detection_numeric_trophy,
 * migration 061), which decides is_trophy on the INTEGER score_gross the
 * fingerprint job stores; so this rounds first. The trigger is the authority.
 * Use this only for previews and scripts that need the same answer before a
 * write lands.
 */
export function isTrophyScore(
  grossScore: number | null | undefined,
  threshold: number,
): boolean {
  if (grossScore == null) return false;
  return Math.round(grossScore) >= threshold;
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
