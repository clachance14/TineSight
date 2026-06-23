# 5. Automatic fingerprint-first re-identification

Date: 2026-06-22
Status: Accepted

## Context

Re-identification is TineSight's North Star ("First Buck Re-Identified") and the
whole point of the Catalog: linking new Detections to an already-known **Buck**
as **Sightings** (see `CONTEXT.md`). Yet in practice re-ID was not happening for
ongoing Photos:

- `analyze-photo` did **no** re-ID. New trail-cam Photos containing an
  already-catalogued Buck produced unassigned Detections and nothing proposed a
  Sighting.
- `post-creation-scan` only ran **once, at Buck creation**, scanning existing
  unassigned trophy Detections against the new Buck.
- The only ongoing path was a manual "Find Matches" sweep, sitting on `/trophy`,
  a page not even reachable from the nav. So sightings of existing Bucks were
  effectively never surfaced.

Meanwhile cost is a live constraint: a single day's run billed ~$100 of Gemini,
driven mostly by the expensive `compareDeers` / fingerprint Thinking calls. We
cannot make re-ID automatic by spraying Gemini at every new Detection.

Two comparison engines already exist:
- **`compareFingerprints`** — structured B&C ratio/feature/measurement compare.
  Pure compute, **no Gemini, effectively free**. Requires both sides to have an
  `antler_fingerprint` (only trophy-band Detections get one per ADR 0004).
- **`compareDeers`** — Gemini visual compare. Expensive; the cost driver.

The Constitution forbids auto-merging Buck identities: re-ID suggestions
**always** require human confirmation.

## Decision

Make re-ID **automatic but fingerprint-first**, triggered when a new buck
Detection acquires a fingerprint (the end of the `generate-fingerprint` job),
running a "reverse `post-creation-scan`": compare the new Detection against the
account's Catalog and propose **Match candidates**, never assignments.

Tiered by cost, mirroring ADR 0004:

| Fingerprint similarity | Action | Cost |
|------------------------|--------|------|
| ≥ strong threshold (~85%) | propose a `match_candidate` (pending) | free |
| ambiguous band (~70–85%) | escalate to Gemini `compareDeers`, then propose if it agrees | expensive, rare |
| below band | nothing | free |

- **Never auto-assign.** Every proposal is a pending `match_candidate` the
  operator confirms or rejects (no-auto-merge). Confirming sets `deer_id` — that
  confirmation *is* the act of adding a Sighting.
- **Review surfaces (both):** per-Buck on `/deer/[id]` ("N pending sightings",
  confirm/reject in context) with a count badge on the Catalog card, **and** a
  global inbox (the `/trophy` review, made reachable in nav with a badge).

## Consequences

- **Sightings now appear on their own, cheaply.** The common case (a strong
  fingerprint match) costs no Gemini. Gemini only fires on a narrow ambiguous
  band, keeping the cost faucet that caused the $100 bill nearly shut.
- **Known limitation: trophy-band only.** Auto re-ID needs a fingerprint, and
  per ADR 0004 only trophy-band Detections are fingerprinted. **New Sightings of
  a non-Trophy Buck will not auto-propose** — manual "link to existing" remains
  the escape hatch for those. Fingerprinting every buck Detection would fix it
  but reopens the cost cascade we deliberately gated; rejected for now.
- Thresholds (~85% strong, ~70–85% escalation) start as the values used by
  `post-creation-scan` and are tunable; they are a precision/recall/cost knob,
  not a contract.
- Re-ID becomes part of the automatic pipeline (a new trigger off
  `generate-fingerprint`), so backing it out later means untangling that hook —
  hence this record.
