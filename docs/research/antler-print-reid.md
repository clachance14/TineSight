# Antler-print re-identification — research survey + recommendation

> Deep-research synthesis (2026-06-23). 6 search angles → 21 primary sources →
> 100 extracted claims → 25 adversarially verified (3-vote; **24 confirmed, 1
> refuted**). Source of the ADR-0007 decision.
>
> **Question:** the best way to combine deterministic antler measurements with
> AI/CV to build an "antler print" that re-identifies an **individual** white-tailed
> buck from trail-camera photos — centered on a **hybrid** approach, under
> trail-cam constraints (pose/IR/occlusion, year-over-year regrowth, one/few
> examples per buck, open-set).

## TL;DR

**Hybrid multi-signal fusion beats any single representation.** The biggest single
lever is **score-level fusion of a *global* embedding with a *local* feature-matching
pass**, behind a tuned open-set threshold. This is the direct fix for TineSight's
"scores a big typical rack, not *this* buck" symptom: global descriptors carry the
coarse "typical rack" signature; local features carry the fine, individual-distinguishing
detail. Keep the structured B&C fingerprint — **fuse** it, don't discard it — but
down-weight the size/ratio terms and add a learned embedding (pgvector cosine-NN).

## Landscape survey (verified findings)

### 1. Global = "big typical rack"; local = the individual *(high confidence)*
Global deep descriptors are sensitive to background/illumination and produce false
matches **between different individuals** — they capture coarse appearance while
missing the fine markings that distinguish one animal. Local keypoint verification
recovers that individual-carrying detail under strong viewpoint change.
→ This is the literal explanation of TineSight's symptom: size/ratio terms = a
typical-rack *global* signature; distinctive markers (drop tines, split G2, kickers)
= the *local* identity signal.
Sources: CEUR Vol-4038 paper_253; IJCV 2024 (s11263-024-02071-1).

### 2. The WildFusion pattern is the highest-leverage architecture *(high)*
Fusing a global embedding (MegaDescriptor/DINOv2) with local matching
(LoFTR/LightGlue) via **similarity-score calibration** gave **+21 percentage points**
over a global-embedding-only baseline (40.6% → 61.7%) — dwarfing every other pipeline
component (+2.4pp XGBoost, +3pp ArcFace). 84% mean accuracy across 17 datasets;
works **zero-shot** (local-only 76.2%, beating a baseline trained on 15/17 datasets).
Sources: arXiv 2408.12934 (WildFusion, ECCV 2024 WS); CEUR Vol-4038 paper_253
(AnimalCLEF 2025, 2nd of 172 teams — reproduces +21pp as the single largest gain).

### 3. The learned component = deep *metric* learning, not classification *(high)*
Re-ID for TineSight's regime (one/few photos per buck, open-set, new bucks never
seen in training, train/test identities disjoint) is correctly a **zero-shot
retrieval** problem. Metric learning (triplet / ArcFace) is explicitly built for it
and "naturally handles open datasets… re-identification of a known individual and the
discovery of new individuals."
Sources: PMC8472616; Wahltinez 2024 (2041-210X.14278); arXiv 1803.10630; arXiv 2406.09211.

### 4. Keep the structured fingerprint — fuse it *(high)*
Hand-crafted + deep fusion **measurably outperforms either alone** and improves
unseen-identity (zero-shot) performance; the metric-learning step is "a big factor"
in the gain on small datasets (e.g. LOMO + deep + XQDA → 92% rank-1 Market-1501,
+~7pp on the small VIPeR set).
Sources: arXiv 1803.10630; ScienceDirect S0167865518309036.

### 5. On small data, aggregate *pre-trained local* features *(high)*
End-to-end global embeddings are data-hungry and only win with abundant labels;
local-feature aggregation using pre-trained descriptors gives high accuracy without
large labeled training sets — the right choice in TineSight's few-example regime.
Source: IJCV 2024 ALFRE-ID (s11263-024-02071-1).

### 6. Retrieval = cosine 1-NN over an embedding store + a TUNED threshold *(high)*
Standard re-ID retrieval is a cosine-similarity 1-nearest-neighbor over a deep
embedding — exactly the **pgvector** pattern TineSight already has (exact + HNSW).
But open-set deployment **requires an explicit, empirically tuned "new individual"
threshold that is population-specific**, not one shared global value (optimal
thresholds varied widely: lynx 39.5%, salamander 12%, sea turtle 16%). Re-tune as
the catalog grows.
Sources: arXiv 2311.09118 (MegaDescriptor / WildlifeDatasets); CEUR Vol-4038 paper_253.

### 7. Backbone is empirical; a foundation embedding is a strong start *(high)*
No single CNN backbone + loss is best across datasets; class-aware (ArcFace/Proxy-NCA)
vs pairwise (triplet) losses are roughly competitive. **MegaDescriptor** (Swin
Transformer + ArcFace) is SOTA across tested datasets and beats CLIP/DINOv2 by a large
margin, usable zero-shot via cosine-NN — a good off-the-shelf starting point.
*(Correction logged during verification: MegaDescriptor's released models are
ArcFace-only; triplet was ablation-only.)*
Sources: PMC8472616; arXiv 2311.09118; MDPI 13/11/2067.

### 8. A benchmark exists to validate against *(high)*
**WildlifeReID-10k** — 10k+ identities, ~33 species, 140k+ images from 37 datasets,
with closed- **and** open-set baselines — is the standard to validate a fusion design
+ threshold strategy before trusting it on real bucks (no white-tailed antler data,
but the open-set protocol transfers).
Source: arXiv 2406.09211 (CVPR 2025 WS).

### Refuted *(0-3)*
**Do NOT bolt a downstream SVM onto the embeddings.** The claim that a
Siamese/triplet network + a separate SVM classifier beats the network alone was
refuted 3-0. Stick with cosine-NN retrieval + fusion.
Source: refuting MDPI 13/11/2067.

## ⚠️ Critical caveats — where this corpus could mislead

- **No source is about antler-based deer re-ID.** All fusion/metric-learning evidence
  transfers **by analogy** from person re-ID, pelage/markings, and multi-species
  benchmarks. The one deer paper (Sika, MDPI 13/11/2067) re-IDs by **body/pelage**,
  closed-set, 7 individuals — it does *not* demonstrate open-set/one-shot antler re-ID.
- **Biggest transfer risk:** local keypoint matchers (LoFTR/LightGlue) are validated on
  **dense** texture/pelage. Antlers are a **sparse 3D branching structure projected to
  2D** with few stable keypoints — generic local matching may not fire. TineSight may
  instead need an **antler-specific landmark/graph representation (tines = nodes, beams
  = edges)**. *Unvalidated — spike-test before committing (open question #1).*
- **Year-over-year regrowth is unaddressed by every source.** The same buck's rack
  rescores each season (a non-stationary biometric). No verified guidance exists.
- **Gemini/VLM measurement reliability is entirely unvalidated.** No source evaluated
  the error of LLM-estimated B&C measurements. TineSight's structured fingerprint rests
  on this assumption — **measure it on real data before trusting it in fusion.**
- **Night/IR-monochrome robustness** and **antler pose canonicalization** specifically
  were not covered.

## Open questions (decide before building beyond Phase 0)

1. Do local keypoint methods (LoFTR/LightGlue/SIFT) actually fire on antler tine
   geometry, or is an antler-graph representation (tines/beams as a graph) required?
2. How to handle year-over-year regrowth — anchor identity on stable invariants
   (pedicle/base, gross frame topology, persistent drop-tine/kicker attachment points)
   vs. an identity timeline of linked seasonal nodes?
3. What is the actual measurement error of Gemini-estimated B&C measures on real
   trail-cam frames — tight enough for *individual* identity, or only size class?
4. Fusion recipe: how much to down-weight size/ratios, and score-level calibrated
   fusion (WildFusion-style) vs feature-level concatenation (LOMO-style), given one
   input (Gemini measurements) is noisy and another (embedding) is dense — at what cost?

## Recommended migration path (cheapest-first, each independently shippable)

| Phase | Action | Cost / risk |
|---|---|---|
| **0 — now** | Down-weight size/ratio terms, up-weight distinctive markers in `compareFingerprints`. | Trivial code; high-confidence direction. **Shipped — see ADR 0007.** |
| **0b** | Measure Gemini measurement error on a hand-labeled sample; gate trust in the fingerprint. | One eval script; decides everything downstream. |
| **1** | Add a learned embedding of the antler crop (off-the-shelf MegaDescriptor / DINOv2), store in pgvector, cosine 1-NN; **score-level fuse** with the structured score. | Embedding = one cheap forward pass/crop (no Gemini); reuses pgvector. |
| **2** | Add a local-verification pass on the shortlist — but **spike-test** keypoints-on-antlers first; if they don't fire, build the tine-graph representation. | Higher per-pair compute, shortlist-only. |
| **3** | Tune the open-set "new buck" threshold empirically; model regrowth via an identity timeline (seasonal nodes). | Ongoing calibration. |

**Cost framing:** the embedding + local match are *cheap* relative to the existing
Gemini fingerprint — the expensive part is already the LLM call. This adds accuracy
mostly with local compute.

## Sources (21 primary, all verified)

Wildlife re-ID / fusion / metric learning:
- arXiv 2408.12934 — WildFusion (global + local score fusion)
- ceur-ws.org/Vol-4038/paper_253.pdf — AnimalCLEF 2025 (2nd/172; +21pp ablation)
- arXiv 2311.09118 — MegaDescriptor / WildlifeDatasets (cosine 1-NN, thresholds)
- arXiv 2406.09211 — WildlifeReID-10k benchmark (open-set baselines)
- PMC8472616 — metric learning for wildlife re-ID (backbone/loss study)
- 2041-210X.14278 (Wahltinez 2024) — species-agnostic few-shot triplet framework
- IJCV s11263-024-02071-1 — ALFRE-ID (local aggregation, small data; global-vs-local)
- arXiv 1803.10630 — hand-crafted + deep fusion + metric learning
- ScienceDirect S0167865518309036 — hand-crafted + deep fusion (3 datasets)
- MDPI 13/11/2067 — Sika deer (body/pelage; SVM-on-embeddings refuted here)

Also fetched (VLM measurement reliability, pose/IR/temporal, open-set thresholds):
arXiv 2409.09788, 2510.26865, 2412.00947, 2412.21036, 2001.02801, 2510.17338,
2407.16133; ScienceDirect S1566253526002022; Springer 978-981-95-5758-5_13.
