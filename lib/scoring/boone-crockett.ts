/**
 * Pure Boone & Crockett scoring math for whitetail antlers.
 *
 * The Gemini fingerprint stage EXTRACTS raw measurements from the photo; this
 * module turns those measurements into the authoritative B&C scores. Keeping the
 * arithmetic here — not in the LLM prompt — makes the trophy decision correct and
 * unit-testable: LLMs are unreliable at multi-term arithmetic, and the gross score
 * drives the authoritative `is_trophy` gate. See
 * docs/adr/0006-deterministic-bc-scoring.md (and ADR 0004 for the gate).
 *
 * No I/O, no Gemini, no DB — just the math, run via `npm run test:unit`.
 *
 * Scope (official B&C whitetail rules honored here):
 *  - inside-spread credit capped at the longer main beam;
 *  - gross typical = spread credit + both beams + all NORMAL points + all mass;
 *  - asymmetry (|left − right|) deducted for net; an unmatched point loses its
 *    full length;
 *  - abnormal points SUBTRACTED for net typical, ADDED for net non-typical.
 * Out of scope (needs judgment about the physical antler, left to the prompt):
 *  - point-validity adjudication (a point must be ≥1" and longer than wide);
 *  - the H4 "halfway between G3 and the beam tip" construction when no G4 exists.
 */

/** Coerce a possibly-missing measurement to 0 inches for summation. */
const inches = (x: number | null | undefined): number =>
  typeof x === "number" && Number.isFinite(x) ? x : 0;

const sum = (xs: Array<number | null | undefined>): number =>
  xs.reduce<number>((acc, x) => acc + inches(x), 0);

/**
 * Pairwise |left − right| over two measurement lists. A measurement present on
 * one side but not the other contributes its full length (|x − 0| = x), matching
 * the B&C rule that an unmatched normal point is wholly an asymmetry deduction.
 */
const asymmetry = (
  left: Array<number | null | undefined>,
  right: Array<number | null | undefined>,
): number => {
  const len = Math.max(left.length, right.length);
  let diff = 0;
  for (let i = 0; i < len; i++) diff += Math.abs(inches(left[i]) - inches(right[i]));
  return diff;
};

/** Raw, per-side antler measurements (inches). Nulls are treated as absent. */
export interface BcRawMeasurements {
  insideSpread: number | null | undefined;
  mainBeamLeft: number | null | undefined;
  mainBeamRight: number | null | undefined;
  /** Normal points G1…G7 (left). Abnormal points must NOT appear here. */
  tinesLeft: Array<number | null | undefined>;
  /** Normal points G1…G7 (right). */
  tinesRight: Array<number | null | undefined>;
  /** Circumferences H1…H4 (left). */
  massLeft: Array<number | null | undefined>;
  /** Circumferences H1…H4 (right). */
  massRight: Array<number | null | undefined>;
  /** Total length of abnormal points (drop tines, stickers, points-off-points). */
  abnormalPointsTotal: number | null | undefined;
}

export interface BcScores {
  /** Inside spread, capped at the longer main beam. */
  spreadCredit: number;
  /** Gross of the typical frame: spread credit + beams + normal points + mass. */
  grossTypical: number;
  /** Headline gross incl. abnormal points — drives the trophy gate. */
  grossScore: number;
  /** Σ |left − right| over beams, matched points, and mass. */
  asymmetryDeductions: number;
  abnormalPointsTotal: number;
  /** grossTypical − asymmetry − abnormal. */
  netTypical: number;
  /** grossTypical − asymmetry + abnormal. */
  netNonTypical: number;
}

/**
 * Inside-spread credit: the inside spread, but never more than the longer main
 * beam (official B&C: spread credit may equal but not exceed the longer beam).
 */
export function spreadCredit(
  insideSpread: number | null | undefined,
  mainBeamLeft: number | null | undefined,
  mainBeamRight: number | null | undefined,
): number {
  const longerBeam = Math.max(inches(mainBeamLeft), inches(mainBeamRight));
  return Math.min(inches(insideSpread), longerBeam);
}

/** Compute the full set of B&C scores from raw measurements. */
export function computeBcScores(m: BcRawMeasurements): BcScores {
  const credit = spreadCredit(m.insideSpread, m.mainBeamLeft, m.mainBeamRight);
  const beams = inches(m.mainBeamLeft) + inches(m.mainBeamRight);
  const normalPoints = sum(m.tinesLeft) + sum(m.tinesRight);
  const mass = sum(m.massLeft) + sum(m.massRight);
  const grossTypical = credit + beams + normalPoints + mass;

  const abnormal = inches(m.abnormalPointsTotal);

  const asymmetryDeductions =
    Math.abs(inches(m.mainBeamLeft) - inches(m.mainBeamRight)) +
    asymmetry(m.tinesLeft, m.tinesRight) +
    asymmetry(m.massLeft, m.massRight);

  return {
    spreadCredit: credit,
    grossTypical,
    grossScore: grossTypical + abnormal,
    asymmetryDeductions,
    abnormalPointsTotal: abnormal,
    netTypical: grossTypical - asymmetryDeductions - abnormal,
    netNonTypical: grossTypical - asymmetryDeductions + abnormal,
  };
}

export type ScoreClass =
  | "120s"
  | "140s"
  | "160s"
  | "180s"
  | "200s"
  | "world_class"
  | "unknown";

/** Bracket a gross score into the display class used by the fingerprint schema. */
export function scoreClassFor(gross: number | null | undefined): ScoreClass {
  if (gross == null || !Number.isFinite(gross)) return "unknown";
  if (gross >= 220) return "world_class";
  if (gross >= 200) return "200s";
  if (gross >= 180) return "180s";
  if (gross >= 160) return "160s";
  if (gross >= 140) return "140s";
  if (gross >= 120) return "120s";
  return "unknown";
}

/**
 * Adapt the fingerprint's nested `measurements` object (g1…g7 / h1…h4 keys) into
 * the flat arrays `computeBcScores` expects. Kept here so the job stays thin and
 * the mapping is covered by this module's tests.
 */
export function rawFromFingerprintMeasurements(
  measurements: {
    inside_spread: number | null;
    main_beam_left: number | null;
    main_beam_right: number | null;
    tines: {
      left: Record<string, number | null>;
      right: Record<string, number | null>;
    };
    mass: {
      left: Record<string, number | null>;
      right: Record<string, number | null>;
    };
  },
  abnormalPointsTotal: number | null | undefined,
): BcRawMeasurements {
  const gKeys = ["g1", "g2", "g3", "g4", "g5", "g6", "g7"] as const;
  const hKeys = ["h1", "h2", "h3", "h4"] as const;
  return {
    insideSpread: measurements.inside_spread,
    mainBeamLeft: measurements.main_beam_left,
    mainBeamRight: measurements.main_beam_right,
    tinesLeft: gKeys.map((k) => measurements.tines.left[k] ?? null),
    tinesRight: gKeys.map((k) => measurements.tines.right[k] ?? null),
    massLeft: hKeys.map((k) => measurements.mass.left[k] ?? null),
    massRight: hKeys.map((k) => measurements.mass.right[k] ?? null),
    abnormalPointsTotal,
  };
}
