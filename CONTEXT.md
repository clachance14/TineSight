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
