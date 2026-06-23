---
name: quality-sweep
description: Post-build structural-quality audit of a diff by TWO independent models (Codex + Claude), looking for opportunities to make the code dramatically simpler/cleaner without changing behavior. A mini "thermo-nuclear" review — it does not approve merely-correct code; it hunts code-judo simplifications, file-size smell, spaghetti branching, reinvented helpers, layering/type-boundary problems. Use after a feature build is green (it is step 8 of /feature), or standalone — "quality sweep", "opportunity review", "is this well-built", "look for code-judo", "structural review of my changes". Runs on the diff vs the base branch.
---

# /quality-sweep — dual-model structural opportunity review

After a build is green, "it works" is the floor, not the bar. This skill runs two
**independent** structural-quality audits over the diff — one by Codex, one by Claude —
then merges them. The goal is to surface opportunities to make the change dramatically
simpler or cleaner **without changing behavior**, and to catch structure regressions a
correctness review misses. Inspired by Cursor's thermo-nuclear-code-quality-review, mini
and wired to TineSight.

Two models, not one — and both **context-blind**. A model reviewing its own output inside
the conversation that produced it rubber-stamps it: it carries every assumption and
rationalization that wrote the code. So neither pass is allowed to run in the building
conversation's context. Codex is independent by construction (separate process, sandboxed
to the repo, never sees this chat). The Claude pass is made independent by running it as a
**fresh subagent** that receives only the diff + these dimensions — no conversation
history, no design rationale. The value is the disagreement between two blind reviewers.

This is structural quality only. For correctness/security bugs, that's `/review`
(CodeRabbit-style) — run that too; the two are complementary.

## Preconditions
- **Build/lint/type-check must be green first.** Never restructure broken code. If `npm run build` / `npm run lint` / `npm run type-check` aren't green, stop and say so. (Pure-logic tests run via `npm run test:unit`; flows are verified with gstack browser QA, not Playwright — ADR 0002.)
- There is a diff to review (vs the base branch, usually `master`). If the working tree is clean, ask what to review.

## The dimensions (the lens both models apply)

Rank findings in this descending order of severity:

1. **Structural regression** `[P1]` — a previously cohesive module got more coupled/harder to scan; a behavior-risky shortcut. Blocking.
2. **Secondary-path guard bypass** `[P1]` — a change adds an entry into a *secondary* code path (a fallback/alias tier, a retry branch, a re-read, an alternate `catch` path) that skips a guard, validation, normalization, or shape-check the *primary* path applies to the same field. The new entry looks correct in isolation but inherits none of the primary path's invariants. Classic tell: the primary branch routes a value through a normalizer / a Zod parse / a bounds check before assigning, and the parallel branch does a plain assign. Fix: funnel both paths through ONE shared guarded helper.
3. **Missed code-judo** `[P2]` — a restructure that makes the implementation dramatically simpler while preserving behavior. ("Is there a move that makes this half the size?")
4. **Spaghetti branching** `[P2]` — new ad-hoc conditionals / special cases scattered into an already-busy shared flow instead of behind their own abstraction.
5. **Reinvented helper** `[P2]` — duplicated logic an existing util/service already does (TineSight ethos: search before building; reuse before invent — especially the `lib/services/*` layer).
6. **Layering violation** `[P2]` — logic in the wrong layer: Supabase calls in a component instead of `lib/services/*`, missing RLS/`user_id` scoping, business logic in UI, `getSession()` instead of `getUser()`, secrets in a `NEXT_PUBLIC_` var. (See CLAUDE.md Next.js/Supabase patterns + Constitution.)
7. **Type/boundary murk** `[P3]` — `any` without a justification comment, needless optionality, cast-heavy contracts, hand-written types that should come from `types/database.ts`, untyped API request/response.
8. **File-size / decomposition** `[P3]` — the PR pushes a file well past ~1000 lines, or a function ballooned; flag for decomposition.
9. **Needless serialization** `[P3]` — serial `await`s on independent work that should be `Promise.all`.

A finding must name the file:line, the specific smell, and the concrete restructure — not "consider improving X."

## Workflow

### 1. Scope the diff
Determine the base branch (usually `master`) and capture the changed files: `git diff master...HEAD --stat` (or `git diff` for uncommitted work). Note any file the PR pushes past ~1000 lines.

### 1b. Derive change-specific stress questions
The generic dimensions catch generic smells; the sharpest findings come from 2-4 questions tailored to THIS change, and the cross-model signal is strongest when **both models are asked the identical questions**. Read the diff and write down the specific risks it raises — e.g. "is this new matching threshold too loose / could it collide bucks?", "does this fallback skip a guard the primary path has?", "is this Gemini output trusted without validation?". Append the SAME question list verbatim to both the Codex prompt (step 2) and the Claude subagent prompt (step 3). Do not give one model a hint you withhold from the other — identical inputs are what make the agreement (or disagreement) meaningful.

### 2. Codex pass (independent)
Run `/codex review` (it reviews the branch diff against base and emits `[P1]`/`[P2]` findings). If you want the structural lens explicitly, run `/codex review` with this focus appended:

> Audit for STRUCTURAL QUALITY, not correctness. For each changed file, ask: is there a code-judo move that makes this dramatically simpler with identical behavior? Did a cohesive module get more coupled? Does a new entry into a secondary path (fallback/alias tier, retry branch, re-read, alternate catch) skip a guard, validation, normalization, or shape-check the PRIMARY path applies to the same field? Are new special-cases scattered into a shared flow instead of behind an abstraction? Is an existing helper (esp. a lib/services/* function) reinvented? Is logic in the wrong layer (Supabase calls in a component, missing user_id/RLS scoping, getSession instead of getUser, secrets in NEXT_PUBLIC_)? Any `any`/needless optionality/cast-heavy contracts/hand-written types that should come from types/database.ts? Did a file cross ~1000 lines? Any serial awaits that should be Promise.all? Rank findings [P1] structural-regression/guard-bypass > [P2] missed-simplification/spaghetti/reinvent/layering > [P3] types/file-size/serialization. Each finding: file:line, the smell, the concrete restructure. Do NOT approve merely-correct code.

Append the change-specific stress questions from step 1b to this prompt (the same list you give the Claude subagent). Present Codex's output verbatim. Capture its findings list.

### 3. Claude pass (independent — a FRESH subagent, not the building conversation)
Do NOT review the code yourself in this conversation — you wrote it, so you're biased toward approving it. Dispatch a fresh subagent (the `Agent` tool, e.g. `agent-skills:code-reviewer` or `general-purpose`) whose prompt contains ONLY:
- the diff (or the changed file paths to read),
- the dimensions above + the `[P1]/[P2]/[P3]` ranking and output shape, and
- the change-specific stress questions from step 1b — the SAME list, verbatim, that you appended to the Codex prompt.

Do not include the design rationale, the feature's goals, or any "why" from this chat — the subagent must judge the code cold, the same way Codex does. It returns its findings list; that is the Claude pass. (When `/quality-sweep` is invoked standalone with no building context, you may review directly — the bias only exists when you authored the code in-conversation.)

### 4. Merge (cross-model)
```
QUALITY SWEEP — CROSS-MODEL
  Both found:    [findings both models raised]
  Only Codex:    [Codex-unique]
  Only Claude:   [Claude-unique]
  Agreement: X% (N/M unique findings overlap)
```
Both-found findings are the highest-confidence opportunities.

### 5. Decide — apply now vs log as follow-up
For each finding:
- **Apply now** if it's small, behavior-preserving, in-scope, and re-verifiable green. Code-judo simplifications that shrink the diff usually qualify.
- **Log as follow-up** (don't silently expand the PR) if it's a larger restructure, touches files outside this change, or risks behavior. A quality sweep must not balloon scope — record it as a `TODO`/issue and move on.
- A `[P1]` structural regression introduced by THIS change should be fixed now, not logged.

State the apply/log split explicitly. This is a reversible-vs-one-way-door call; only escalate to the user if a fix would change behavior or scope.

### 6. Apply + re-verify
Apply the apply-now set (behavior-preserving edits only). Re-run `npm run build` + `npm run lint` + `npm run type-check` — all green before claiming done. Never auto-commit. Report what was applied, what was logged, and the cross-model agreement rate.

## Output
End with: cross-model finding table, the apply/log decision per finding, verification result, and the deferred-follow-up list. If nothing structural was found, say so plainly — a clean sweep is a valid result, but only after both models genuinely looked.
