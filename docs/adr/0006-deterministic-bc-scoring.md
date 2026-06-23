# ADR 0006 — Deterministic Boone & Crockett scoring (code, not the LLM, owns the arithmetic)

- **Status:** Accepted
- **Date:** 2026-06-22
- **Supersedes the scoring math of:** ADR 0004 (trophy-gated AI cost cascade) — the
  cascade and gate are unchanged; only *who computes the gross score* changes.

## Context

The trophy gate (ADR 0004) makes its authoritative promote/demote decision on a
buck's **gross B&C score** (`detections.score_gross` → `is_trophy`). Until now that
gross score was produced **by Gemini inside the fingerprint output**:
`ANTLER_FINGERPRINT_PROMPT` instructed the model to measure the rack *and* to do the
B&C arithmetic, and `generate-fingerprint.ts` read `fingerprint.scores.gross_score`
verbatim and fed it straight to `isTrophyScore()`.

Two problems with that:

1. **LLMs are unreliable at multi-term arithmetic.** A typical rack sums ~20 terms
   (spread + 2 beams + up to 14 tines + 8 circumferences). Trusting the model to add
   them — and to apply the asymmetry-deduction and spread-cap rules — puts a numeric,
   safety-critical decision behind a non-deterministic text generator. It is also
   unverifiable: we cannot unit-test the model's mental math.

2. **The formula in the prompt was incomplete / wrong** versus the official B&C
   whitetail method (confirmed by a deep-research pass, 2026-06-22):
   - **No inside-spread credit cap.** Official B&C: spread credit *may equal but not
     exceed the longer main beam*. Wide, short-beamed bucks were being over-scored.
   - **Abnormal points mishandled.** In the **typical** score abnormal points (drop
     tines, stickers, points-off-points) are **deducted**; in the **non-typical**
     score they are **added**. The prompt folded everything into one "net = gross −
     asymmetry" with no abnormal-point term and no typical/non-typical split.
   - **H4 location** was stated as "between G3 and G4" with no rule for racks lacking
     a G4 (official: smallest circumference halfway between G3 and the beam tip).

## Decision

**Split measurement from arithmetic.** Gemini extracts *raw measurements* (the part
that genuinely needs vision); a new pure module **`lib/scoring/boone-crockett.ts`**
computes every score deterministically and becomes the source of truth.

- `computeBcScores(raw)` returns, from the raw per-side measurements:
  - `spreadCredit` — inside spread **capped at the longer main beam**;
  - `grossTypical` — spread credit + both beams + all **normal** points + all mass;
  - `grossScore` — `grossTypical + abnormalPointsTotal` (the headline "how big"
    number that drives the trophy gate — a buck with a 6" drop tine *is* that much
    buck);
  - `asymmetryDeductions` — Σ |left − right| over beams, matched points, and mass
    (an unmatched point contributes its full length);
  - `netTypical` = grossTypical − asymmetry − abnormal;
  - `netNonTypical` = grossTypical − asymmetry + abnormal.
- `generate-fingerprint.ts` calls `computeBcScores` and **overwrites**
  `fingerprint.scores` with the computed values before persisting; `is_trophy` and
  `score_gross` are taken from code, never from the model.
- The prompt still asks the model for measurements + an `abnormal_points_total` +
  a `typical_status` character call, and is corrected on the spread cap, the H4 rule,
  the 1-inch point-validity rule, and the instruction to keep abnormal points **out**
  of the G1–G7 fields. It no longer needs to be trusted for any sum.

### What stays the LLM's job (cannot be done from a 2D photo by rule)

Point-validity adjudication (≥1" and longer than wide) and the H4-halfway-to-tip
construction remain model guidance in the prompt, not code — they require judgment
about the physical antler that the measurements alone don't encode.

## Consequences

- **The gate is now correct and unit-tested.** `boone-crockett.test.ts` pins the
  spread cap, the asymmetry deduction (incl. unmatched points), and the
  typical-subtracts / non-typical-adds abnormal-point rule.
- **Lower retry/crash risk** on the fingerprint call: the model is asked for fewer
  derived numbers, so structured-output validation has less to reject.
- **Some existing fingerprints will re-score on next run.** The spread cap can only
  *lower* gross for wide, short-beamed bucks, which may demote a borderline
  `is_trophy`. This is a correctness fix, and we are pre-launch (operator dogfood, no
  external users), so we accept the reclassification. A backfill that recomputes
  scores for stored fingerprints is a follow-up (mirror the migration-043 pattern).
- **`gross_score` excluding vs including abnormal points is a product choice.** We
  gate on the *total* gross (incl. abnormal points) so big non-typicals still qualify;
  `grossTypical` and both nets are stored alongside for display and B&C accuracy.
