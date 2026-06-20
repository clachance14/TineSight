# 1. Public Showcase links via unguessable, revocable tokens

Date: 2026-06-20
Status: Accepted

## Context

TineSight is a strictly multi-tenant app. The constitution (Principle 3,
Multi-Tenant Data Isolation) requires Row-Level Security on every table and
states that cross-tenant access must be impossible; all reads are scoped to the
authenticated `auth.uid()` / account.

The product's core go-to-market motion, however, requires a Lease operator to
**Share** a **Showcase** — a curated set of trophy Bucks — with a prospective
lessee who has **no account and does not log in**, viewing on mobile. This is a
deliberate, intentional public-read path into data that is otherwise private.

We considered four postures: (a) unguessable revocable token, (b) token plus
optional expiry/password, (c) fully public & search-indexable, (d) require a
free viewer login.

## Decision

A Showcase is reachable via a link containing a **long, unguessable random
token**. Access rules:

- **No login required** to view a Showcase.
- The token is the only credential; possession of the link grants read access to
  that Showcase's curated content **only** — never the full Catalog or any
  other account data.
- Showcases are **not search-indexable** (noindex; tokens never exposed in
  sitemaps or public listings).
- The operator can **revoke or regenerate** a Showcase token at any time,
  immediately invalidating old links.
- Public Showcase reads go through a **dedicated, narrowly-scoped read path**
  (e.g. a token-gated endpoint / RLS policy keyed on the token), not by relaxing
  any existing account-scoped policy. Photo assets for a Showcase are served via
  their own access mechanism rather than the private 1-hour signed URLs used in
  the authenticated app.

Expiry and per-Showcase passwords are **deferred** (option b) — not built now,
but the token model leaves room to add them later.

## Consequences

- **Positive:** Frictionless "just send a link" marketing that works on mobile
  with no recipient onboarding. Operator retains control via revocation. The
  public hole is explicit, auditable, and limited to curated Showcase content.
- **Negative / risks:** A leaked link is viewable by anyone until revoked
  (mitigated: unguessable token, revocation, no indexing, curated subset only).
  Introduces a second read path that must be kept rigorously separate from the
  account-scoped path — a future change to data access must consider both.
- This is a documented, intentional exception to Principle 3's "no public read"
  posture, scoped strictly to Showcase content the operator explicitly curated.
