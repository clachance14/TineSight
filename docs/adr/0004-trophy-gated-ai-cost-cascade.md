# 4. Trophy-gated AI cost cascade

Date: 2026-06-20
Status: Accepted

## Context

TineSight's whole reason to exist is to **surface Trophy bucks** out of the
volume overwhelm of trail-camera Photos (1000s per operation) and to spend its
most expensive AI on exactly those animals — scoring, fingerprinting, and
re-identification. Every Gemini call costs money and latency, so spend must
track confirmed value, not be sprayed evenly across every Photo.

The pipeline already had a gated shape (detect → classify bucks → fingerprint
the ones labelled `size_class = "trophy"` → optional user-triggered compare),
but it conflated two different things at the gate:

- **Size impression** — a cheap qualitative glance (`size_class`:
  spike/basket/standard/trophy-looking) produced per buck crop.
- **Score** — the numeric Boone & Crockett-style measure (`score`/`score_class`)
  produced only *inside* the expensive fingerprint call.

Trophy status was gated on the cheap *impression* whose `"trophy"` value is not
a measurement, while the real numeric Score was computed only *after* a buck had
already been declared a trophy. Re-identification was not automatic, so "spend
the most AI on trophies" was not actually happening for re-ID. See `CONTEXT.md`
for the canonical definitions of **Trophy buck**, **Score**, **Size impression**.

## Decision

A **trophy is identified by Score, not by a glance**, surfaced through a
cost-tiered cascade where each stage only runs once the prior stage confirms the
animal is worth more spend.

| Stage | Runs on | Cost | Gate |
|-------|---------|------|------|
| Detect | every Photo | cheap | bounding boxes + `has_antlers`; stamps a **photo tier** + **security surface** |
| Classify (size glance) | every buck | cheap | `size_class`; coarse cut **drops `spike` only** |
| **Score estimate** *(new)* | every non-spike buck | mid | gross-score estimate; advances if `≥ threshold − band` |
| Fingerprint | estimates within band | expensive | authoritative Score; trophy iff `≥ account threshold` |
| Re-ID | confirmed trophies | expensive | trophy-vs-trophy; emits **Match candidates** |
| Cluster / promote | unmatched trophies | cheap | operator promotes a cluster → named **Buck** |

Settled invariants:

1. **Two-step scoring.** A cheap size glance does the coarse cut (drop spikes
   only — baskets and up advance, because the score call is only mid-cost so we
   can afford to be conservative against missed trophies). A new **mid-cost
   score-estimate call** then produces a number used to gate trophy status. The
   expensive full fingerprint is *not* used merely to find out if a buck is a
   trophy.
2. **Authoritative Score + confirm band.** The full fingerprint produces the
   authoritative Score. Any buck whose estimate is within a confirm band below
   the line (default `threshold − 10″`) is fingerprinted, so the fingerprint can
   **confirm**, **demote** (estimate over-called), or **rescue** (estimate
   under-called within the band). Promotion/demotion is **automatic** — it is a
   measurement correction, not a human judgment.
3. **Per-account threshold.** "Trophy" varies by region and by what an operation
   markets. The gate reads `account.trophy_threshold` from day one (default
   130″ gross), stored as a setting even before the settings UI exists.
4. **Buck Score = max across Detections.** A Buck is a Trophy if *any one* of its
   Detections clears the threshold; detection-level demotion can never pull a
   real Trophy off the Showcase. The best-scoring Detection is the Showcase hero.
5. **Automatic re-ID on trophies only.** On trophy confirmation, re-ID runs
   automatically: fingerprint-similarity pre-filter → Gemini visual confirm on
   only the top candidates, **trophy-against-trophy only**. It emits **Match
   candidates**; it **never auto-merges** (human-in-the-loop on identity).
6. **Unmatched trophies → unassigned pool → clustering → operator promotion.** A
   confirmed trophy with no match is not auto-created as a Buck (that would breed
   duplicates). It joins an unassigned pool; `clusterTrophyDetections` groups
   likely-same-animal detections; the operator promotes a cluster to one named
   Buck. This is the deliberate **First Buck Re-Identified** moment.
7. **Surface, don't delete.** The pipeline stamps one canonical **photo tier**
   (trophy > non-trophy buck > doe > non-deer > empty); the gallery defaults to
   trophies-first with lower tiers collapsed but never destroyed.
   `person`/`vehicle` detections get a **separate security surface** orthogonal
   to the animal tier and are **never auto-hidden**.

## Consequences

- **Positive:** Expensive calls (fingerprint, re-ID) run only on bucks that have
  passed two cheaper gates — spend tracks confirmed value. "Trophy" becomes a
  defensible number an operator can tune, not a model's qualitative mood. The
  confirm band makes a cheap estimate trustworthy in both error directions.
  Identity stays human-in-the-loop, keeping the Catalog duplicate-free.
- **Negative / risks:**
  - The coarse cut permanently drops spikes unscored — a (rare) genuine trophy
    misread as a spike is lost. Accepted as vanishingly unlikely.
  - Three overlapping rack signals now exist (size impression, score estimate,
    authoritative score). They must stay clearly separated in code and naming or
    the old impression/Score conflation returns.
  - The confirm band and per-account threshold are tunable numbers that need
    real-data calibration; wrong values either waste fingerprint calls (band too
    wide) or miss trophies (band too narrow).
  - Adds a new mid-cost call type and score/threshold/tier schema; changing the
    cascade later means re-processing existing Photos.
- **Reversibility:** Thresholds and band width are cheap to tune. The cascade
  *shape* (three tiers, authoritative fingerprint, auto re-ID) is harder to
  unwind once Photos are processed against it.

## Amendment — 2026-09-05

Automatic upload fingerprint generation now requires an estimated gross score of
**140 inches or higher**, after the existing coarse cut. This fixed cutoff replaces
the threshold-minus-10 confirm band for automatic uploads. The account trophy
threshold still governs the final trophy designation. Creating a named deer or
changing its reference detection can still trigger a fingerprint independently.

## Amendment — 2026-09-05 (authority lives in the database)

The trophy decision is made in exactly one place: the `detection_numeric_trophy`
trigger (migration 061) derives `detections.is_trophy` from the stored integer
`score_gross` and `profiles.trophy_threshold` on every write, and the photo tier
(`derive_photo_triage`, also redefined in 061) reads that flag instead of
re-applying the threshold. A threshold change refreshes the flags, and the
detection trigger cascades the change into tiers; 059's separate threshold sweep is
gone. The fingerprint worker no longer computes or writes `is_trophy`, and
`lib/scoring/gates.ts#isTrophyScore` is a preview helper that rounds first so it
agrees with the integer predicate. Trade-off accepted: a threshold change costs one
tier derivation per detection rather than one per photo, in exchange for a single
predicate that cannot drift.
