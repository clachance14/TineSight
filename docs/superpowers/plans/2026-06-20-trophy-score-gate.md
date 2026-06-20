# Trophy Score Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "trophy" a decision based on a numeric antler **Score** (not the cheap `size_class` glance), using a two-step gate so the expensive fingerprint runs only on bucks whose mid-cost score estimate clears a confirm band.

**Architecture:** Three cost tiers in the existing Trigger.dev pipeline. (1) Every buck still gets the cheap `classifyDeerCrop` glance → `size_class`; a coarse cut drops only spikes. (2) Surviving bucks get a **new mid-cost `estimateAntlerScore` Gemini call** → a gross-score estimate stored on the detection. (3) Bucks whose estimate is `≥ threshold − confirm_band` are queued for the existing expensive `extractAntlerFingerprint`, whose authoritative `gross_score` makes the final trophy call (`is_trophy`) against a per-account threshold — an automatic promote/demote. All gate math lives in one pure module, unit-tested.

**Tech Stack:** TypeScript 5 (strict), Next.js 14, Trigger.dev v3, `@google/genai` (Gemini), Supabase (Postgres), Zod. Tests: Node 24 built-in test runner (`node --test`, native TS type-stripping — **not** Vitest/Playwright, per `docs/adr/0002-verification-via-gstack-and-budgets.md`).

**Reference docs to read before starting:**
- `docs/adr/0003-trophy-gated-ai-cost-cascade.md` — the decision this implements.
- `CONTEXT.md` — canonical terms: **Score**, **Trophy buck**, **Size impression**.
- `trigger/jobs/analyze-photo.ts` — the pipeline being rewired (Stage 1 detect, Stage 2 classify, fingerprint queue).
- `trigger/jobs/generate-fingerprint.ts` — produces `fingerprint.scores.gross_score` today.
- `lib/gemini/client.ts` — `classifyDeerCrop` is the exact pattern the new call mirrors.

**Verification model (per ADR 0002 — no Vitest/Playwright):**
- Pure logic → `node --test` unit tests (Task 1).
- Integration (Gemini call, jobs, DB) → `npm run type-check`, `npm run build`, a real-Gemini script (Task 7), and a manual Trigger.dev batch QA pass.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `lib/scoring/gates.ts` | Pure gate math (coarse cut, confirm band, trophy decision, buck-max score) + constants. No I/O. | Create |
| `lib/scoring/gates.test.ts` | `node:test` unit tests for the gate math. | Create |
| `package.json` | Add `test:unit` script. | Modify |
| `supabase/migrations/042_score_based_trophy_gate.sql` | New columns (`detections.score_estimate`, `score_estimate_confidence`, `score_gross`, `is_trophy`; `profiles.trophy_threshold`), indexes, RPC switch to `is_trophy`. | Create |
| `types/database.ts` | Reflect new columns. | Regenerate (or manual edit) |
| `lib/gemini/types.ts` | `scoreEstimateSchema` + `ScoreEstimateResult`. | Modify |
| `lib/gemini/schemas.ts` | `SCORE_ESTIMATE_SCHEMA` (Gemini responseSchema). | Modify |
| `lib/gemini/prompts.ts` | `SCORE_ESTIMATE_PROMPT`. | Modify |
| `lib/gemini/client.ts` | `estimateAntlerScore()` function + imports. | Modify |
| `lib/gemini/index.ts` | Export the new call/types. | Modify |
| `trigger/jobs/analyze-photo.ts` | Coarse cut (drop spikes), call estimate for survivors, store estimate, queue fingerprint on confirm band. | Modify |
| `trigger/jobs/generate-fingerprint.ts` | Write authoritative `score_gross` + compute `is_trophy` vs account threshold. | Modify |
| `scripts/verify-score-estimate.mjs` | Real-Gemini smoke test of the new call. | Create |

---

## Task 1: Pure scoring-gate logic (TDD)

**Files:**
- Create: `lib/scoring/gates.ts`
- Test: `lib/scoring/gates.test.ts`
- Modify: `package.json` (add `test:unit` script)

- [ ] **Step 1: Write the failing test**

Create `lib/scoring/gates.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  passesCoarseCut,
  passesScoreEstimateBand,
  isTrophyScore,
  buckScoreFromDetections,
  TROPHY_CONFIRM_BAND_INCHES,
  DEFAULT_TROPHY_THRESHOLD_INCHES,
} from "./gates.ts";

test("coarse cut drops only spikes", () => {
  assert.equal(passesCoarseCut("spike"), false);
  assert.equal(passesCoarseCut("basket"), true);
  assert.equal(passesCoarseCut("standard"), true);
  assert.equal(passesCoarseCut("trophy"), true);
  assert.equal(passesCoarseCut("unknown"), true);
  assert.equal(passesCoarseCut(null), true);
});

test("score-estimate band includes the confirm band below threshold", () => {
  // threshold 130, band 10 -> gate at 120
  assert.equal(passesScoreEstimateBand(119, 130), false);
  assert.equal(passesScoreEstimateBand(120, 130), true);
  assert.equal(passesScoreEstimateBand(135, 130), true);
  assert.equal(passesScoreEstimateBand(null, 130), false);
});

test("score-estimate band respects a custom band width", () => {
  assert.equal(passesScoreEstimateBand(120, 130, 0), false);
  assert.equal(passesScoreEstimateBand(130, 130, 0), true);
});

test("trophy decision is on authoritative gross score vs threshold", () => {
  assert.equal(isTrophyScore(129, 130), false);
  assert.equal(isTrophyScore(130, 130), true);
  assert.equal(isTrophyScore(180, 130), true);
  assert.equal(isTrophyScore(null, 130), false);
});

test("buck score is the max across detections, ignoring nulls", () => {
  assert.equal(buckScoreFromDetections([120, 145, null, 130]), 145);
  assert.equal(buckScoreFromDetections([null, null]), null);
  assert.equal(buckScoreFromDetections([]), null);
});

test("defaults match the ADR", () => {
  assert.equal(DEFAULT_TROPHY_THRESHOLD_INCHES, 130);
  assert.equal(TROPHY_CONFIRM_BAND_INCHES, 10);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test "lib/scoring/gates.test.ts"`
Expected: FAIL — cannot find module `./gates.ts` (file does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `lib/scoring/gates.ts`:

```ts
/**
 * Pure decision logic for the trophy-gated AI cost cascade.
 * See docs/adr/0003-trophy-gated-ai-cost-cascade.md.
 *
 * No I/O, no Gemini, no DB — just the gate math, so it is unit-testable with
 * Node's built-in test runner (`node --test`).
 */

/**
 * Confirm band (gross inches) below the trophy threshold within which a buck is
 * still sent to the expensive fingerprint, so an estimate that under-calls a
 * real trophy still gets measured.
 */
export const TROPHY_CONFIRM_BAND_INCHES = 10;

/** Per-account trophy threshold (gross inches) used when none is set. */
export const DEFAULT_TROPHY_THRESHOLD_INCHES = 130;

/**
 * Coarse cut (Step 1): is this buck worth the mid-cost score estimate?
 * We drop only spikes; baskets and up advance (the estimate is only mid-cost,
 * so we stay conservative against missed trophies).
 */
export function passesCoarseCut(sizeClass: string | null | undefined): boolean {
  return sizeClass !== "spike";
}

/**
 * Confirm-band gate (Step 2 → Step 3): is the score estimate high enough to
 * spend the expensive fingerprint on? Includes the confirm band.
 */
export function passesScoreEstimateBand(
  scoreEstimate: number | null | undefined,
  threshold: number,
  band: number = TROPHY_CONFIRM_BAND_INCHES,
): boolean {
  if (scoreEstimate == null) return false;
  return scoreEstimate >= threshold - band;
}

/** Final trophy decision, made on the authoritative fingerprint gross score. */
export function isTrophyScore(
  grossScore: number | null | undefined,
  threshold: number,
): boolean {
  if (grossScore == null) return false;
  return grossScore >= threshold;
}

/**
 * A Buck's canonical score is the highest authoritative gross score across all
 * its detections (best rack view wins); a poorer later photo never lowers it.
 */
export function buckScoreFromDetections(
  detectionGrossScores: Array<number | null | undefined>,
): number | null {
  const valid = detectionGrossScores.filter(
    (s): s is number => typeof s === "number",
  );
  if (valid.length === 0) return null;
  return Math.max(...valid);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test "lib/scoring/gates.test.ts"`
Expected: PASS — `# pass 6`, `# fail 0`.

- [ ] **Step 5: Add the `test:unit` npm script**

In `package.json`, add to the `scripts` object (after `"type-check"`):

```json
    "test:unit": "node --test \"lib/**/*.test.ts\"",
```

- [ ] **Step 6: Run via the npm script to confirm wiring**

Run: `npm run test:unit`
Expected: PASS, same `# pass 6`. (A Node `ExperimentalWarning` about type-stripping may print; it is harmless.)

- [ ] **Step 7: Commit**

```bash
git add lib/scoring/gates.ts lib/scoring/gates.test.ts package.json
git commit -m "feat(scoring): pure trophy-gate logic with node:test unit tests"
```

---

## Task 2: Database migration + types

**Files:**
- Create: `supabase/migrations/042_score_based_trophy_gate.sql`
- Modify: `types/database.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/042_score_based_trophy_gate.sql`:

```sql
-- 042_score_based_trophy_gate.sql
-- Trophy is identified by Score, not by the cheap size_class glance.
-- See docs/adr/0003-trophy-gated-ai-cost-cascade.md.

-- Per-account trophy threshold (gross inches). Default 130.
ALTER TABLE profiles
  ADD COLUMN trophy_threshold INTEGER NOT NULL DEFAULT 130;

-- Detection-level scoring fields.
ALTER TABLE detections
  ADD COLUMN score_estimate INTEGER,             -- mid-cost gross-score estimate
  ADD COLUMN score_estimate_confidence INTEGER,  -- 0-100 confidence in the estimate
  ADD COLUMN score_gross INTEGER,                -- authoritative gross score (from fingerprint)
  ADD COLUMN is_trophy BOOLEAN NOT NULL DEFAULT FALSE;

-- Surface/sort trophies and band-gate candidates fast.
CREATE INDEX idx_detections_is_trophy
  ON detections (is_trophy)
  WHERE is_trophy = TRUE;

CREATE INDEX idx_detections_score_estimate
  ON detections (score_estimate)
  WHERE score_estimate IS NOT NULL;

-- The authoritative trophy signal is now is_trophy, not size_class='trophy'.
-- Update the unassigned-trophy helper used by clustering accordingly.
CREATE OR REPLACE FUNCTION get_unassigned_trophy_detections(p_user_id UUID)
RETURNS TABLE (
  detection_id UUID,
  fingerprint JSONB,
  crop_file_path TEXT,
  captured_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id AS detection_id,
    d.antler_fingerprint AS fingerprint,
    d.crop_file_path,
    i.captured_at
  FROM detections d
  INNER JOIN images i ON d.image_id = i.id
  LEFT JOIN trophy_cluster_members tcm ON tcm.detection_id = d.id
  WHERE i.user_id = p_user_id
    AND d.is_trophy = TRUE
    AND d.deer_id IS NULL
    AND d.antler_fingerprint IS NOT NULL
    AND tcm.id IS NULL
    AND d.deleted_at IS NULL
  ORDER BY i.captured_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Apply the migration to the linked database**

Run: `npx supabase db push`
Expected: reports `042_score_based_trophy_gate.sql` applied with no errors.
(If not linked: `npx supabase link --project-ref <ref>` first. The ref is in the Supabase dashboard URL.)

- [ ] **Step 3: Regenerate the database types**

Run: `npx supabase gen types typescript --linked > types/database.ts`
Expected: `git diff types/database.ts` shows the four new `detections` columns and `profiles.trophy_threshold` added to the `Row`/`Insert`/`Update` blocks.

**Fallback if `gen types` is unavailable offline** — manually edit `types/database.ts`:
- In the `detections` `Row` block (near `size_class: string | null`), add:
  ```ts
          is_trophy: boolean
          score_estimate: number | null
          score_estimate_confidence: number | null
          score_gross: number | null
  ```
- In the `detections` `Insert` and `Update` blocks, add the same four lines but optional:
  ```ts
          is_trophy?: boolean
          score_estimate?: number | null
          score_estimate_confidence?: number | null
          score_gross?: number | null
  ```
- In the `profiles` `Row` block add `trophy_threshold: number`; in its `Insert`/`Update` blocks add `trophy_threshold?: number`.

- [ ] **Step 4: Verify types compile**

Run: `npm run type-check`
Expected: exits 0, no errors. (Trigger jobs use `// @ts-nocheck`, so they will not fail even before later edits.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/042_score_based_trophy_gate.sql types/database.ts
git commit -m "feat(db): score-based trophy columns, per-account threshold, is_trophy RPC"
```

---

## Task 3: Gemini schema, prompt, and Zod type for the score estimate

**Files:**
- Modify: `lib/gemini/types.ts`
- Modify: `lib/gemini/schemas.ts`
- Modify: `lib/gemini/prompts.ts`

- [ ] **Step 1: Add the Zod schema + type**

In `lib/gemini/types.ts`, after the `comparisonSchema` block (before the `// Export types inferred from schemas` comment), add:

```ts
// Schema for mid-cost gross-score estimate (Step 2 of the trophy gate)
export const scoreEstimateSchema = z.object({
  gross_score_estimate: z
    .number()
    .min(0)
    .max(300)
    .describe("Estimated Boone & Crockett GROSS score in inches"),
  confidence: z
    .number()
    .min(0)
    .max(100)
    .describe("Confidence in the estimate, 0-100"),
});

export type ScoreEstimateResult = z.infer<typeof scoreEstimateSchema>;
```

- [ ] **Step 2: Add the Gemini responseSchema**

In `lib/gemini/schemas.ts`, after the `CLASSIFICATION_SCHEMA` block, add:

```ts
export const SCORE_ESTIMATE_SCHEMA = {
  type: "OBJECT" as const,
  properties: {
    gross_score_estimate: {
      type: "NUMBER" as const,
      description:
        "Estimated Boone & Crockett GROSS score in inches (main beams + all tine lengths + mass circumferences + inside spread, with NO deductions). A mature whitetail is typically 110-160; trophy-class is 130+. Estimate conservatively from the visible rack.",
      nullable: false,
    },
    confidence: {
      type: "NUMBER" as const,
      description:
        "Confidence in this estimate from 0-100, accounting for angle, distance, and occlusion.",
      nullable: false,
    },
  },
  required: ["gross_score_estimate", "confidence"],
};
```

- [ ] **Step 3: Add the prompt**

In `lib/gemini/prompts.ts`, after the `DEER_CLASSIFICATION_PROMPT` block, add:

```ts
/**
 * Mid-cost gross-score estimate prompt (Step 2 of the trophy gate).
 * Cheaper than the full fingerprint: a single number + confidence, no per-tine
 * breakdown. Used to decide which bucks are worth the expensive fingerprint.
 */
export const SCORE_ESTIMATE_PROMPT = `
You are scoring a cropped image of a buck (a male deer with antlers).

Estimate the Boone & Crockett GROSS score of this buck's rack, in inches.
Gross score = total of main beam lengths + all tine lengths + mass
(circumference) measurements + inside spread, with NO deductions.

Reference points:
- A small or young buck (basket rack): ~90-115 inches
- A typical mature buck: ~115-135 inches
- A trophy-class buck: 135+ inches
- An exceptional buck: 160+ inches

Use the deer's ears and body as a scale reference. Estimate conservatively when
the angle, distance, or occlusion makes measurement uncertain, and lower your
confidence accordingly.

Return ONLY:
- gross_score_estimate: your single best gross-score number in inches
- confidence: 0-100, how confident you are given image quality and angle
`.trim();
```

- [ ] **Step 4: Verify types compile**

Run: `npm run type-check`
Expected: exits 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/gemini/types.ts lib/gemini/schemas.ts lib/gemini/prompts.ts
git commit -m "feat(gemini): score-estimate schema, responseSchema, and prompt"
```

---

## Task 4: `estimateAntlerScore` Gemini client function

**Files:**
- Modify: `lib/gemini/client.ts`
- Modify: `lib/gemini/index.ts`

- [ ] **Step 1: Extend the imports**

In `lib/gemini/client.ts`:

Change line 2 (the `./types` import) to add `scoreEstimateSchema` and `ScoreEstimateResult`:

```ts
import { analysisSchema, comparisonSchema, detectionOnlySchema, deerAnalysisSchema, antlerFingerprintSchema, scoreEstimateSchema, type AnalysisResult, type ComparisonResult, type DetectionOnlyResult, type DeerAnalysisResult, type AntlerFingerprintResult, type ScoreEstimateResult } from "./types";
```

Change line 3 (the `./prompts` import) to add `SCORE_ESTIMATE_PROMPT`:

```ts
import { PHOTO_ANALYSIS_PROMPT, buildComparisonPromptWithCatalog, DEER_CLASSIFICATION_PROMPT, DETECTION_ONLY_PROMPT, DEER_ANALYSIS_PROMPT, ANTLER_FINGERPRINT_PROMPT, SCORE_ESTIMATE_PROMPT } from "./prompts";
```

Change line 4 (the `./schemas` import) to add `SCORE_ESTIMATE_SCHEMA`:

```ts
import { DETECTION_SCHEMA, CLASSIFICATION_SCHEMA, COMPARISON_SCHEMA, ANALYSIS_SCHEMA, DEER_ANALYSIS_SCHEMA, ANTLER_FINGERPRINT_SCHEMA, SCORE_ESTIMATE_SCHEMA } from "./schemas";
```

- [ ] **Step 2: Add the function**

In `lib/gemini/client.ts`, immediately after the end of `classifyDeerCrop` (the line `throw lastError || new Error("All Gemini models failed for classification");` and its closing `}`), add:

```ts
/**
 * Result from estimateAntlerScore including metrics
 */
export interface EstimateScoreResult {
  result: ScoreEstimateResult;
  metrics: GeminiMetrics;
}

/**
 * Mid-cost gross-score estimate for a cropped buck (Step 2 of the trophy gate).
 *
 * Cheaper than extractAntlerFingerprint (no Thinking, no per-tine breakdown):
 * a single gross-score number + confidence, used to decide which bucks are
 * worth the expensive fingerprint + re-ID.
 * See docs/adr/0003-trophy-gated-ai-cost-cascade.md.
 */
export async function estimateAntlerScore(
  cropBase64: string,
  mimeType: string
): Promise<EstimateScoreResult> {
  const ai = getGeminiClient();
  const startTime = Date.now();

  let lastError: Error | null = null;
  let totalRetryCount = 0;
  let wasRateLimited = false;

  for (const model of MODEL_FALLBACK_CHAIN) {
    try {
      const { result: response, retryCount, wasRateLimited: rateLimited } = await withRetry(async () => {
        return await ai.models.generateContent({
          model,
          contents: [
            {
              parts: [
                { inlineData: { data: cropBase64, mimeType } },
                { text: SCORE_ESTIMATE_PROMPT }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: SCORE_ESTIMATE_SCHEMA,
            temperature: 0.1,
          }
        });
      });

      totalRetryCount += retryCount;
      wasRateLimited = wasRateLimited || rateLimited;
      const durationMs = Date.now() - startTime;

      const text = response.text;
      if (!text) {
        throw new Error("Gemini returned empty response");
      }

      const parsed = JSON.parse(text);
      const validated = scoreEstimateSchema.parse(parsed);

      const promptTokens = response.usageMetadata?.promptTokenCount ?? 0;
      const responseTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
      const totalTokens = response.usageMetadata?.totalTokenCount ?? 0;

      console.log(`Gemini score-estimate token usage:`, {
        promptTokens,
        responseTokens,
        totalTokens,
      });

      return {
        result: validated,
        metrics: {
          promptTokens,
          responseTokens,
          totalTokens,
          modelUsed: model,
          wasRateLimited,
          retryCount: totalRetryCount,
          durationMs,
        }
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isOverloaded = lastError.message.includes("503") ||
                           lastError.message.includes("overloaded") ||
                           lastError.message.includes("UNAVAILABLE");

      if (isOverloaded && model !== MODEL_FALLBACK_CHAIN[MODEL_FALLBACK_CHAIN.length - 1]) {
        console.log(`Model ${model} overloaded for score estimate, trying next fallback...`);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error("All Gemini models failed for score estimate");
}
```

- [ ] **Step 3: Export from the index**

In `lib/gemini/index.ts`:

Change the first export line to add `estimateAntlerScore`:

```ts
export { analyzePhoto, compareDeers, validateGeminiClient, detectDeer, classifyDeerCrop, analyzeDeer, estimateAntlerScore } from "./client";
```

Change the metrics-types export line to add `EstimateScoreResult`:

```ts
export type { GeminiMetrics, DetectDeerResult, ClassifyDeerResult, DeerClassificationResult, EstimateScoreResult } from "./client";
```

Change the Zod-schemas export line to add `scoreEstimateSchema`, and the inferred-types export to add `ScoreEstimateResult`:

```ts
export { analysisSchema, comparisonSchema, deerDetectionSchema, detectionOnlySchema, deerAnalysisSchema, scoreEstimateSchema } from "./types";
```

Add to the type re-exports (the `export type { AnalysisResult, ... } from "./types";` line), append `ScoreEstimateResult`:

```ts
export type { AnalysisResult, ComparisonResult, DeerDetectionResult, DetectionOnlyResult, DeerAnalysisResult, ScoreEstimateResult } from "./types";
```

- [ ] **Step 4: Verify types compile**

Run: `npm run type-check`
Expected: exits 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/gemini/client.ts lib/gemini/index.ts
git commit -m "feat(gemini): estimateAntlerScore mid-cost scoring call"
```

---

## Task 5: Rewire `analyze-photo` — coarse cut, score estimate, confirm-band fingerprint queue

**Files:**
- Modify: `trigger/jobs/analyze-photo.ts`

This job is `// @ts-nocheck`, so new DB columns and imports will not break type-check; correctness is verified by build + the Task 7 QA pass.

- [ ] **Step 1: Add imports**

In `trigger/jobs/analyze-photo.ts`, after the existing `import { generateFingerprint } from "./generate-fingerprint";` line (line 13), add:

```ts
import { estimateAntlerScore } from "@/lib/gemini/client";
import { passesCoarseCut, passesScoreEstimateBand, DEFAULT_TROPHY_THRESHOLD_INCHES } from "@/lib/scoring/gates";
```

- [ ] **Step 2: Fetch the account's trophy threshold**

In the same file, the image record fetch currently selects `"id, file_path, user_id"` (around line 99-103). Immediately after the `logger.info("Image record fetched", ...)` block that follows it (around line 115-118), add:

```ts
      // Fetch the account's trophy threshold (gross inches) for the score gate
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("trophy_threshold")
        .eq("id", imageRecord.user_id)
        .single();
      const trophyThreshold = ownerProfile?.trophy_threshold ?? DEFAULT_TROPHY_THRESHOLD_INCHES;

      logger.info("Trophy threshold resolved", { imageId, trophyThreshold });
```

- [ ] **Step 3: Run the score estimate for coarse-cut survivors inside the buck loop**

In the buck-processing block, find (around line 326-345):

```ts
          // Step 2 & 3: Classify with Gemini AND upload crop in parallel
          const [classificationResult, cropPath] = await Promise.all([
            classifyDeerCrop(cropBase64, "image/jpeg"),
            uploadCropBuffer(supabase, cropBuffer, detectionId),
          ]);

          const { result: classification, metrics: classifyMetrics } = classificationResult;

          // Collect metrics for batch insert
          classificationMetrics.push({
            batch_id: batchId,
            image_id: imageId,
            gemini_call_type: "classification",
            model_used: classifyMetrics.modelUsed,
            prompt_tokens: classifyMetrics.promptTokens,
            response_tokens: classifyMetrics.responseTokens,
            total_tokens: classifyMetrics.totalTokens,
            is_rate_limited: classifyMetrics.wasRateLimited,
            retry_count: classifyMetrics.retryCount,
            duration_ms: classifyMetrics.durationMs,
          });
```

Immediately after that `classificationMetrics.push({...})` for classification, add:

```ts
          // Step 2b: Score estimate (Step 2 of the trophy gate) — only for bucks
          // that pass the coarse cut (drop spikes). See lib/scoring/gates.ts.
          let scoreEstimate: { gross_score_estimate: number; confidence: number } | null = null;
          if (passesCoarseCut(classification.size_class)) {
            try {
              const { result: estimate, metrics: estimateMetrics } = await estimateAntlerScore(
                cropBase64,
                "image/jpeg"
              );
              scoreEstimate = estimate;
              classificationMetrics.push({
                batch_id: batchId,
                image_id: imageId,
                gemini_call_type: "score_estimate",
                model_used: estimateMetrics.modelUsed,
                prompt_tokens: estimateMetrics.promptTokens,
                response_tokens: estimateMetrics.responseTokens,
                total_tokens: estimateMetrics.totalTokens,
                is_rate_limited: estimateMetrics.wasRateLimited,
                retry_count: estimateMetrics.retryCount,
                duration_ms: estimateMetrics.durationMs,
              });
              logger.info("Buck score estimate completed", {
                imageId,
                detectionId,
                grossScoreEstimate: estimate.gross_score_estimate,
                confidence: estimate.confidence,
              });
            } catch (estErr) {
              logger.warn("Score estimate failed; buck will not advance to fingerprint", {
                imageId,
                detectionId,
                error: estErr instanceof Error ? estErr.message : String(estErr),
              });
            }
          }
```

- [ ] **Step 4: Store the estimate on the buck detection record**

In the same buck-loop, the returned record object (around line 360-379) ends with:

```ts
            deer_id: null,
            class: "deer",
            confidence: detection.confidence / 100,
          };
```

Change it to add the two estimate fields:

```ts
            deer_id: null,
            class: "deer",
            confidence: detection.confidence / 100,
            score_estimate: scoreEstimate?.gross_score_estimate ?? null,
            score_estimate_confidence: scoreEstimate?.confidence ?? null,
          };
```

- [ ] **Step 5: Queue fingerprint on the confirm band instead of `size_class='trophy'`**

Find the Step 7b block (around line 566-604):

```ts
        // Step 7b: Queue fingerprint generation for trophy-tier bucks
        // Get the inserted detection IDs to queue fingerprint jobs
        const { data: insertedDetections } = await supabase
          .from("detections")
          .select("id, size_class")
          .eq("image_id", imageId)
          .in("size_class", ["trophy"]);

        const trophyDetections = insertedDetections?.filter(d => d.size_class === "trophy") ?? [];

        if (trophyDetections.length > 0) {
          logger.info("Queuing fingerprint generation for trophy bucks", {
            imageId,
            trophyCount: trophyDetections.length,
          });

          // Queue fingerprint generation jobs for each trophy detection
          // Using triggerAndWait would block, so we use trigger() for async queuing
          const fingerprintPromises = trophyDetections.map((detection) =>
            generateFingerprint.trigger({
              detectionId: detection.id,
              userId: imageRecord.user_id,
            })
          );

          try {
            await Promise.all(fingerprintPromises);
            logger.info("Fingerprint generation jobs queued successfully", {
              imageId,
              count: trophyDetections.length,
            });
          } catch (fpError) {
            // Don't fail the main job if fingerprint queuing fails
            logger.warn("Failed to queue some fingerprint generation jobs", {
              imageId,
              error: fpError instanceof Error ? fpError.message : String(fpError),
            });
          }
        }
```

Replace the entire block above with:

```ts
        // Step 7b: Queue fingerprint generation for bucks whose score estimate
        // is within the confirm band (>= threshold - band). The fingerprint
        // produces the authoritative score and the final trophy decision.
        // See docs/adr/0003-trophy-gated-ai-cost-cascade.md.
        const { data: insertedDetections } = await supabase
          .from("detections")
          .select("id, score_estimate")
          .eq("image_id", imageId)
          .eq("class", "deer")
          .not("score_estimate", "is", null);

        const bandDetections = (insertedDetections ?? []).filter((d) =>
          passesScoreEstimateBand(d.score_estimate, trophyThreshold)
        );

        if (bandDetections.length > 0) {
          logger.info("Queuing fingerprint generation for in-band bucks", {
            imageId,
            inBandCount: bandDetections.length,
            trophyThreshold,
          });

          // Using triggerAndWait would block, so we use trigger() for async queuing
          const fingerprintPromises = bandDetections.map((detection) =>
            generateFingerprint.trigger({
              detectionId: detection.id,
              userId: imageRecord.user_id,
            })
          );

          try {
            await Promise.all(fingerprintPromises);
            logger.info("Fingerprint generation jobs queued successfully", {
              imageId,
              count: bandDetections.length,
            });
          } catch (fpError) {
            // Don't fail the main job if fingerprint queuing fails
            logger.warn("Failed to queue some fingerprint generation jobs", {
              imageId,
              error: fpError instanceof Error ? fpError.message : String(fpError),
            });
          }
        }
```

- [ ] **Step 6: Verify build**

Run: `npm run type-check && npm run build`
Expected: both exit 0. (`type-check` ignores this file via `@ts-nocheck`; `build` must compile the imports — confirms `@/lib/scoring/gates` and `estimateAntlerScore` resolve.)

- [ ] **Step 7: Commit**

```bash
git add trigger/jobs/analyze-photo.ts
git commit -m "feat(pipeline): coarse cut + score estimate + confirm-band fingerprint queue"
```

---

## Task 6: Rewire `generate-fingerprint` — authoritative score + trophy decision

**Files:**
- Modify: `trigger/jobs/generate-fingerprint.ts`

This job is `// @ts-nocheck`. It is where the automatic promote/demote happens: the fingerprint's `gross_score` is authoritative.

- [ ] **Step 1: Add the import**

In `trigger/jobs/generate-fingerprint.ts`, after the existing `import { extractAntlerFingerprint } from "@/lib/gemini/client";` line (line 4), add:

```ts
import { isTrophyScore, DEFAULT_TROPHY_THRESHOLD_INCHES } from "@/lib/scoring/gates";
```

- [ ] **Step 2: Compute the authoritative trophy decision and persist it**

Find the save block (around line 171-193):

```ts
      // Step 5: Save fingerprint to detections.antler_fingerprint (JSONB column)
      logger.info("Saving antler fingerprint to database", { detectionId });

      const { error: updateError } = await supabase
        .from("detections")
        .update({
          antler_fingerprint: fingerprint as any, // JSONB column
        })
        .eq("id", detectionId);
```

Replace it with:

```ts
      // Step 5: Authoritative trophy decision on the fingerprint's gross score.
      // This is the automatic promote/demote: the estimate only gated entry to
      // the fingerprint; the fingerprint's gross score is the final word.
      // See docs/adr/0003-trophy-gated-ai-cost-cascade.md.
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("trophy_threshold")
        .eq("id", userId)
        .single();
      const trophyThreshold = ownerProfile?.trophy_threshold ?? DEFAULT_TROPHY_THRESHOLD_INCHES;
      const grossScore = fingerprint.scores.gross_score;
      const trophy = isTrophyScore(grossScore, trophyThreshold);

      logger.info("Authoritative trophy decision", {
        detectionId,
        grossScore,
        trophyThreshold,
        isTrophy: trophy,
      });

      // Step 5b: Save fingerprint + authoritative score + trophy flag
      logger.info("Saving antler fingerprint to database", { detectionId });

      const { error: updateError } = await supabase
        .from("detections")
        .update({
          antler_fingerprint: fingerprint as any, // JSONB column
          score_gross: grossScore,
          is_trophy: trophy,
        })
        .eq("id", detectionId);
```

- [ ] **Step 3: Verify build**

Run: `npm run type-check && npm run build`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add trigger/jobs/generate-fingerprint.ts
git commit -m "feat(pipeline): authoritative gross score + is_trophy decision in fingerprint"
```

---

## Task 7: Integration verification (real Gemini) + manual QA

**Files:**
- Create: `scripts/verify-score-estimate.mjs`

- [ ] **Step 1: Write the verification script**

Create `scripts/verify-score-estimate.mjs`:

```js
import './env.mjs'; // loads .env.local (provides GEMINI_API_KEY)
import { readFileSync } from 'node:fs';
import { estimateAntlerScore } from '../lib/gemini/client.ts';

const path = process.argv[2];
if (!path) {
  console.error('Usage: node scripts/verify-score-estimate.mjs <path-to-buck-crop.jpg>');
  process.exit(1);
}

const base64 = readFileSync(path).toString('base64');
const { result, metrics } = await estimateAntlerScore(base64, 'image/jpeg');

console.log('Score estimate:', result);
console.log('Model:', metrics.modelUsed, '| tokens:', metrics.totalTokens, '| ms:', metrics.durationMs);

if (typeof result.gross_score_estimate !== 'number' || typeof result.confidence !== 'number') {
  console.error('FAIL: estimate did not return numeric fields');
  process.exit(1);
}
console.log('OK');
```

- [ ] **Step 2: Run it against a real buck crop**

Obtain a buck crop JPEG (download any `crop_file_path` from the `photos` bucket via the Supabase dashboard, or use a clear buck photo from a trail cam). Then run:

Run: `node scripts/verify-score-estimate.mjs ./sample-buck.jpg`
Expected: prints `Score estimate: { gross_score_estimate: <number>, confidence: <number> }` then `OK`. The number should be a plausible gross score (roughly 80-200 for a real buck).

- [ ] **Step 3: Manual pipeline QA (the real gate end-to-end)**

In one terminal: `npx trigger.dev@latest dev`
Then upload a small set of photos that includes at least one obvious trophy buck and one small/spike buck (via the app's upload flow), and let the batch process. Verify in the database (Supabase SQL editor):

```sql
-- Spikes should have NULL score_estimate (dropped by the coarse cut)
-- Decent bucks should have a numeric score_estimate
-- The trophy should have score_gross set and is_trophy = TRUE
select d.id, d.size_class, d.score_estimate, d.score_gross, d.is_trophy
from detections d
join images i on i.id = d.image_id
where d.class = 'deer'
order by d.created_at desc
limit 20;
```

Expected:
- Rows with `size_class = 'spike'` → `score_estimate IS NULL`, no fingerprint, `is_trophy = false`.
- Non-spike bucks → numeric `score_estimate`.
- Bucks with `score_estimate >= threshold - 10` → `score_gross` populated and `is_trophy` set by the authoritative score.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-score-estimate.mjs
git commit -m "test(scoring): real-Gemini score-estimate verification script"
```

---

## Self-Review

**1. Spec coverage (against ADR 0003):**
- Two-step scoring (size glance → mid-cost estimate) → Tasks 3-5. ✅
- Coarse cut drops only spikes → `passesCoarseCut` (Task 1) used in Task 5 Step 3. ✅
- Per-account threshold, default 130 → `profiles.trophy_threshold` (Task 2), read in Tasks 5-6. ✅
- Authoritative fingerprint score + confirm band (promote/demote) → `passesScoreEstimateBand` gates fingerprint entry (Task 5 Step 5); `isTrophyScore` on `gross_score` decides `is_trophy` (Task 6). ✅
- Buck score = max across detections → `buckScoreFromDetections` (Task 1), **consumed in Plan 3** (see Roadmap). ✅ (logic landed; surfacing deferred)
- `is_trophy` replaces `size_class='trophy'` for clustering → RPC updated (Task 2). ✅
- **Out of scope for this plan (see Roadmap):** auto re-ID on trophy confirmation; photo tier + security surface; gallery default sort; settings UI for the threshold.

**2. Placeholder scan:** No TBD/TODO/"handle errors"/"similar to". Every code step shows complete code. ✅

**3. Type consistency:** `score_estimate`, `score_estimate_confidence`, `score_gross`, `is_trophy`, `trophy_threshold` named identically across the migration (Task 2), types (Task 2), the insert record (Task 5 Step 4), the band query (Task 5 Step 5), and the fingerprint update (Task 6). Function names `passesCoarseCut` / `passesScoreEstimateBand` / `isTrophyScore` / `buckScoreFromDetections` and constants `TROPHY_CONFIRM_BAND_INCHES` / `DEFAULT_TROPHY_THRESHOLD_INCHES` are consistent between definition (Task 1), tests (Task 1), and consumers (Tasks 5-6). Gemini symbols `estimateAntlerScore` / `scoreEstimateSchema` / `SCORE_ESTIMATE_SCHEMA` / `SCORE_ESTIMATE_PROMPT` / `ScoreEstimateResult` / `EstimateScoreResult` consistent across Tasks 3-4 and the index export. ✅

---

## Roadmap — follow-up plans (separate documents)

This plan delivers working software on its own: trophy status is now decided by Score. Two further plans complete ADR 0003:

- **Plan 2 — Automatic re-ID on trophy confirmation.** After `is_trophy = true`, auto-trigger trophy-vs-trophy matching (fingerprint-similarity pre-filter → Gemini visual confirm on top candidates), emitting Match candidates (never auto-merge); unmatched trophies flow to the unassigned pool + clustering + operator promotion. Touches `generate-fingerprint.ts` (trigger on confirm), `trigger/jobs/compare-deer.ts`, `trigger/jobs/cluster-trophy-detections.ts`, `lib/services/trophy.ts`.
- **Plan 3 — Surfacing.** Add a materialized `images.photo_tier` (trophy > non-trophy buck > doe > non-deer > empty) computed at pipeline end, a separate security surface from `has_people`/`has_vehicles`, a `deer` canonical score updated via `buckScoreFromDetections`, and gallery default sort (trophies-first). Touches `analyze-photo.ts` (stamp tier), a migration, and the photos/gallery UI + `lib/services`.
```

---

## Execution Strategy

**MANDATORY: Use multi-agent parallel execution**

1. Analyze dependencies - identify independent vs dependent tasks
2. Group into parallel batches - cluster independent tasks
3. Execute with up to 5 agents in parallel via Task tool
4. Serialize only when dependencies require it

See CLAUDE.md "Execution Preferences" for parallelization rules.
