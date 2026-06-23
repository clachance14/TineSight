# TineSight — Domain Glossary

> Canonical language for the TineSight domain. This file is a glossary only — no
> implementation details, no specs, no decisions. When code or conversation
> drifts from these terms, that drift is a bug to reconcile.

## Core terms

### Lease operator
The target user: a commercial hunting-operation owner who runs one or more
hunting leases and wants to attract and close lease deals by showcasing the
trophy bucks living on their land. The account holder.

### Photo
A single trail-camera image belonging to an account. The product-level term the
user thinks in ("my photos"). **Naming drift:** persisted as the `images` table
and read in some layers as "image"; the canonical product term is **Photo**.
Photos are imported on desktop (from a trail-camera SD card) and primarily
*viewed and shared* on mobile.

### Detection
A single animal found *within* a Photo by the AI. One Photo may contain several
Detections. A Detection is a region of a Photo, not an identity.

### Buck
An individual, named/catalogued male deer — a persistent identity that recurs
across many Photos over time. (Persisted as `deer`.) The thing a lease operator
actually cares about tracking. Re-identification links Detections to the same
Buck.

### Re-identification (re-ID)
Recognising that a Detection in one Photo is the **same Buck** already seen in
earlier Photos — "this is the same buck from last week." The core
differentiator. The North Star event is the **First Buck Re-Identified**.

### Catalog
The collection of distinct Bucks an account has identified — the browsable
roster of individual deer, each with its history of Photos. A Buck below the
Trophy threshold is still in the Catalog; the Catalog is **all** identified
Bucks, not only Trophies. **UI naming:** the catalog page is branded
"The Trophy Room" for showpiece feel — that is a marketing label for the
*Catalog page*, not a claim that every Buck on it is a Trophy. Confirm/identify
actions stay precise ("confirm sighting", "identify buck"), never "add to the
trophy room".

### Trophy buck
A **Buck whose antler Score crosses the threshold** that makes it worth
showcasing to attract a lease deal — the individuals the product exists to
surface. Trophy status is decided by **Score**, not by a glance. A Buck below
the threshold is still a Buck and still catalogued; it is simply not a Trophy.

### Score
The numeric measure of antler quality (Boone & Crockett-style gross/net inches),
used to decide whether a Buck is a **Trophy buck**. The Score is what "identifies
a trophy." Distinct from a **Size impression** (below), which is a cheap
qualitative glance, not a measurement. A Score is measured per **Detection**; a
**Buck's** Score is the *highest* Score across all its Detections (its best rack
view), so a poorer later photo never lowers a Buck's standing. The Trophy
threshold is per-account.

### Size impression
A coarse, cheap qualitative read of a Buck's rack ("spike / basket / standard /
trophy-looking", judged by rack width relative to the ears). Used only as an
early filter to decide which Bucks are worth the cost of full **Scoring** — it
is *not* the Trophy determination. **Naming drift:** persisted/returned in code
as `size_class`, whose `"trophy"` value is a size *impression*, not a confirmed
Trophy. The confirmed numeric measure is `score` / `score_class`. These are two
different things and the code currently conflates them at the Trophy gate.

### Trophy fingerprint
The distinguishing visual signature of a Buck (antler structure, markings) used
to drive Re-identification and matching between Detections.

### Match candidate
A proposed re-identification awaiting human confirmation — the AI suggests "this
Detection may be Buck X"; a Lease operator confirms or rejects. (Human-in-the-loop.)
Surfaced on the **Review** page (formerly "Trophy Dashboard") under **Matches**.

### New buck candidate
A group of lookalike trophy **Detections** the AI believes are one **Buck** that
is not yet in the **Catalog** — naming the group creates the Buck and links every
member Detection as a **Sighting**. Shown on the **Review** page under **New Bucks**.
**Naming drift:** generated and persisted in code as a *cluster* (the grouping
algorithm's term); "cluster" is engineering jargon and must never appear in the
UI — the operator-facing term is **New buck** / **New buck candidate**.

### Unsorted detection
A trophy **Detection** that is neither a **Match candidate** for a known **Buck**
nor part of a **New buck candidate** group — a loner awaiting review. Shown on the
**Review** page under **Unsorted**. **Naming drift:** referred to in code as
*unclustered*; the operator-facing term is **Unsorted**.

### Sighting
A confirmed instance of a **Buck** appearing in a Photo — a **Detection** that has
been assigned to a Buck, whether by confirming a **Match candidate** (Re-ID) or by
manual linking. Counted **one per assigned Detection**: if a Buck appears in five
Photos, that is five Sightings (burst photos are not yet de-duplicated into visits).
A Buck's `sighting_count` is the number of its assigned Detections, and its Sightings
are the history shown on its profile. **Adding a Sighting is the act of
Re-identification** — confirming that a new Detection is an already-catalogued Buck.

### Showcase
A curated, **public, no-login** collection of trophy Bucks (their profiles and
best Photos) that a Lease operator assembles to attract and close a lease deal.
Accessed via a shareable link, viewed on mobile by a prospective lessee who is
not an account user. This is outbound marketing — the public face of an
otherwise private, account-isolated Catalog.

### Share
The act of publishing/sending a Showcase link. (Distinct from inviting a
teammate *into* the account, which is team access, not sharing.)
