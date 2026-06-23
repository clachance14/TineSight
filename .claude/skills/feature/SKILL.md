---
name: feature
description: Build a substantial TineSight feature or improvement end-to-end with delegated decision authority, every architecture fork cross-checked by Codex and every decision grounded in real data + the codebase. Runs the loop Explore → Grill → Ground → Cross-check → Decide → Record → Build → Verify → Sweep (dual-model structural opportunity review). Use when the user asks to "build", "add", "improve", or "design" a feature with real architectural weight (a new pipeline stage, a data-model change, a re-ID/matching change, anything with a genuine fork), or says "use the feature loop", "build this with Codex", "decide it yourself backed by Codex". SKIP for trivial work — a bugfix, copy change, rename, or dep bump should use /investigate or just be done directly.
---

# /feature — Decide-backed-by-Codex feature loop

A repeatable harness for building architecture-bearing features where the user has
delegated decision authority. The contract: **you make the calls, but every decision
must survive real evidence and an independent model (Codex) before it sticks.** The
user only adjudicates genuine one-way doors.

This skill is feature-agnostic. It is wired into TineSight's specific tools,
conventions, and data so the loop runs on real rails, not generic advice.

## When NOT to use this

This loop is for features with a real architectural fork. It is overkill for:
- bugfixes → use `/investigate` (root-cause first)
- copy/UI-polish changes → just do them, or `/design-review`
- renames, dep bumps, mechanical refactors → just do them

If the request has no genuine fork (no "we could do A or B and it's hard to reverse"),
say so and drop to the lighter path instead of running the full loop.

## Existing-feature improvements (the common case)

Most work here is improving a live feature, not greenfield. The loop is the same, with three extra disciplines:

- **Capture the baseline first (in GROUND).** Measure current behavior on the real corpus before changing anything, so the improvement is provable. (e.g. for a re-ID change: "matching linked N/M detections today" — state the number you're trying to beat.)
- **Map the existing consumers before you touch the path.** A working path has callers. Grep them, list them, don't break them. Prefer additive-first: build the new piece alongside, prove it, then rewire — never blast a multi-file change into a business-critical path in one shot.
- **Supersede, don't duplicate, the docs.** If a spec (`specs/<feature>/`) or plan already governs this area, amend it rather than writing a contradictory new one.

The fork on an existing feature is almost always "patch in place vs re-architect" — put Codex there.

## Hard rules (TineSight)

- **Never auto commit or push.** Describe changes, ask before committing, ask again before pushing. Stage files by name, never `git add -A`. (TineSight runs a pre-commit review hook — don't fight it.)
- **Human-in-the-Loop AI (Constitution P2).** The Gemini re-ID pipeline — `trigger/jobs/compare-deer.ts`, `trigger/jobs/cluster-trophy-detections.ts`, `lib/gemini/*`, `lib/services/matching.ts` — is change-with-care. It's the North Star (buck re-identification). No autonomous actions on matches; AI suggestions require user confirmation. There is no automated re-ID regression harness yet, so any change here must be proven by hand on the real corpus (GROUND) before it lands.
- **Schema-first.** Read `types/database.ts` before any ad-hoc SQL. Regenerate it (`npx supabase gen types typescript --linked > types/database.ts`) if migrations are newer. Tenancy is primarily `user_id` (with `account_id` on a few tables); RLS via `auth.uid()` is non-negotiable on every table (Constitution P3).
- **Service-layer discipline (Constitution).** Components never call Supabase directly — all data access goes through `lib/services/*.ts`. Use `getUser()`, never `getSession()`.
- **Verify before claiming done.** No "it works" without `npm run build`, `npm run lint`, and `npm run type-check` green. Pure logic is covered by `npm run test:unit` (node:test); flows are verified via gstack browser QA + performance/memory budgets (ADR 0002 — no Playwright/Vitest). Evidence before assertions.

---

## The loop

Work the steps in order. Track them with TodoWrite. Each step has a concrete output.

### 1. EXPLORE — correct the mental model before touching code
- Read `CLAUDE.md`, `.specify/memory/constitution.md`, `.specify/memory/product-vision.md`, and any relevant `specs/<feature>/` or `docs/plans/*.md` for the area.
- Read the actual code paths the feature touches. Do not trust the user's (or your own) description of how it works — verify in the files.
- Output: a short "here's what the code actually does vs what you assumed" if they differ. Surface contradictions immediately.

### 2. GRILL — one decision at a time, recommend a default each time
- Invoke `grill-me` (or `grill-with-docs` if you've adopted a CONTEXT.md/ADR convention — TineSight currently records decisions in `specs/` and `docs/plans/`).
- Walk the decision tree one question at a time. For each, give your recommended answer. Explore the codebase to answer questions instead of asking when you can.
- Output: a resolved decision tree. Note which decisions are reversible vs one-way doors.

### 3. GROUND — prove it on real artifacts, not one example
- Use the real input. If it's a photo/detection, parse the actual record. If it's data, query the real corpus.
- **Supabase (read-only debugging):** Management API — `POST https://api.supabase.com/v1/projects/fdwgmtzdjywvrnipatlk/database/query` with `Authorization: Bearer $(cat ~/.supabase/access-token)`. Service-role key for storage downloads is in `.env.local` (`SUPABASE_SERVICE_ROLE_KEY`).
- **Gemini (when the feature uses it):** key in `.env.local` (`GEMINI_API_KEY`), model in `GEMINI_MODEL`. Prototype the prompt against real data before wiring.
- **Test the whole corpus, not the one example that prompted the work.** One photo proves nothing — sweep the full set (many photos / many bucks across cameras) so an improvement is shown to generalize, not overfit one trophy.
- Output: evidence (numbers, samples) that the chosen approach works — and where it breaks.

### 4. CROSS-CHECK — Codex on the forks only
- For each genuine architecture fork, run the `codex` skill in **consult** mode (`/codex <question>`). Embed the concrete evidence from step 3 (Codex is sandboxed to the repo — it can read code but not `/tmp`, `/mnt`, or DB output, so paste the facts).
- **Resume the same Codex session across forks** so it keeps context.
- Frame it adversarially: "here is the fork and my recommendation — argue against it." Feed Codex any counter-argument the user raised; let it change its mind.
- Present Codex's output verbatim, then your synthesis. Flag where you disagree with Codex — cross-model agreement is a recommendation, not a verdict.
- Output: a decision per fork, with Codex's independent take on record.

### 5. DECIDE — you take reversible calls; escalate one-way doors
- **Reversible** (default, model choice, file layout, naming, retry policy): decide it, state it in one line, move on. Do not ask.
- **One-way door** (safety posture on bad data, data-model/schema shape, anything that corrupts a user's buck catalog if wrong, irreversible scope): `AskUserQuestion` — one question, recommend the first option, name the stakes.
- When unsure which bucket: if undoing it later is cheap, it's reversible.

### 6. RECORD — make the decision durable
- For spec-driven work, fold the decision into the feature's `specs/<feature>/plan.md` (the speckit flow). For a cross-cutting architecture decision worth preserving on its own, write `docs/adr/NNNN-title.md` (establish the `docs/adr/` dir if absent; next number, four digits) **only when all three hold**: hard to reverse, surprising without context, the result of a real trade-off. Otherwise skip it.
- For a recurring gotcha that bit you, add it to CLAUDE.md's **Lessons Learned** section.
- Output: the record diffs, written inline as decisions crystallize (not batched at the end).

### 7. BUILD — TDD where a runner exists, in increments, verified
- Constitution P5 favors **integration testing over unit testing**: prioritize user-flow gstack browser QA + performance/memory budgets (ADR 0002) over unit coverage. For pure logic, follow `superpowers:test-driven-development` (red → green → refactor) and cover it with `npm run test:unit` (node:test). No Playwright/Vitest.
- Land in reviewable increments, each green, starting with the highest-IP / highest-risk pure piece. Do not blast a multi-file change in one shot on a working, business-critical path — additive first, rewire second.
- **Verify** with `superpowers:verification-before-completion`: `npm run build` + `npm run lint` + `npm run type-check` all green before claiming any increment done. Report failures with the actual output.
- Then: ask before committing (per hard rules).

### 8. SWEEP — dual-model structural opportunity review
- Once an increment is green, run `/quality-sweep` on the diff: two INDEPENDENT structural audits (Codex + Claude) that hunt code-judo simplifications, spaghetti branching, reinvented helpers, layering/type-boundary problems, file-size smell. "It works" is the floor, not the bar.
- Apply the small behavior-preserving wins now and re-verify green; **log larger restructures as follow-ups rather than ballooning the PR.** A sweep must not silently expand scope.
- Output the cross-model agreement so the user sees what each model caught.

---

## Output shape each run

End with: what was decided (and by whom — you vs Codex vs user), what was built and verified (with evidence), what's recorded (spec/ADR/lessons), and what increments remain. Never claim completion without green build + lint + type-check.
