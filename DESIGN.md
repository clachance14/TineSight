# Design System — TineSight

> The anchor: **"my trophy room."** Every type, color, and layout choice serves the
> feeling of a prized, gallery-grade collection of bucks an operator is proud to show
> off. Not an admin database. Created by `/design-consultation` (2026-06-22), grounded
> in two independent design voices (Claude + Codex) that converged on this direction.

## Product Context
- **What this is:** A web app where hunting-lease operators build a catalog of trophy
  bucks via AI re-identification ("this is the same buck from last week").
- **Who it's for:** Commercial hunting-lease operators (pre-launch, operator dogfood).
- **Space/industry:** Hunting / trail-camera / wildlife re-ID. Peers: HuntStand, onX,
  Spypoint, Moultrie galleries. Collection-pride peers: Letterboxd, Discogs, watch/wine apps.
- **Project type:** Mobile-first web app (touch-first phone browser). Dark mode default.

## Aesthetic Direction
- **Direction:** Luxury/Refined × natural-history gallery. "A private trophy room at dusk:
  warm walnut-and-brass materials, each buck lit like a framed plate."
- **Decoration level:** intentional (warm dark materials, rationed copper light; no texture noise).
- **Mood:** Hushed, expensive, reverent. The animals are the page; chrome gets out of the way.
- **Reference:** Letterboxd (dark poster grid, quiet tracked-uppercase controls).

## Typography
The brand tension is **engraved serif name + machined mono number** = craft meets
measurement, which is exactly what AI re-ID is.
- **Display/Identity:** **Fraunces** — buck names (italic), section titles. Engraved,
  collectible, plaque-like. Use high optical size.
- **Body/UI labels:** **DM Sans** — dates, sightings, filters, status. Deliberately
  demoted; small, often tracked-uppercase. Never competes with name or Score.
- **Data/Numbers:** **JetBrains Mono** (tabular-nums) — **every number**: Score,
  confidence, counts, timestamps. Precise instrument readout.
- **Loading:** Google Fonts. `Fraunces` (ital, opsz 9..144, wght 400/500/600),
  `DM Sans` (400/500/600), `JetBrains Mono` (500/700).
- **Scale (px):** 11 (label) · 13 (body) · 15 · 17 · 19 (card name) · 21 · 24 (score)
  · 38 (hero name) · 46-52 (hero score). Hero name `clamp(32px,7vw,52px)`.

## Color
Built on the existing **"Premium Outdoors" tokens** already wired into Tailwind v4
(`app/globals.css @theme`). Use the token utility classes, not raw hex. Copper/brass
is rationed — the Score numeral, active controls, the trophy frame.
- **Background:** `deep-forest #1C2321` (`bg-slate-deep` / `bg-deep-forest`).
- **Surface:** `forest #2A3330` (`bg-slate`). Raised: `forest-light #3A4340` (`bg-slate-light`).
- **Text:** primary `parchment #F2EDE4` (`text-cream`) · muted `weathered #A8A092` (`text-cream-dark` / `text-weathered`).
- **Accent (copper/brass):** `brass #C8A55C` (`text-copper` / `text-brass`) · light `brass-light #D4B76D` · dark `brass-dark #B8954C`.
- **Score-gold = `brass-light #D4B76D`** — the Score numeral / plaque. The single most
  important figure on any card; visually heavier than status, date, or counts.
- **Saddle `#8B4D3B`** (`text-saddle`) — secondary warm accent, used sparingly.
- **re-ID confidence** lives on the pending-match review, NOT on settled catalog cards.
- **Dark mode:** this IS the design (the `.dark` theme). No light mode planned.

## Spacing
- **Base unit:** 8px. **Density:** spacious (gallery breathing room; the wall space
  between frames is doing work — don't crowd).
- **Scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64.

## Layout
- **Approach:** hybrid — curated/editorial gallery rhythm, not a uniform matrix.
- **Grid:** mobile 2-col (touch-first); 3-col ≥720px; 4-col ≥980px. Generous gutters.
- **Featured hero:** the highest-Score buck gets an oversized poster card at the top of
  viewport one. Viewport one reads as a *poster of your best animal*, not a toolbar.
- **Controls:** quiet tracked-uppercase mono sort controls (Score / Last seen / Trophies),
  right-aligned under a placard label ("THE CATALOG · N BUCKS"). No chip bar, no sidebar.
- **Card density toggle:** **Immersive ⇄ Compact** (Letterboxd-style, top-right).
  Immersive = full-bleed mount (showcase for a prospect). Compact = framed plate
  (fast scan of your own catalog). Ships both design voices instead of forcing one.
- **Max content width:** ~1180px; images allowed to feel large.
- **Border radius:** photos 10-12px · Score plaque tight 4px (engraved) · hero 14-16px.

### The catalog card (canonical)
A trophy mount, not a data row. The vertical read is **Photo → Name → Score**.
- **Immersive (default):** full-bleed portrait buck photo (4:5) with a bottom gradient
  scrim; name in Fraunces overlaid bottom-left; **Score as an inset copper/gold plaque
  chip** bottom-right (mono); last-seen + sightings quiet beneath the name.
- **Compact:** photo on top (1:1), name (Fraunces italic) + Score plaque on a darker
  brass band below. Clearer Score read; degrades gracefully when a photo is weak.
- **Trophy status = material, not a badge:** a confirmed trophy gets a brass top-light
  hairline (gold gradient) + copper frame. No "TROPHY" pill.
- The Score is the hero metric on every card (per ADR 0004 — trophy is decided by Score).

## Motion
- **Approach:** minimal-functional + one intentional touch.
- **Cards:** lift + lighten on hover/press (`translateY(-2px)`, frame brightens). Touch
  targets ≥44px.
- **Easing:** enter ease-out, exit ease-in. **Duration:** micro 100ms, short 140-250ms.
- No scroll choreography, no parallax, no decorative animation.

## Anti-slop guardrails (hold these)
No purple/blue gradients. Nothing centered by default (plaque text is flush-left).
No 3-column icon grids, no stat-tile dashboards. No badge soup or colored status pills
(status is material). No decorative blobs/orbs/glassmorphism. No cards-inside-cards.
No admin-table energy (checkboxes, dense field labels, tiny thumbnails). No emoji as
UI. No system-ui display font. Copper is never a flat fill button.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-22 | Initial design system created | `/design-consultation`; anchor "my trophy room"; Claude + Codex voices converged. |
| 2026-06-22 | Immersive ⇄ Compact card toggle | Resolves the one divergence (full-bleed vs framed plate) by shipping both; serves both showcase + scan use cases. |
| 2026-06-22 | Score = gold mono plaque, dominant | ADR 0004 — trophy is decided by Score; the catalog must make it legible in one second. |
| 2026-06-22 | Trophy status as material, not badge | Gallery elegance; the lit one is the prize. re-ID confidence stays on match review, not catalog cards. |
| 2026-06-23 | `/trophy` rebuilt to the system + renamed "Review" | Page was the lone "admin database" (stat tiles, badge soup, checkboxes, system font). Now: Fraunces names, mono confidence readouts, gallery cards, tracked-uppercase tabs, tokens only. |
| 2026-06-23 | "Cluster/Unclustered" → "New Bucks/Unsorted" | "Cluster" was algorithm jargon with no glossary entry. Operator-facing tabs are Matches · New Bucks · Unsorted (see CONTEXT.md). |
