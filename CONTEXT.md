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
roster of individual trophy deer, each with its history of Photos.

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

### Showcase
A curated, **public, no-login** collection of trophy Bucks (their profiles and
best Photos) that a Lease operator assembles to attract and close a lease deal.
Accessed via a shareable link, viewed on mobile by a prospective lessee who is
not an account user. This is outbound marketing — the public face of an
otherwise private, account-isolated Catalog.

### Share
The act of publishing/sending a Showcase link. (Distinct from inviting a
teammate *into* the account, which is team access, not sharing.)
