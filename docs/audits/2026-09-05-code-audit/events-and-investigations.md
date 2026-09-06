# Event grouping and deeper investigations: feasibility review

This closes the assessment portions of execution items T43/T44; it does not claim event grouping, clock correction, or camera-comparison dashboards are implemented. Those are new product proposals distinguished from recovered requirements in planning-intent.md.

## Preserve frames and identity

Current bulk selection resolves photo IDs from the exact query. Archive, Keep and Review Later operate on an explicit selection, not an inferred event. Browser evidence confirms 600 matching empty frames can be archived and restored without including security photos. All uploaded originals remain individual records; no representative-frame selection deletes its siblings or merges Buck identities.

A future event view should group only photos sharing a known physical camera and reliable capture time within a user-visible interval. Unknown cameras, missing times, implausible clocks and unreviewed clock corrections must remain ungrouped. A folder alone is provenance, not proof of a physical device. Changing a grouping interval must never change a photo's identity or stored review decision.

Show one representative with a frame count and an explicit Expand all frames action. Distinguish “select representative” from “select all N frames in this event”; materialize selected photo IDs before an action so new analysis or incoming frames cannot silently expand scope. Keep person/vehicle and uncertain frames visible even when another frame is selected as the representative. Similar appearance alone must not confirm that two Bucks are the same animal.

## Data prerequisites and current state

| Investigation | Current support | Remaining prerequisite |
| --- | --- | --- |
| Camera/location/date/species/score/quality | Combined gallery filters; per-file camera assignments; batch capture-location snapshots | Browser matrix continues in browser-simulation.md |
| Saved weekly review | Saved filter/sort views; rolling Today/7-day/30-day presets; fixed custom ranges | Reopen behavior and local-day boundaries covered by gallery tests; browser saved-view check still required |
| New, kept, or deferred material | Independent review_status with explicit bulk actions | Final UI verification in progress |
| Compare cameras' useful/empty/uncertain proportions | Required photo/status/source fields exist | A grouped aggregate UI with consistent denominators, filters and counts; count events separately from frames if grouping is introduced |
| Day/night or sunrise-relative investigation | Capture time and optional capture-location coordinates exist | Trustworthy camera clock/timezone, DST handling, local solar calculation and visible unknown-time treatment; do not infer night solely from UTC hour |
| Historical location comparisons | Batch location is captured for each source group | Explicit movement/deployment history and optional clock correction with original EXIF retained |

Relative views should evaluate their date interval when opened/refreshed, not permanently capture the day on which they were saved. Fixed investigation intervals should retain their exact range. Unknown source/time/quality values must be visible filterable states rather than silently joining a favorable category.

## Acceptance for future event work

Validate multi-camera simultaneous events, burst intervals spanning midnight/DST, null times, moved cameras, security+deer overlap, representative replacement, late processing, selection stability, full-frame export and reversible archive. Measure decisions per useful event and missed useful photos before enabling automatic archive rules. No claimed trash-removal percentage is justified by the synthetic simulation.
