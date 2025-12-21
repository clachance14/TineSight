// Stage 1: Detection-only prompt (fast, focused on localization)
export const DETECTION_ONLY_PROMPT = `
Detect all animals, vehicles, and people in this trail camera image.

### 1. CLASSIFICATION RULES
Classify each detection into ONE of these classes:
- **deer**: Whitetail deer, mule deer, elk (cervid family)
- **hog**: Wild boar, feral pig (thick body, snout, tusks possible)
- **cow**: Domestic cattle (large bovine, horns possible)
- **goat**: Domestic or wild goat (bearded, upright curved horns)
- **vehicle**: Truck, ATV, car, tractor, equipment
- **person**: Human figure (clothing, upright posture)

### 2. ANTLER VERIFICATION (CRITICAL - "No False Antler" Rule)
ONLY set has_antlers=true when ALL conditions are met:
1. Detection is classified as "deer"
2. Antlers are ATTACHED TO THE DEER'S HEAD (not background branches)
3. Antlers show BONE STRUCTURE (not tree limbs, shadows, or artifacts)
4. If in doubt, return has_antlers=false

**Negative constraints:**
- Tree branches behind deer: has_antlers=false (unless clear bone attached to skull)
- Light streaks/motion blur: has_antlers=false
- Equipment silhouettes: has_antlers=false
- Ear confusion: Ears are NOT antlers
- For non-deer classes: ALWAYS has_antlers=false

### 3. BOUNDING BOX RULES
- ONE box per detection (animal, vehicle, or person)
- Include full body from head to legs/wheels
- For deer with antlers: top of box must reach HIGHEST ANTLER TIP
- Overlapping detections get SEPARATE boxes

### 4. EDGE CASES
- Motion blur: Still detect as valid (box the entire smear)
- Night flash: Detect glowing shapes as close-up animals
- Partial visibility: Detect with available area

### 5. OUTPUT
Return JSON with "box_2d" in [ymin, xmin, ymax, xmax] format (0-1000).
Set presence flags (deer_present, hogs_present, cows_present, goats_present, vehicles_present, people_present) based on what was detected.
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
1. **Species Validation**: Confirm this is actually a deer.
   - If it's a hog, cow, goat, or non-deer: set is_deer=false and exit.
   - Deer have: slender legs, no tusks, no beard, cervid body shape.

2. **Sex & Age**: Check for neck swelling (rut), body mass, and nose length.

3. **Antler Analysis (CRITICAL - "Branch Test")**:
   - First verify: Are these ACTUAL ANTLERS or background tree branches?
   - Antlers: Attached at skull, bone texture, smooth curves, velvet possible
   - Branches: Rough bark texture, detached from head, extend beyond silhouette
   - If branches are confused for antlers: set has_antlers=false, sex="doe"

   If confirmed antlers, use your "Thinking" process to compare antler width against ear width:
   - "spike": Single unbranched beams
   - "basket": Rack is narrow (width INSIDE the ears). Thin mass. Likely a yearling
   - "standard": Rack is wider than the ears. Good structure. Typical mature buck
   - "trophy": Exceptional mass, very wide spread, or tall tines. Dominant buck

OUTPUT: Return valid JSON. Use the 'reasoning_trace' field to explain your classification.`.trim();
