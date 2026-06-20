/**
 * Real-Gemini smoke test for the mid-cost score-estimate call (Task 7).
 *
 * Self-contained: node's ESM loader can't resolve lib/gemini/client.ts's
 * extensionless imports (./types etc.), so this mirrors estimateAntlerScore's
 * request shape (SCORE_ESTIMATE_PROMPT + SCORE_ESTIMATE_SCHEMA) directly against
 * @google/genai. Kept in sync with lib/gemini/{prompts,schemas}.ts by hand.
 *
 * Usage: node scripts/verify-score-estimate.mjs <path-to-buck-crop.jpg>
 */
import './env.mjs';
import { readFileSync } from 'node:fs';
import { GoogleGenAI } from '@google/genai';

const path = process.argv[2];
if (!path) {
  console.error('Usage: node scripts/verify-score-estimate.mjs <path-to-buck-crop.jpg>');
  process.exit(1);
}

const SCORE_ESTIMATE_PROMPT = `
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

const SCORE_ESTIMATE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    gross_score_estimate: { type: 'NUMBER', nullable: false },
    confidence: { type: 'NUMBER', nullable: false },
  },
  required: ['gross_score_estimate', 'confidence'],
};

const base64 = readFileSync(path).toString('base64');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

const t0 = Date.now();
const response = await ai.models.generateContent({
  model,
  contents: [{ parts: [{ inlineData: { data: base64, mimeType: 'image/jpeg' } }, { text: SCORE_ESTIMATE_PROMPT }] }],
  config: { responseMimeType: 'application/json', responseSchema: SCORE_ESTIMATE_SCHEMA, temperature: 0.1 },
});

const result = JSON.parse(response.text);
console.log('Score estimate:', result);
console.log('Model:', model, '| tokens:', response.usageMetadata?.totalTokenCount, '| ms:', Date.now() - t0);

if (typeof result.gross_score_estimate !== 'number' || typeof result.confidence !== 'number') {
  console.error('FAIL: estimate did not return numeric fields');
  process.exit(1);
}
console.log('OK');
