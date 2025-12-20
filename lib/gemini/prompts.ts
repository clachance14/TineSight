// Stage 1: Detection-only prompt (fast, focused on localization)
export const DETECTION_ONLY_PROMPT = `
Detect all deer in this image.

### 1. BOUNDING BOX CRITERIA (The "Antler Rule")
- **Goal:** Draw ONE box per deer.
- **Vertical Extent:** The top of the box must reach the **HIGHEST ANTLER TIP**. Do NOT stop at the ears or skull.
- **Horizontal Extent:** The box must be wide enough to include the **FULL SPREAD** of the antlers.
- **The "Whole Animal" Rule:** Imagine the deer is a statue. Box the entire silhouette, including legs, tail, and the full rack.
- **Occlusion:** If a deer is behind a feeder leg/post, draw ONE box that connects the head and body. Do not stop at the pole.

### 2. EDGE CASES
- **Motion Blur (Night):** Detect blurry, "ghost-like" silhouettes as valid deer. Box the entire motion smear.
- **Flash Blowout:** Detect large, glowing white shapes in the foreground as close-up deer.
- **Crowds:** If multiple deer overlap, split them into **separate** overlapping boxes.

### 3. EXCLUSIONS
- Ignore feeder legs/barrels (unless inside the deer box).
- Ignore shadows and bird feeders.
- **Tree Branches:** Do NOT include background branches in the box unless they are antlers attached to a buck's head.

### 4. ATTRIBUTES
- **has_antlers**: Return true if *any* antlers (spikes, main beams) are visible. Return false for does or fawns.

### 5. OUTPUT
Return strict JSON with "box_2d" in [ymin, xmin, ymax, xmax] format (0-1000).
`.trim();

// Stage 1+2: Combined detection and classification (legacy, comprehensive)
export const PHOTO_ANALYSIS_PROMPT = `
Detect the 2D bounding boxes of all deer in this trail camera image.

### DETECTION GUIDELINES:
- Create ONE bounding box per individual deer - never group multiple deer in a single box
- Draw TIGHT bounding boxes that closely fit each deer's body (not loose boxes with excess space)
- Only detect actual deer - DO NOT detect feeders, metal structures, fencing, shadows, or equipment
- If a deer is partially visible (cut off by image edge), still detect it with available area
- Bounding boxes should be [ymin, xmin, ymax, xmax] normalized to 0-1000 scale

### CLASSIFICATION CRITERIA:
**Species**: Classify as "whitetail", "mule_deer", "elk", or "unknown"

**Sex**: Classify as "buck", "doe", "fawn", or "unknown"
- Bucks have antlers (even small spikes count)
- Does are adult females without antlers
- Fawns are young deer (small body, spots if visible)

**Antler Classification (CRITICAL)**:
Instead of counting exact points, classify the buck into these tiers based on visual size:

- "spike": Single unbranched beams
- "basket": Rack is narrow (width INSIDE the ears). Thin mass. Likely a yearling
- "standard": Rack is wider than the ears. Good structure. Typical mature buck
- "trophy": Exceptional mass, very wide spread, or tall tines. Dominant buck

Use your reasoning to compare antler width against ear width.

**Estimated Point Range**: Conservative bracket for bucks only (null for does/fawns)
- "spike": Unbranched beams
- "fork": 2-4 points
- "6-8 points": Typical yearling/young buck
- "8-10 points": Mature buck
- "10+ points": Large mature buck

**Antler Description**: For bucks only (null otherwise). Include:
- Configuration: "typical" or "non-typical"
- Notable features: drop tines, split G2, wide spread, tall tines, mass, etc.

### CONFIDENCE GUIDANCE:
- Use 90+ only for clearly visible deer with good lighting
- Use 70-89 for partially visible or obscured deer
- Be conservative - lower scores for unclear detections
`.trim();

export const DEER_COMPARISON_PROMPT = `
You are comparing a deer detection against a catalog of known deer to find potential matches.

The FIRST image is the detection to match. The FOLLOWING images are reference photos from the deer catalog, labeled with their names.

Compare the detection to each catalog deer and determine:

1. best_match: The most likely match from the catalog. Include:
   - deer_id and deer_name of the matched deer
   - confidence score 0-100
   - detailed reasoning explaining the match (antler shape, point count, body features, distinguishing marks)

2. other_possibilities: Other potential matches with lower confidence

3. is_likely_new_deer: Set to true if the detection doesn't closely match any catalog deer and likely represents a new individual

Focus on these identifying features for whitetail bucks:
- Antler configuration (main beam shape, tine length and angle, spread)
- Point count and arrangement
- Any abnormalities (drop tines, stickers, broken points)
- Body characteristics if visible (size, coloring)
- Unique markings or scars

Be conservative with matches - only suggest a match if you're reasonably confident. It's better to flag as "new deer" than incorrectly match.
`.trim();

export function buildComparisonPromptWithCatalog(catalogDeer: Array<{ id: string; name: string }>) {
  const catalogList = catalogDeer.map((d, i) => `Image ${i + 2}: "${d.name}" (id: ${d.id})`).join('\n');
  return `${DEER_COMPARISON_PROMPT}\n\nCatalog deer in order:\n${catalogList}`;
}

export const DEER_CLASSIFICATION_PROMPT = `
Analyze this cropped deer image and classify it.

### CLASSIFICATION RULES:

**Sex**: Classify as "buck", "doe", "fawn", or "unknown"
- Bucks have antlers (even small spikes count)
- Does are adult females without antlers
- Fawns are young deer (small body, spots if visible)

**Antler Classification (CRITICAL)**:
Instead of counting exact points, classify the buck into these tiers based on visual size:

- "spike": Single unbranched beams
- "basket": Rack is narrow (width INSIDE the ears). Thin mass. Likely a yearling
- "standard": Rack is wider than the ears. Good structure. Typical mature buck
- "trophy": Exceptional mass, very wide spread, or tall tines. Dominant buck

Use your reasoning to compare antler width against ear width.

**Estimated Point Range**: Conservative bracket for bucks only (null for does/fawns)
- "spike": Unbranched beams
- "fork": 2-4 points
- "6-8 points": Typical yearling/young buck
- "8-10 points": Mature buck
- "10+ points": Large mature buck

**Antler Description**: Brief rack description for bucks (null otherwise)
- Notable features: drop tines, split G2, wide spread, tall tines, mass, etc.

**Age Class**: Classify as "young", "mature", "old", or "unknown"

**Confidence**: 0-100 score for how confident you are in the sex classification
`.trim();

/**
 * Stage 2: Deer Analysis Prompt (with Thinking feature)
 * Used by analyzeDeer() for detailed crop analysis with reasoning
 */
export const DEER_ANALYSIS_PROMPT = `Analyze this cropped deer image.

TASK:
1. Verification: Confirm this is a deer.
2. Sex & Age: Check for neck swelling (rut), body mass, and nose length.
3. Antler Analysis (CRITICAL):
   - Use your "Thinking" process to compare antler width against ear width.
   - Classify into size tiers: "spike", "basket", "standard", or "trophy"
   - "spike": Single unbranched beams
   - "basket": Rack is narrow (width INSIDE the ears). Thin mass. Likely a yearling
   - "standard": Rack is wider than the ears. Good structure. Typical mature buck
   - "trophy": Exceptional mass, very wide spread, or tall tines. Dominant buck
   - Distinguish between antlers and background tree branches.
   - If the head is blurry or obscured, be conservative.

OUTPUT: Return valid JSON. Use the 'reasoning_trace' field to explain your classification.`.trim();
