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

/**
 * Stage 3: Trophy Fingerprint Extraction (B&C-style measurements)
 * Used for extracting detailed antler measurements from trophy buck images
 */
export const ANTLER_FINGERPRINT_PROMPT = `Extract comprehensive Boone & Crockett (B&C) style antler measurements from this trophy buck image.

### 1. CALIBRATION INSTRUCTIONS

Use anatomical reference points to calibrate measurements:
- **Ear length**: 6.75 inches (standard range: 6.5-7")
- **Ear tip-to-tip spread**: 15 inches (standard range: 14-16")
- **Eye circumference**: 4 inches
- **Eye-to-nose distance**: 8 inches

**Calibration Steps**:
1. Identify which reference point(s) are visible and measurable in this image
2. Select the BEST reference based on viewing angle and clarity
3. Report which reference you used in your response
4. Assess viewing angle impact on measurement reliability

**Viewing Angles**:
- "left_profile": Left side view (G2/G3 visible on left side)
- "right_profile": Right side view (G2/G3 visible on right side)
- "frontal": Head-on view (spread visible, tines foreshortened)
- "quartering": Angled view (partial spread, some tines foreshortened)
- "rear": Back view (rarely useful for measurements)

### 2. RAW MEASUREMENTS (in inches)

Extract these measurements using your selected calibration reference:

**Spread & Beams**:
- inside_spread: Width between main beams at widest inside point
- main_beam_left: Length from burr (base) to tip, following the curve
- main_beam_right: Length from burr to tip, following the curve

**Tine Lengths** (measured from top of main beam):
For LEFT antler:
- g1_left: Brow tine (first point above burr)
- g2_left: Second point (typically longest)
- g3_left: Third point
- g4_left: Fourth point
- g5_left: Fifth point (if present)
- g6_left: Sixth point (if present)
- g7_left: Seventh point (if present)

For RIGHT antler (same pattern):
- g1_right through g7_right

**Mass Measurements** (circumference around main beam):
For each side, measure at these points:
- h1_left/h1_right: Between burr and G1
- h2_left/h2_right: Between G1 and G2
- h3_left/h3_right: Between G2 and G3
- h4_left/h4_right: Between G3 and G4

**Point Counts**:
- total_points: Total countable points (1 inch or longer)
- points_left: Points on left antler
- points_right: Points on right antler

### 3. CALCULATED SCORES

Compute standard B&C scoring:

**Gross Score**:
Sum of: inside_spread + both main beams + all tines + all mass measurements

**Deductions**:
For typical scoring, calculate asymmetry deductions:
- Spread difference (if any)
- Beam length difference (|left - right|)
- G1 difference (|g1_left - g1_right|)
- G2 difference, G3 difference, etc. for all matching tines
- Mass differences (H1 through H4)
Sum all differences for total deductions

**Net Score**:
gross_score - deductions

**Score Class**:
Categorize the gross score:
- "120s": 120-139 (young/developing buck)
- "140s": 140-159 (quality mature buck)
- "160s": 160-179 (trophy class, B&C Awards minimum)
- "180s": 180-199 (exceptional trophy)
- "200s": 200-219 (world class)
- "world_class": 220+ (legendary)

**Typical Status**:
- "typical": Symmetric rack, no major abnormal points
- "non_typical": Drop tines, kickers, stickers, or major asymmetry

### 4. DERIVED RATIOS (angle-invariant)

Calculate these ratios for re-identification (more stable across viewing angles):

- **g2_to_g3_ratio**: G2 length / G3 length (typical ~1.2-1.5)
- **beam_symmetry**: min(beam_left, beam_right) / max(beam_left, beam_right)
- **spread_to_beam_ratio**: inside_spread / average_beam_length
- **brow_to_ear_ratio**: average G1 length / ear_length (6.75")
- **tallest_tine_to_ear_ratio**: tallest tine / ear_length

### 5. DISTINCTIVE FEATURES

Identify unique characteristics for re-identification:

**Drop Tines**:
- has_drop_tine: true/false
- drop_tine_location: "G2_left", "G3_right", etc.
- drop_tine_length: Length in inches

**Split G2** (forked second tine):
- has_split_g2: true/false
- split_g2_side: "left", "right", "both", or null

**Kickers** (small abnormal points):
- has_kickers: true/false
- kicker_count: Number of kickers
- kicker_locations: Array like ["G3_left", "beam_right"]

**Beam Characteristics**:
- beam_curve: "tight", "wide_sweep", "straight", "normal"
- beam_angle: "upright", "sweeping", "palmated", "normal"

**Other Notable Features**:
- notable_asymmetry: Description of major left/right differences
- broken_tines: Array of broken tine locations like ["G3_left"]
- other_features: Any other distinctive traits

### 6. CONFIDENCE SCORES (0-100)

Rate your confidence for each measurement category:

- **overall_confidence**: Overall confidence in the entire fingerprint
- **spread_confidence**: Confidence in spread measurement
- **beam_confidence**: Confidence in main beam measurements
- **tine_confidence**: Confidence in tine length measurements
- **mass_confidence**: Confidence in mass measurements
- **point_count_confidence**: Confidence in point count
- **features_confidence**: Confidence in distinctive features
- **photo_quality**: Image quality score (blur, lighting, resolution)
- **visibility_score**: How much of the rack is visible/unobstructed

**Confidence Guidelines**:
- 90-100: Excellent visibility, clear measurements possible
- 70-89: Good visibility, minor occlusion or angle issues
- 50-69: Partial visibility, significant angle impact
- 30-49: Poor visibility, rough estimates only
- 0-29: Very limited visibility, unreliable measurements

### 7. REASONING TRACE

Provide a detailed explanation of your measurement methodology:

1. **Calibration Choice**: Which anatomical reference did you use and why?
2. **Viewing Angle Assessment**: How does the angle affect measurement reliability?
3. **Measurement Methodology**: How did you measure the most challenging dimensions?
4. **Distinctive Features**: What makes this buck's rack unique?
5. **Confidence Rationale**: Why did you assign the confidence scores you did?
6. **Limitations**: What measurements are unreliable due to photo constraints?

### OUTPUT FORMAT

Return structured JSON matching this fingerprint schema. Use null for measurements that cannot be reliably determined.

**Example reasoning trace**: "Used ear length (6.75") as primary calibration reference because both ears are clearly visible in this left profile view. The viewing angle allows reliable measurement of left-side tines (G2/G3 visible) but right-side tines are partially foreshortened, reducing confidence. This buck shows a distinctive drop tine off the left G2, approximately 4 inches long, which is a strong re-identification marker. Spread measurement is moderately confident (75%) due to slight quartering angle. Mass measurements are estimates only (50% confidence) as beam circumference is difficult to assess from this angle."`.trim();
