# 2. Verification via gstack browser QA + performance/memory budgets (not Playwright/Vitest)

Date: 2026-06-20
Status: Accepted

## Context

The defining failure of the mobile core was an **iOS Safari memory crash** in the
photo grid (full-resolution images decoded en masse, no thumbnails, no
windowing). Headless-Chromium Playwright tests would never have reproduced it —
it is a device/engine memory-limit failure, not a functional bug.

The repo currently has only 2 Playwright e2e specs (photo filters) and no Vitest
(despite CLAUDE.md claiming both). Traditional CI test pyramids add maintenance
weight without catching the actual failure class, and the project is a
pre-launch, single-operator dogfood being improved with AI agents.

## Decision

Verification for the mobile-core hardening loop is:

1. **Performance / memory budgets as the primary, enforced gate.** Concrete,
   measurable limits make the crash class impossible *by construction* rather
   than caught after the fact. Budgets include (initial set, to be tuned):
   - Server-generated thumbnail max dimensions and byte size.
   - A ceiling on concurrently-decoded images (enforced via windowing /
     virtualization, not just lazy-loading).
   - Max live DOM nodes in the photo grid.
   - JS bundle / LCP budget for the mobile core routes.
2. **gstack browser-driven QA** (the gstack `browse` / `qa` tooling) for
   functional and visual verification of the core flows on a mobile viewport.
3. Real iOS-device spot-checks are **optional**, not a required gate — the
   budgets are the guardrail that prevents the memory-crash class.

We are **not** adopting Playwright or Vitest. The 2 existing Playwright specs
and `SETUP_TESTS.md` are legacy and slated for removal/replacement. CLAUDE.md's
testing section must be corrected.

## Consequences

- **Positive:** Effort goes to the guardrail that actually prevents the failure
  (budgets + windowing) and to fast agent-driven QA, not to headless tests that
  cannot see the real bug. Lower maintenance surface.
- **Negative / risks:** No deterministic CI regression net — regressions are
  caught by budgets + QA passes, which depend on the loop running them. Budgets
  must be encoded as automatable checks (lint/build-time or a QA step) or they
  rot. If contributors other than the AI loop join later, this may need
  revisiting.
- Reversible-ish: nothing prevents adding Vitest/Playwright later, but the
  primary contract for "bulletproof" is the budget set, not test count.
