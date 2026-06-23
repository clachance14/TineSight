# 7. Hybrid antler-print re-identification (fingerprint + embedding fusion)

Date: 2026-06-23
Status: Accepted (Phase 0); Phases 1–3 Proposed

## Context

Re-ID is TineSight's North Star, and the engine is the structured **antler
fingerprint** — LLM (Gemini)-estimated B&C measurements + angle-invariant ratios +
distinctive binary features — compared by `compareFingerprints`
(`lib/fingerprint/compare.ts`, ADR 0004). Operator dogfooding of the new "Find
sightings" ranked-manual surface (ADR 0005) confirmed a structural weakness already
suspected from the diagnostic run: at 85–87% similarity the shortlist is full of
**different** trophy bucks. The fingerprint scores *"is this a big typical rack?"*,
not *"is this **this** buck?"*.

A deep-research synthesis (`docs/research/antler-print-reid.md`, 24/25 claims
adversarially verified across 21 primary sources) explains why and what to do:

- **Global signals carry "typical rack"; local signals carry the individual.** Coarse
  size/proportion descriptors collide across different mature bucks; fine distinctive
  detail is what separates individuals. TineSight's `compareFingerprints` weights the
  *global* terms (ratios 46%, measurements 23%) over the *local*, identity-bearing
  distinctive features (31%) — backwards for identity.
- **The highest-leverage fix is fusion**, not replacement: a learned **embedding**
  (deep metric learning, cosine-NN over pgvector) **score-level fused** with a **local
  verification** pass and the structured fingerprint, behind a **tuned open-set
  threshold**. The WildFusion line shows global+local fusion adds ~+21pp in open-set
  animal re-ID.
- The few-example, open-set regime makes metric learning (ArcFace) + pre-trained local
  features the right tools; **keep** the structured fingerprint (hand-crafted + deep
  fusion beats either alone on small data).

Critical caveats from the research (see the survey): **no source validates
antler-specific re-ID or Gemini measurement reliability**; generic local keypoint
matchers are validated on dense pelage, not sparse antler tine geometry. These are
transfer risks, not settled facts.

## Decision

Adopt a **staged hybrid** design. Ship Phase 0 now; the rest is a sequenced roadmap,
each phase independently shippable and gated on real-data validation.

**Phase 0 — reweight `compareFingerprints` toward distinctive features (ACCEPTED, shipped).**
Shift the structured-score component weights away from the "big typical rack" global
terms toward the local, individual-carrying distinctive features:

| Component | Old weight | New weight | Rationale |
|-----------|-----------:|-----------:|-----------|
| Ratios (proportions/symmetry) | 30 | 20 | Global "typical rack" signature |
| **Features (drop tine, split G2, kickers, …)** | **20** | **35** | Local, identity-bearing markers |
| Measurements (absolute inches) | 15 | 10 | Size class + noisiest Gemini estimate |

The total stays **65** (the remaining 35 is reserved for the learned-embedding fusion
added in Phase 1, mirroring the original design comment). These weights are a
precision/recall/cost **knob, not a contract**.

**Phase 0b — measure Gemini measurement error (PROPOSED).** Hand-label a sample and
quantify the error of LLM-estimated B&C measures. Gate trust in the structured
fingerprint (and the measurement weight) on the result.

**Phase 1 — add a learned embedding + score-level fusion (PROPOSED).** Embed the
antler crop with an off-the-shelf foundation model (MegaDescriptor / DINOv2), store in
**pgvector** (cosine 1-NN — the pattern already in the stack), and fuse its score with
the structured score. Cheap: one local forward pass per crop, no Gemini.

**Phase 2 — local verification on the shortlist (PROPOSED).** Add a local-matching
pass (LightGlue/LoFTR) over the top-N — **but spike-test whether keypoints fire on
antler geometry first**; if not, build an antler-graph representation (tines = nodes,
beams = edges) instead.

**Phase 3 — tuned open-set threshold + temporal model (PROPOSED).** Empirically tune
the known-buck-vs-new-buck threshold (population-specific, re-tuned as the catalog
grows); model year-over-year regrowth via an identity timeline of linked seasonal
nodes rather than a frozen vector.

**Explicitly rejected:** a downstream SVM on embeddings (refuted 0-3 in the research);
replacing the structured fingerprint outright (fusion beats replacement).

## Consequences

- **Phase 0 changes the similarity distribution.** The `STRONG_MATCH` (85) /
  `AMBIGUOUS_MATCH` (70) bands in `reverse-reid-scan.ts` were tuned to the *old*
  weighting and will need re-tuning; until then they are conservative defaults, not
  contracts. The "Find sightings" surface is ranked-manual, so it is robust to the
  shift regardless.
- **Phase 0 is directional, not a cure.** The feature component also rewards shared
  *absence* of markers, so two markerless typical racks can still score high — the real
  separation comes from the Phase 1 embedding + Phase 2 local/graph verification. This
  is why Phase 0 ships behind a human-in-the-loop surface, never auto-merge.
- **Phases 1–3 add per-photo compute** (an embedding pass; shortlist-only local
  matching) — but cheap relative to the existing Gemini fingerprint, and they reuse
  pgvector.
- **Open validation work** (research open questions) must precede trusting any phase on
  real bucks: keypoints-on-antlers, regrowth handling, Gemini measurement error, fusion
  recipe. Tracked in `docs/research/antler-print-reid.md`.
- Supersedes the `compareFingerprints` "reweight + threshold retune" follow-up noted in
  ADR 0005.
