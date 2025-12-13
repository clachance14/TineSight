export const PHOTO_ANALYSIS_PROMPT = `
Detect the 2D bounding boxes of all deer in this trail camera image.

IMPORTANT GUIDELINES:
- Create ONE bounding box per individual deer - never group multiple deer in a single box
- Draw TIGHT bounding boxes that closely fit each deer's body (not loose boxes with excess space)
- Only detect actual deer - DO NOT detect feeders, metal structures, fencing, shadows, or equipment
- If a deer is partially visible (cut off by image edge), still detect it with available area
- Be conservative with confidence - use lower scores for unclear or partially obscured deer

Output a JSON object with:
- "deer_present": true/false
- "detections": array of deer detections (one per individual deer)
- "image_quality_score": 0-100
- "analysis_notes": brief notes

For each deer detected, include in the detections array:
- "box_2d": [ymin, xmin, ymax, xmax] normalized to 0-1000 scale
- "species": "whitetail", "mule_deer", "elk", or "unknown"
- "sex": "buck", "doe", "fawn", or "unknown"
- "antler_points": total point count for bucks (null for does/fawns). Count ALL points:
  * Main beam tips count as points (2 total, one per side)
  * Brow tines (G1) - tines closest to skull base
  * G2, G3, G4, G5+ tines along each main beam
  * Sticker points, drop tines, kicker points, abnormal points
  * A "point" = any projection at least 1 inch long
  * Use TOTAL count (eastern style): 8-point, 10-point, 12-point, etc.
  * Don't undercount - if you can see tines, count them
- "antler_description": string describing the rack (for bucks only, null otherwise). Include:
  * Configuration: "typical" or "non-typical"
  * Notable features: drop tines, split G2, wide spread, tall tines, mass, etc.
  * Example: "Typical 10-point, wide spread, tall G2s"
  * Example: "Non-typical 12-point with drop tine on left side"
- "confidence": 0-100 (use 90+ only for clearly visible deer, 70-89 for partially visible)

Example with deer:
{"deer_present": true, "detections": [{"box_2d": [156, 234, 489, 567], "species": "whitetail", "sex": "buck", "antler_points": 10, "antler_description": "Typical 10-point, good spread, tall G2s", "confidence": 92}, {"box_2d": [320, 600, 580, 820], "species": "whitetail", "sex": "doe", "antler_points": null, "antler_description": null, "confidence": 78}], "image_quality_score": 75, "analysis_notes": "Two deer near feeder"}

Example without deer:
{"deer_present": false, "detections": [], "image_quality_score": 80, "analysis_notes": "No deer visible - only feeders and vegetation"}
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
