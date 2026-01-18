/**
 * Fingerprint Comparison Algorithm
 * Feature: 011-trophy-fingerprint
 *
 * Implements weighted multi-factor similarity comparison for antler fingerprints.
 * Based on research.md weights:
 * - Ratios: 30% (angle-invariant, most stable)
 * - Features: 20% (distinctive markers)
 * - Measurements: 15% (only when high confidence)
 * - Note: Visual/embedding comparison (35%) happens in compare-deer.ts
 */

import type { AntlerFingerprint } from '@/types/fingerprint'

/**
 * Result of fingerprint comparison
 */
export interface FingerprintComparisonResult {
  overall_similarity: number // 0-100
  component_scores: {
    ratios: number
    features: number
    measurements: number
  }
  flags: {
    possible_broken_tine: boolean
    point_count_mismatch: boolean
    confidence_low: boolean
  }
  reasoning: string
}

/**
 * Compare two antler fingerprints and return similarity score
 *
 * @param fp1 - First fingerprint
 * @param fp2 - Second fingerprint
 * @returns Comparison result with overall similarity and component scores
 */
export function compareFingerprints(
  fp1: AntlerFingerprint,
  fp2: AntlerFingerprint
): FingerprintComparisonResult {
  const ratioScore = compareRatios(fp1.ratios, fp2.ratios)
  const featureScore = compareFeatures(fp1.features, fp2.features)
  const measurementScore = compareMeasurements(
    fp1.measurements,
    fp2.measurements,
    fp1.confidence,
    fp2.confidence
  )

  // Apply weights from research.md
  // Note: 35% for embeddings is handled separately in compare-deer.ts
  // Here we normalize to 65% total (30% + 20% + 15%)
  const ratioWeight = 30 / 65
  const featureWeight = 20 / 65
  const measurementWeight = 15 / 65

  const overallSimilarity =
    ratioScore * ratioWeight +
    featureScore * featureWeight +
    measurementScore * measurementWeight

  // Detect flags
  const flags = {
    possible_broken_tine: detectBrokenTine(fp1, fp2, ratioScore),
    point_count_mismatch: fp1.measurements.total_points !== fp2.measurements.total_points,
    confidence_low: fp1.confidence.overall < 70 || fp2.confidence.overall < 70,
  }

  const reasoning = generateReasoning(ratioScore, featureScore, measurementScore, flags)

  return {
    overall_similarity: Math.round(overallSimilarity * 100) / 100,
    component_scores: {
      ratios: Math.round(ratioScore * 100) / 100,
      features: Math.round(featureScore * 100) / 100,
      measurements: Math.round(measurementScore * 100) / 100,
    },
    flags,
    reasoning,
  }
}

/**
 * Compare angle-invariant ratios with 10% tolerance
 */
function compareRatios(
  r1: AntlerFingerprint['ratios'],
  r2: AntlerFingerprint['ratios']
): number {
  const ratioKeys: (keyof AntlerFingerprint['ratios'])[] = [
    'g2_to_g3',
    'g1_to_g2',
    'beam_symmetry',
    'tine_symmetry',
    'spread_to_beam',
    'mass_to_beam',
    'brow_to_ear',
    'tallest_tine_to_ear',
  ]

  let totalScore = 0
  let validComparisons = 0

  for (const key of ratioKeys) {
    const val1 = r1[key]
    const val2 = r2[key]

    if (val1 === null || val2 === null) {
      continue
    }

    validComparisons++

    // Calculate percentage difference
    const avgValue = (val1 + val2) / 2
    const difference = Math.abs(val1 - val2)
    const percentDiff = avgValue > 0 ? (difference / avgValue) * 100 : 0

    // 10% tolerance from research.md
    if (percentDiff <= 10) {
      totalScore += 100
    } else if (percentDiff <= 20) {
      // Linear decay from 100 to 0 between 10% and 20% difference
      totalScore += 100 - ((percentDiff - 10) * 10)
    }
    // else: 0 score
  }

  return validComparisons > 0 ? totalScore / validComparisons : 0
}

/**
 * Compare distinctive features (binary/categorical matching)
 */
function compareFeatures(
  f1: AntlerFingerprint['features'],
  f2: AntlerFingerprint['features']
): number {
  let totalScore = 0
  let totalWeight = 0

  // Drop tine (high weight - very distinctive)
  totalWeight += 20
  if (f1.has_drop_tine === f2.has_drop_tine) {
    totalScore += 20
    if (f1.has_drop_tine && f2.has_drop_tine) {
      // Bonus points for matching location
      if (f1.drop_tine_location === f2.drop_tine_location) {
        totalScore += 10
        totalWeight += 10
      } else {
        totalWeight += 10
      }
    }
  }

  // Split G2 (high weight - distinctive)
  totalWeight += 15
  if (f1.has_split_g2 === f2.has_split_g2) {
    totalScore += 15
    if (f1.has_split_g2 && f2.has_split_g2) {
      if (f1.split_g2_side === f2.split_g2_side) {
        totalScore += 8
        totalWeight += 8
      } else {
        totalWeight += 8
      }
    }
  }

  // Kickers (medium weight)
  totalWeight += 12
  if (f1.has_kickers === f2.has_kickers) {
    totalScore += 12
    if (f1.has_kickers && f2.has_kickers) {
      // Similar kicker count
      const countDiff = Math.abs(f1.kicker_count - f2.kicker_count)
      if (countDiff === 0) {
        totalScore += 8
      } else if (countDiff === 1) {
        totalScore += 4
      }
      totalWeight += 8
    }
  }

  // Beam curve (medium weight)
  totalWeight += 10
  if (f1.beam_curve === f2.beam_curve) {
    totalScore += 10
  }

  // Beam angle (medium weight)
  totalWeight += 10
  if (f1.beam_angle === f2.beam_angle) {
    totalScore += 10
  }

  // Tine configuration (medium weight)
  totalWeight += 8
  if (f1.tine_configuration === f2.tine_configuration) {
    totalScore += 8
  }

  return totalWeight > 0 ? (totalScore / totalWeight) * 100 : 0
}

/**
 * Compare absolute measurements (only when both have high confidence > 70)
 */
function compareMeasurements(
  m1: AntlerFingerprint['measurements'],
  m2: AntlerFingerprint['measurements'],
  c1: AntlerFingerprint['confidence'],
  c2: AntlerFingerprint['confidence']
): number {
  // Skip if either fingerprint has low overall confidence
  if (c1.overall < 70 || c2.overall < 70) {
    return 0
  }

  let totalScore = 0
  let validComparisons = 0

  // Inside spread (if spread confidence high)
  if (
    c1.spread_confidence > 70 &&
    c2.spread_confidence > 70 &&
    m1.inside_spread !== null &&
    m2.inside_spread !== null
  ) {
    const percentDiff = (Math.abs(m1.inside_spread - m2.inside_spread) /
                         ((m1.inside_spread + m2.inside_spread) / 2)) * 100
    if (percentDiff <= 10) {
      totalScore += 100
    } else if (percentDiff <= 20) {
      totalScore += 100 - ((percentDiff - 10) * 10)
    }
    validComparisons++
  }

  // Main beams (if beam confidence high)
  if (c1.beam_confidence > 70 && c2.beam_confidence > 70) {
    const beams = [
      [m1.main_beam_left, m2.main_beam_left],
      [m1.main_beam_right, m2.main_beam_right],
    ]

    for (const [b1, b2] of beams) {
      if (b1 === null || b2 === null || b1 === undefined || b2 === undefined) continue

      const percentDiff = (Math.abs(b1 - b2) / ((b1 + b2) / 2)) * 100
      if (percentDiff <= 10) {
        totalScore += 100
      } else if (percentDiff <= 20) {
        totalScore += 100 - ((percentDiff - 10) * 10)
      }
      validComparisons++
    }
  }

  // Tine lengths (if tine confidence high)
  if (c1.tine_confidence > 70 && c2.tine_confidence > 70) {
    const tines: [number | null, number | null][] = [
      [m1.tines.left.g1, m2.tines.left.g1],
      [m1.tines.left.g2, m2.tines.left.g2],
      [m1.tines.left.g3, m2.tines.left.g3],
      [m1.tines.left.g4, m2.tines.left.g4],
      [m1.tines.right.g1, m2.tines.right.g1],
      [m1.tines.right.g2, m2.tines.right.g2],
      [m1.tines.right.g3, m2.tines.right.g3],
      [m1.tines.right.g4, m2.tines.right.g4],
    ]

    for (const [t1, t2] of tines) {
      if (t1 === null || t2 === null || t1 === undefined || t2 === undefined) continue

      const percentDiff = (Math.abs(t1 - t2) / ((t1 + t2) / 2)) * 100
      if (percentDiff <= 10) {
        totalScore += 100
      } else if (percentDiff <= 20) {
        totalScore += 100 - ((percentDiff - 10) * 10)
      }
      validComparisons++
    }
  }

  return validComparisons > 0 ? totalScore / validComparisons : 0
}

/**
 * Detect possible broken tine scenarios
 *
 * From research.md:
 * - Ratio similarity > 70%
 * - Point count differs by 1-2
 * - Single tine measurement differs by >15%
 */
function detectBrokenTine(
  fp1: AntlerFingerprint,
  fp2: AntlerFingerprint,
  ratioScore: number
): boolean {
  // Check ratio similarity threshold
  if (ratioScore <= 70) {
    return false
  }

  // Check point count difference
  const pointCountDiff = Math.abs(
    fp1.measurements.total_points - fp2.measurements.total_points
  )
  if (pointCountDiff < 1 || pointCountDiff > 2) {
    return false
  }

  // Check if any single tine differs by >15%
  const tines1 = getAllTines(fp1.measurements)
  const tines2 = getAllTines(fp2.measurements)

  for (let i = 0; i < tines1.length; i++) {
    const t1 = tines1[i]
    const t2 = tines2[i]

    if (t1 === null || t2 === null || t1 === undefined || t2 === undefined) continue

    const percentDiff = (Math.abs(t1 - t2) / ((t1 + t2) / 2)) * 100
    if (percentDiff > 15) {
      return true
    }
  }

  return false
}

/**
 * Extract all tine measurements into a flat array for comparison
 */
function getAllTines(m: AntlerFingerprint['measurements']): (number | null)[] {
  return [
    m.tines.left.g1,
    m.tines.left.g2,
    m.tines.left.g3,
    m.tines.left.g4,
    m.tines.left.g5,
    m.tines.left.g6,
    m.tines.left.g7,
    m.tines.right.g1,
    m.tines.right.g2,
    m.tines.right.g3,
    m.tines.right.g4,
    m.tines.right.g5,
    m.tines.right.g6,
    m.tines.right.g7,
  ]
}

/**
 * Generate human-readable reasoning for the comparison result
 */
function generateReasoning(
  ratioScore: number,
  featureScore: number,
  measurementScore: number,
  flags: FingerprintComparisonResult['flags']
): string {
  const parts: string[] = []

  // Component scores
  if (ratioScore > 80) {
    parts.push(`Strong ratio match (${ratioScore.toFixed(1)}%)`)
  } else if (ratioScore > 60) {
    parts.push(`Moderate ratio match (${ratioScore.toFixed(1)}%)`)
  } else {
    parts.push(`Weak ratio match (${ratioScore.toFixed(1)}%)`)
  }

  if (featureScore > 80) {
    parts.push(`distinctive features align well (${featureScore.toFixed(1)}%)`)
  } else if (featureScore > 60) {
    parts.push(`some feature similarities (${featureScore.toFixed(1)}%)`)
  } else {
    parts.push(`few matching features (${featureScore.toFixed(1)}%)`)
  }

  if (measurementScore > 0) {
    if (measurementScore > 80) {
      parts.push(`absolute measurements highly consistent (${measurementScore.toFixed(1)}%)`)
    } else {
      parts.push(`absolute measurements show variation (${measurementScore.toFixed(1)}%)`)
    }
  } else {
    parts.push('insufficient confidence for measurement comparison')
  }

  // Flags
  const warnings: string[] = []
  if (flags.possible_broken_tine) {
    warnings.push('possible broken tine detected')
  }
  if (flags.point_count_mismatch) {
    warnings.push('point count differs')
  }
  if (flags.confidence_low) {
    warnings.push('low confidence in one or both fingerprints')
  }

  let reasoning = parts.join('; ') + '.'

  if (warnings.length > 0) {
    reasoning += ' Flags: ' + warnings.join(', ') + '.'
  }

  return reasoning
}
