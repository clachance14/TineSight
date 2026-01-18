'use client'

import { cn } from '@/lib/utils'
import type { AntlerFingerprint } from '@/types/fingerprint'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Check, X, TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface MeasurementComparisonProps {
  detection: AntlerFingerprint | null
  reference: AntlerFingerprint | null
  similarity?: number // 0-1 scale
  possibleBrokenTine?: boolean
  className?: string
}

interface MeasurementRowProps {
  label: string
  value1: number | null | undefined
  value2: number | null | undefined
  unit?: string
  tolerance?: number // percentage
}

function MeasurementRow({ label, value1, value2, unit = '"', tolerance = 10 }: MeasurementRowProps) {
  if (value1 === null || value1 === undefined || value2 === null || value2 === undefined) {
    return null
  }

  const avg = (value1 + value2) / 2
  const diff = Math.abs(value1 - value2)
  const percentDiff = avg > 0 ? (diff / avg) * 100 : 0

  const isMatch = percentDiff <= tolerance
  const isClose = percentDiff <= tolerance * 2

  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate/20 last:border-0">
      <span className="text-sm text-cream-dark">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm font-mono text-cream">
          {value1.toFixed(1)}{unit}
        </span>
        <span className="text-muted-foreground">vs</span>
        <span className="text-sm font-mono text-cream">
          {value2.toFixed(1)}{unit}
        </span>
        {isMatch ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : isClose ? (
          <Minus className="h-4 w-4 text-yellow-500" />
        ) : (
          <X className="h-4 w-4 text-red-500" />
        )}
      </div>
    </div>
  )
}

interface RatioRowProps {
  label: string
  value1: number | null | undefined
  value2: number | null | undefined
}

function RatioRow({ label, value1, value2 }: RatioRowProps) {
  if (value1 === null || value1 === undefined || value2 === null || value2 === undefined) {
    return null
  }

  const diff = Math.abs(value1 - value2)
  const percentDiff = ((value1 + value2) / 2) > 0 ? (diff / ((value1 + value2) / 2)) * 100 : 0

  const isMatch = percentDiff <= 10
  const trend = value1 > value2 ? 'up' : value1 < value2 ? 'down' : 'same'

  return (
    <div className="flex items-center justify-between py-1 text-xs">
      <span className="text-cream-dark">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono">{value1.toFixed(2)}</span>
        {trend === 'up' && <TrendingUp className="h-3 w-3 text-copper" />}
        {trend === 'down' && <TrendingDown className="h-3 w-3 text-copper-light" />}
        {trend === 'same' && <Minus className="h-3 w-3 text-muted-foreground" />}
        <span className="font-mono">{value2.toFixed(2)}</span>
        {isMatch && <Check className="h-3 w-3 text-green-500" />}
      </div>
    </div>
  )
}

export function MeasurementComparison({
  detection,
  reference,
  similarity,
  possibleBrokenTine = false,
  className,
}: MeasurementComparisonProps) {
  if (!detection || !reference) {
    return (
      <div className={cn('rounded-lg bg-slate/30 p-4 text-sm text-muted-foreground', className)}>
        Fingerprint data not available for comparison
      </div>
    )
  }

  const similarityPercent = similarity !== undefined ? Math.round(similarity * 100) : null

  return (
    <div className={cn('rounded-lg bg-slate/50 p-4 space-y-4', className)}>
      {/* Header with similarity score */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-cream">Antler Print Comparison</h4>
        <div className="flex items-center gap-2">
          {possibleBrokenTine && (
            <Badge variant="outline" className="border-yellow-500 text-yellow-500 text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Possible Broken Tine
            </Badge>
          )}
          {similarityPercent !== null && (
            <Badge
              variant={similarityPercent >= 85 ? 'default' : similarityPercent >= 70 ? 'secondary' : 'outline'}
              className={cn(
                similarityPercent >= 85 && 'bg-green-600 text-white',
                similarityPercent >= 70 && similarityPercent < 85 && 'bg-yellow-600 text-white'
              )}
            >
              {similarityPercent}% match
            </Badge>
          )}
        </div>
      </div>

      {/* Score class comparison */}
      <div className="flex items-center justify-between pb-2 border-b border-slate/30">
        <div className="text-center flex-1">
          <div className="text-xs text-muted-foreground mb-1">Detection</div>
          <Badge variant="outline" className="text-copper border-copper">
            {detection.scores.score_class}
          </Badge>
          <div className="text-lg font-bold text-cream mt-1">
            {detection.scores.gross_score?.toFixed(0) ?? '?'}"
          </div>
          <div className="text-xs text-muted-foreground">
            ({detection.measurements.total_points} pts)
          </div>
        </div>
        <div className="px-4 text-muted-foreground">vs</div>
        <div className="text-center flex-1">
          <div className="text-xs text-muted-foreground mb-1">Reference</div>
          <Badge variant="outline" className="text-copper border-copper">
            {reference.scores.score_class}
          </Badge>
          <div className="text-lg font-bold text-cream mt-1">
            {reference.scores.gross_score?.toFixed(0) ?? '?'}"
          </div>
          <div className="text-xs text-muted-foreground">
            ({reference.measurements.total_points} pts)
          </div>
        </div>
      </div>

      {/* Key measurements */}
      <div className="space-y-1">
        <div className="text-xs font-medium text-cream-dark mb-2">Key Measurements</div>
        <MeasurementRow
          label="Inside Spread"
          value1={detection.measurements.inside_spread}
          value2={reference.measurements.inside_spread}
        />
        <MeasurementRow
          label="Main Beam (L)"
          value1={detection.measurements.main_beam_left}
          value2={reference.measurements.main_beam_left}
        />
        <MeasurementRow
          label="Main Beam (R)"
          value1={detection.measurements.main_beam_right}
          value2={reference.measurements.main_beam_right}
        />
        <MeasurementRow
          label="G2 (L)"
          value1={detection.measurements.tines.left.g2}
          value2={reference.measurements.tines.left.g2}
        />
        <MeasurementRow
          label="G2 (R)"
          value1={detection.measurements.tines.right.g2}
          value2={reference.measurements.tines.right.g2}
        />
        <MeasurementRow
          label="G3 (L)"
          value1={detection.measurements.tines.left.g3}
          value2={reference.measurements.tines.left.g3}
        />
        <MeasurementRow
          label="G3 (R)"
          value1={detection.measurements.tines.right.g3}
          value2={reference.measurements.tines.right.g3}
        />
      </div>

      {/* Ratios comparison */}
      <div className="space-y-1">
        <div className="text-xs font-medium text-cream-dark mb-2">Ratios (Angle-Invariant)</div>
        <RatioRow label="G2:G3" value1={detection.ratios.g2_to_g3} value2={reference.ratios.g2_to_g3} />
        <RatioRow label="Beam Symmetry" value1={detection.ratios.beam_symmetry} value2={reference.ratios.beam_symmetry} />
        <RatioRow label="Tine Symmetry" value1={detection.ratios.tine_symmetry} value2={reference.ratios.tine_symmetry} />
        <RatioRow label="Spread:Beam" value1={detection.ratios.spread_to_beam} value2={reference.ratios.spread_to_beam} />
      </div>

      {/* Distinctive features */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-cream-dark">Distinctive Features</div>
        <div className="flex flex-wrap gap-2">
          {detection.features.has_drop_tine && (
            <Badge variant={reference.features.has_drop_tine ? 'default' : 'destructive'} className="text-xs">
              Drop Tine {detection.features.drop_tine_location && `(${detection.features.drop_tine_location})`}
            </Badge>
          )}
          {detection.features.has_split_g2 && (
            <Badge variant={reference.features.has_split_g2 ? 'default' : 'destructive'} className="text-xs">
              Split G2 {detection.features.split_g2_side && `(${detection.features.split_g2_side})`}
            </Badge>
          )}
          {detection.features.has_kickers && (
            <Badge variant={reference.features.has_kickers ? 'default' : 'destructive'} className="text-xs">
              Kickers ({detection.features.kicker_count})
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            Beam: {detection.features.beam_curve}
          </Badge>
        </div>
      </div>

      {/* Confidence indicator */}
      <div className="pt-2 border-t border-slate/30">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Confidence</span>
          <div className="flex items-center gap-4">
            <span className={cn(
              detection.confidence.overall >= 70 ? 'text-green-500' : 'text-yellow-500'
            )}>
              Detection: {detection.confidence.overall}%
            </span>
            <span className={cn(
              reference.confidence.overall >= 70 ? 'text-green-500' : 'text-yellow-500'
            )}>
              Reference: {reference.confidence.overall}%
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
