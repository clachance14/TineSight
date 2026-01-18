'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AntlerFingerprint } from '@/types/fingerprint'
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react'

interface AntlerPrintCardProps {
  fingerprint: AntlerFingerprint | null
}

/**
 * Get badge variant and label for score class
 */
function getScoreClassDisplay(scoreClass: string): { variant: 'default' | 'success' | 'warning'; label: string } {
  switch (scoreClass) {
    case 'world_class':
      return { variant: 'success', label: 'World Class' }
    case '200s':
      return { variant: 'success', label: '200s' }
    case '180s':
      return { variant: 'default', label: '180s' }
    case '160s':
      return { variant: 'default', label: '160s' }
    case '140s':
      return { variant: 'warning', label: '140s' }
    case '120s':
      return { variant: 'warning', label: '120s' }
    default:
      return { variant: 'warning', label: 'Unknown' }
  }
}

/**
 * Get confidence indicator icon based on confidence value
 */
function ConfidenceIndicator({ confidence }: { confidence: number }): React.JSX.Element {
  if (confidence >= 80) {
    return <CheckCircle2 className="h-4 w-4 text-green-500" />
  } else if (confidence >= 60) {
    return <AlertCircle className="h-4 w-4 text-yellow-500" />
  } else {
    return <XCircle className="h-4 w-4 text-red-500" />
  }
}

/**
 * Format measurement with null handling
 */
function formatMeasurement(value: number | null): string {
  if (value === null) return '—'
  return `${value.toFixed(1)}"`
}

/**
 * Format ratio with null handling
 */
function formatRatio(value: number | null): string {
  if (value === null) return '—'
  return value.toFixed(2)
}

/**
 * Display antler fingerprint data for a deer profile
 */
export function AntlerPrintCard({ fingerprint }: AntlerPrintCardProps): React.JSX.Element {
  // Handle null fingerprint gracefully
  if (!fingerprint) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Antler Print</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-12 w-12 text-cream-dark mb-3" />
            <p className="text-sm text-cream-dark">Fingerprint not available</p>
            <p className="text-xs text-cream-dark/70 mt-1">
              Trophy fingerprints are generated automatically for trophy-tier bucks
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const { scores, measurements, ratios, features, confidence } = fingerprint
  const scoreClassDisplay = getScoreClassDisplay(scores.score_class)

  // Collect distinctive features for display
  const distinctiveFeatures: string[] = []
  if (features.has_drop_tine) {
    const location = features.drop_tine_location === 'both' ? 'both sides' : features.drop_tine_location
    distinctiveFeatures.push(`Drop tine (${location})${features.drop_tine_length ? ` - ${features.drop_tine_length.toFixed(1)}"` : ''}`)
  }
  if (features.has_split_g2) {
    const side = features.split_g2_side === 'both' ? 'both sides' : features.split_g2_side
    distinctiveFeatures.push(`Split G2 (${side})`)
  }
  if (features.has_kickers) {
    distinctiveFeatures.push(`${features.kicker_count} kicker${features.kicker_count > 1 ? 's' : ''}${features.kicker_locations ? ` - ${features.kicker_locations}` : ''}`)
  }
  if (features.beam_curve !== 'normal') {
    distinctiveFeatures.push(`${features.beam_curve.replace('_', ' ')} beam curve`)
  }
  if (features.beam_angle !== 'normal') {
    distinctiveFeatures.push(`${features.beam_angle} beam angle`)
  }
  if (features.notable_asymmetry) {
    distinctiveFeatures.push(features.notable_asymmetry)
  }
  if (features.broken_tines) {
    distinctiveFeatures.push(`Broken tine: ${features.broken_tines}`)
  }
  if (features.other_features) {
    distinctiveFeatures.push(features.other_features)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Antler Print</CardTitle>
          <Badge variant={scoreClassDisplay.variant}>
            {scoreClassDisplay.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Scores */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-cream">B&C Score</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-xs text-cream-dark">Gross Score</p>
              <p className="text-lg font-semibold text-cream">{scores.gross_score.toFixed(1)}"</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-cream-dark">Net Score</p>
              <p className="text-lg font-semibold text-cream">{scores.net_score.toFixed(1)}"</p>
            </div>
          </div>
          {scores.deductions > 0 && (
            <p className="text-xs text-cream-dark">
              Deductions: {scores.deductions.toFixed(1)}" ({scores.typical_status})
            </p>
          )}
        </div>

        {/* Key Measurements */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-cream">Measurements</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-cream-dark">Inside Spread</span>
              <span className="text-cream font-medium">{formatMeasurement(measurements.inside_spread)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-cream-dark">Main Beams</span>
              <span className="text-cream font-medium">
                {formatMeasurement(measurements.main_beam_left)} / {formatMeasurement(measurements.main_beam_right)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-cream-dark">Points (L/R)</span>
              <span className="text-cream font-medium">
                {measurements.points_per_side[0]} / {measurements.points_per_side[1]} ({measurements.total_points} total)
              </span>
            </div>
            {measurements.tines.left.g2 !== null && measurements.tines.left.g3 !== null && (
              <>
                <div className="flex justify-between">
                  <span className="text-cream-dark">G2 Tines</span>
                  <span className="text-cream font-medium">
                    {formatMeasurement(measurements.tines.left.g2)} / {formatMeasurement(measurements.tines.right.g2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cream-dark">G3 Tines</span>
                  <span className="text-cream font-medium">
                    {formatMeasurement(measurements.tines.left.g3)} / {formatMeasurement(measurements.tines.right.g3)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Derived Ratios */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-cream">Identifying Ratios</h3>
          <div className="space-y-2 text-sm">
            {ratios.g2_to_g3 !== null && (
              <div className="flex justify-between items-center">
                <span className="text-cream-dark">G2:G3 Ratio</span>
                <div className="flex items-center gap-2">
                  <span className="text-cream font-medium">{formatRatio(ratios.g2_to_g3)}</span>
                  <ConfidenceIndicator confidence={confidence.tine_confidence} />
                </div>
              </div>
            )}
            {ratios.beam_symmetry !== null && (
              <div className="flex justify-between items-center">
                <span className="text-cream-dark">Beam Symmetry</span>
                <div className="flex items-center gap-2">
                  <span className="text-cream font-medium">{formatRatio(ratios.beam_symmetry)}</span>
                  <ConfidenceIndicator confidence={confidence.beam_confidence} />
                </div>
              </div>
            )}
            {ratios.spread_to_beam !== null && (
              <div className="flex justify-between items-center">
                <span className="text-cream-dark">Spread:Beam</span>
                <div className="flex items-center gap-2">
                  <span className="text-cream font-medium">{formatRatio(ratios.spread_to_beam)}</span>
                  <ConfidenceIndicator confidence={confidence.spread_confidence} />
                </div>
              </div>
            )}
            {ratios.tine_symmetry !== null && (
              <div className="flex justify-between items-center">
                <span className="text-cream-dark">Tine Symmetry</span>
                <div className="flex items-center gap-2">
                  <span className="text-cream font-medium">{formatRatio(ratios.tine_symmetry)}</span>
                  <ConfidenceIndicator confidence={confidence.tine_confidence} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Distinctive Features */}
        {distinctiveFeatures.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-cream">Distinctive Features</h3>
            <ul className="space-y-1.5">
              {distinctiveFeatures.map((feature, index) => (
                <li key={index} className="text-sm text-cream-dark flex items-start gap-2">
                  <span className="text-copper mt-0.5">•</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Overall Confidence */}
        <div className="pt-3 border-t border-cream/10">
          <div className="flex justify-between items-center">
            <span className="text-sm text-cream-dark">Overall Confidence</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-cream">{confidence.overall}%</span>
              <ConfidenceIndicator confidence={confidence.overall} />
            </div>
          </div>
          <div className="mt-2">
            <div className="h-2 bg-slate rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  confidence.overall >= 80
                    ? 'bg-green-500'
                    : confidence.overall >= 60
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${confidence.overall}%` }}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
