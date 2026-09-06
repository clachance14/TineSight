# Proposed workflow for a multi-location camera operator

Context: dozens of game cameras across multiple locations, importing several times per week, with most frames unwanted. This is a product proposal informed by the audit, not an implemented feature list. The desired outcome is: finish a card pull quickly, trust that nothing useful was lost, and retrieve any interesting animal or event later.

After reviewing the earlier plans, much of this is recovered intent rather than new scope. The [planning-intent map](planning-intent.md) identifies prior requirements, later decisions, and newly proposed details. In particular, June ADR 0004 already calls for trophy-first tiers, collapsed lower-value photos, and a separate people/vehicle surface. Preserve that default presentation within an Import review; Recently uploaded and Capture chronology remain distinct sorting choices.

## Start with three recurring jobs

1. **Import and reconcile:** bring in several cards/folders, identify their sources, and know exactly which files arrived, were duplicates, failed, or are still processing.
2. **Triage the new material:** collapse repetitive frames, remove obvious unwanted material from the working view, and inspect uncertain photos without losing valuable animals.
3. **Investigate:** compare cameras, locations, dates, species, and individual Bucks with reusable filters and a consistent photo sequence.

The Buck Catalog and public Showcase retain the existing trophy-room treatment. The Photos workspace must also serve operational review. Proposed compact, temporary bulk-review controls are a deliberate scope distinction from DESIGN.md's catalog-first restrictions; do not silently change that document or redesign the Catalog as a dense management screen.

## Import should remember the operation

An upload is an operator-visible **Import**, such as “Friday card pull,” spanning multiple camera sources. Internal transport batches must not become the organizing concept exposed to the user.

- Drop multiple folders/cards together. Show a source preview grouped by folder: original folder, file count, assigned Camera, and Location. Remember confirmed mappings for next time, with an obvious override.
- Camera is a persistent physical device; Location is where it was deployed at capture time. Moving a camera must not move historical photos on the map. Preserve deployment history or snapshot source location onto each imported photo.
- Do not assume identical make/model means the same Camera. Use a real identifier when available; otherwise ask for an explicit mapping once. Preserve relative source paths and original filenames, but use unique internal file identities.
- Keep Uploaded date and Captured date separate. Flag implausible clocks, and offer an explicit offset correction for a camera/date interval while retaining original EXIF. Sorting the Import by uploaded date should always surface freshly transferred photos.
- Show reconciled totals: selected = new + exact duplicates + rejected; accepted new = transferred + waiting/retrying + failed. Analysis and preview readiness are separate progress dimensions.
- An upload remains reachable from any page. Navigation is safe; a reload can recover session state, and reselecting a folder resumes missing bytes where browser access requires it. Never imply that a browser can retain local file access indefinitely without user interaction.
- Final summary links directly to **Review this import**, **Retry failures**, and the source groups. Completion means every file has an accountable outcome.

## Triage should reduce decisions, not just hide thumbnails

Suggested views are overlapping queries with honest counts, not exclusive categories whose totals appear to add up:

- **New:** material not yet reviewed, across the latest imports or a selected import.
- **Bucks:** useful deer candidates, with scoring available where analysis supports it.
- **Other wildlife:** species important to this operator, including predators or hogs when relevant.
- **People & vehicles:** operational/security interest, never silently classified as trash.
- **Likely empty:** confident no-animal/no-person detections; uncertain classifications remain reviewable separately.
- **Needs a look:** low-confidence classifications, uncertain quality, processing failures, and missing metadata.

“Trash” is an operator preference, not a universal species label. A doe may be uninteresting to one workflow and useful for another. Begin with reversible **Keep / Archive / Review later**, with undo and a recoverable archive. Permanent deletion is a separate intentional action. Automated rules may archive high-confidence classes the user chooses; protected Bucks, favorites, people, vehicles, and uncertain classifications need explicit rule semantics.

Burst grouping should collapse closely timed frames from one camera into an expandable **event** with a representative frame and count. Exact duplicate detection is separate from burst grouping: slightly different frames can hold the best antler angle. An event is also separate from a confirmed Sighting, which remains a Detection assigned to a Buck under the existing domain model.

Offer an all-frames mode. While grouped, filters must consider all underlying frames, not just the chosen cover; a qualifying frame becomes the cover where possible. Bulk archive of an event must clearly mean all of its frames. Human confirmation of Buck identity remains distinct from automatic event grouping.

## Filtering model

Keep the always-visible controls short: **Location · Camera · When · Animal · More**, alongside **Sort**, **Group**, and **Saved views**. Reveal detailed dimensions progressively, use searchable multiselects for dozens of cameras, and show a compact readable summary of active conditions. On mobile, use a focused filter sheet with an explicit result count and apply action; retain touch targets of at least 44 px.

| Dimension | Useful choices |
| --- | --- |
| Source | One/multiple properties or locations; cameras; import/card pull; unmapped source |
| Time | Captured or uploaded; relative periods; custom dates; time of day; weekday; daylight/night |
| Animal | Species; buck/doe/unknown; one or several named Bucks; unassigned detections; minimum Score; points range |
| Quality | Clear/blurred/obstructed/overexposed; uncertain; analysis/preview failures |
| Review | Unreviewed, kept, archived, favorite, review later; pending Buck match |
| Relationships | Contains any selected species; excludes a species; contains an unassigned Buck; repeated event vs isolated frame |

Daylight/sunrise-relative filters require trustworthy capture time, timezone, and source location. Quality dimensions require calibrated detection signals. Unavailable data must be labeled unknown rather than guessed into a filter category. Keep measured/authoritative scores, estimates, and unscored photos distinct.

The default combination is **OR within a selection, AND across dimensions**: Camera 4 OR Camera 7, AND this week, AND buck. Put explicit exclusions and advanced Any/All groups behind More. Avoid requiring a Boolean query builder for routine review.

Detection-level conjunctions must apply to the **same Detection**: “Buck + Score 150+” should not qualify by combining a small buck and a different animal's score. “Contains hogs and bucks” is instead a photo-level composition across Detections. Explain these behaviors in labels rather than exposing SQL concepts.

Available option counts should reflect the active scope. Keep zero-match choices understandable rather than silently removing selected values. A cleared filter should affect only its dimension; Clear all should preserve the selected workspace/import when that scope is visually separate.

## Examples that should take a few selections

| Question | Saved view definition |
| --- | --- |
| What is new since my last review? | Unreviewed + imports since last review; group by import, then camera |
| What did the north cameras catch this week? | North location + selected cameras + capture date last seven days |
| Which good Bucks appeared during daylight? | Buck + minimum Score + daylight + last fourteen days; highest Score first |
| Where has Split G2 been showing up? | Named Buck Split G2 + selected locations + this season; chronological events |
| Clear the wind-triggered junk from this pull. | Current import + likely empty + exclude people/vehicles + exclude uncertain; preview and archive matching |
| Which cameras produce the most useless frames? | Camera comparison for one interval; show empty/repeated/uncertain counts alongside useful events |
| Check for people at the gates overnight. | Gate locations + people OR vehicles + night + last seven days |

Saved views retain filters, sort, grouping, and display density. Relative dates roll forward automatically; fixed investigation ranges stay fixed. Views run against new data rather than holding a static selection. Avoid default cross-account sharing of saved filters or signed image URLs.

## Sorting, grouping, and acting are different controls

- **Sort** changes sequence: recently uploaded, capture chronology, highest Score, or best review quality where a reliable metric exists.
- **Group** changes presentation: import, location, camera, day, or event. Every group retains a stable order and expandable contents.
- **Filter** changes membership. Opening a photo, swiping, returning, and selecting all must preserve that exact membership and order.
- **Bulk action** states its scope: “Select this page,” “Select 238 matching photos,” or “Select 31 events / 238 photos.” A background completion must not silently expand a destructive selection after the operator has chosen it.

Fast review supports keyboard navigation and shortcuts on desktop and clear thumb-reachable controls on mobile. Keep/Archive/Review later should advance predictably and allow undo. Restore the prior scroll position and filter state when closing a detail view.

## What the current code is missing for this workflow

Several filtering primitives already exist, including dates, score, species, areas, camera IDs, and stored filter presets. They are inconsistently exposed and do not yet form this operator workflow. Current correctness issues must be fixed before adding a wider filter menu.

**Newly elevated audit finding — P1 for mixed-camera imports:** `app/api/photos/upload/route.ts:206–235` takes Camera metadata from the first file and assigns that Camera to every file in the transport chunk. `components/upload/BulkUploader.tsx:545` chunks the general pending queue without grouping by source. A chunk crossing a folder/card boundary therefore misattributes photos. In addition, `lib/services/cameras.ts:25–42,96–113` identifies cameras by make/model/device identifier: identical models without a unique identifier collapse into one Camera. Source filters cannot be trustworthy while this occurs. Assign Camera per confirmed source group/file; never infer a physical device solely from its model.

BulkUploader's initialization payload (`:551–567`) also omits the location fields that Simple Upload can provide. For this user's main workflow, location assignment needs to be part of Bulk Upload rather than a capability confined to another tab.

## Suggested delivery order

1. Reliable, resumable import; per-source camera/location mapping; accountable completion and recovery; fixed gallery pagination/order/date behavior.
2. An Import review view with reversible triage, source/time/species filters, saved views, and stable bulk-action scope.
3. Event grouping and representative-frame selection, with uncertain frames and identity confirmation preserved.
4. Deeper investigations: sunrise-relative time, camera comparisons, quality filters, and user-defined automatic archive rules after validating their accuracy.

Measure time from card selection to completed review, unresolved file count, unique useful events found, review actions per useful event, and archive reversals. The audit establishes no baseline yet. Do not promise an arbitrary percentage of trash removal without measuring missed useful photos.
