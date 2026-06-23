'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AntlerFingerprint } from '@/types/fingerprint'
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react'

interface AntlerPrintCardProps {
  fingerprint: AntlerFingerprint | null
}

/**
 * Get badge variant and label for score class.
 * Exported so the deer-page hero and this card share one source of truth.
 */
export function getScoreClassDisplay(scoreClass: string): { variant: 'default' | 'success' | 'warning'; label: string } {
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
 * Compact stat tile: muted label over a bold value (+ optional trailing icon).
 * Two per row, this packs the measurement/ratio data into far less height than
 * full-width label/value rows on mobile.
 */
function Stat({
  label,
  value,
  icon,
}: {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-cream-dark">{label}</p>
      <p className="flex items-center gap-1.5 text-sm font-medium text-cream">
        {value}
        {icon}
      </p>
    </div>
  )
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
      <CardContent className="space-y-5">
        {/* Scores */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-cream">B&C Score</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-0.5">
              <p className="text-xs text-cream-dark">Gross Score</p>
              <p className="text-lg font-semibold text-cream">{scores.gross_score.toFixed(1)}"</p>
            </div>
            <div className="space-y-0.5">
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

        {/* Key Measurements — 2-up tile grid */}
        <div className="space-y-2.5">
          <h3 className="text-sm font-semibold text-cream">Measurements</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Stat label="Inside Spread" value={formatMeasurement(measurements.inside_spread)} />
            <Stat
              label="Main Beams"
              value={`${formatMeasurement(measurements.main_beam_left)} / ${formatMeasurement(measurements.main_beam_right)}`}
            />
            <Stat
              label="Points (L/R)"
              value={`${measurements.points_per_side[0]} / ${measurements.points_per_side[1]}`}
            />
            {measurements.tines.left.g2 !== null && measurements.tines.left.g3 !== null && (
              <>
                <Stat
                  label="G2 Tines"
                  value={`${formatMeasurement(measurements.tines.left.g2)} / ${formatMeasurement(measurements.tines.right.g2)}`}
                />
                <Stat
                  label="G3 Tines"
                  value={`${formatMeasurement(measurements.tines.left.g3)} / ${formatMeasurement(measurements.tines.right.g3)}`}
                />
              </>
            )}
          </div>
        </div>

        {/* Derived Ratios — 2-up tile grid with confidence icons */}
        <div className="space-y-2.5">
          <h3 className="text-sm font-semibold text-cream">Identifying Ratios</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {ratios.g2_to_g3 !== null && (
              <Stat
                label="G2:G3 Ratio"
                value={formatRatio(ratios.g2_to_g3)}
                icon={<ConfidenceIndicator confidence={confidence.tine_confidence} />}
              />
            )}
            {ratios.beam_symmetry !== null && (
              <Stat
                label="Beam Symmetry"
                value={formatRatio(ratios.beam_symmetry)}
                icon={<ConfidenceIndicator confidence={confidence.beam_confidence} />}
              />
            )}
            {ratios.spread_to_beam !== null && (
              <Stat
                label="Spread:Beam"
                value={formatRatio(ratios.spread_to_beam)}
                icon={<ConfidenceIndicator confidence={confidence.spread_confidence} />}
              />
            )}
            {ratios.tine_symmetry !== null && (
              <Stat
                label="Tine Symmetry"
                value={formatRatio(ratios.tine_symmetry)}
                icon={<ConfidenceIndicator confidence={confidence.tine_confidence} />}
              />
            )}
          </div>
        </div>

        {/* Distinctive Features — chips wrap denser than a bullet list */}
        {distinctiveFeatures.length > 0 && (
          <div className="space-y-2.5">
            <h3 className="text-sm font-semibold text-cream">Distinctive Features</h3>
            <div className="flex flex-wrap gap-1.5">
              {distinctiveFeatures.map((feature, index) => (
                <span
                  key={index}
                  className="rounded-full border border-cream/10 bg-slate px-2.5 py-1 text-xs text-cream"
                >
                  {feature}
                </span>
              ))}
            </div>
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
