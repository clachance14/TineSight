'use client'

import { DeerPreview } from './deer-preview'
import { type JSX } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { DetectionResponse } from '@/lib/hooks/use-detection'

function measurement(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) : '—'
}

function description(value: string | null | undefined): string {
  return value == null || value === '' ? 'Unknown' : value.replaceAll('_', ' ')
}

function MeasurementTable({ title, rows }: { title: string; rows: Array<[string, number | null | undefined, number | null | undefined]> }): JSX.Element {
  return <table className="w-full text-sm tabular-nums">
    <caption className="mb-2 text-left font-medium text-parchment">{title}</caption>
    <thead><tr className="border-b border-forest-light text-xs text-weathered"><th className="py-1.5 text-left font-normal">Measurement</th><th className="text-right font-normal">Left</th><th className="text-right font-normal">Right</th></tr></thead>
    <tbody>{rows.map(([label, left, right]) => <tr key={label} className="border-b border-forest-light/50"><th className="py-1.5 text-left font-normal text-cream-dark">{label}</th><td className="text-right font-mono">{measurement(left)}</td><td className="text-right font-mono">{measurement(right)}</td></tr>)}</tbody>
  </table>
}

/** Photo-based score summary stays visible while the operator explores supporting data. */
export function DeerDetailsContent({ detection }: { detection: DetectionResponse }): JSX.Element {
  const fingerprint = detection.antlerFingerprint
  const scores = fingerprint?.scores
  const measures = fingerprint?.measurements
  const features = fingerprint?.features
  const gross = scores?.gross_score ?? detection.scoreEstimate ?? null
  const confidence = fingerprint?.confidence.overall ?? detection.scoreEstimateConfidence ?? null
  const threshold = detection.trophyThreshold ?? null
  const confirmedTrophy = scores !== undefined && threshold !== null && scores.gross_score >= threshold
  const traits = [
    features?.has_drop_tine === true ? `Drop tine · ${description(features.drop_tine_location)}` : null,
    features?.has_split_g2 === true ? `Split G2 · ${description(features.split_g2_side)}` : null,
    features?.has_kickers === true ? `${features.kicker_count} kickers${features.kicker_locations != null && features.kicker_locations !== '' ? ` · ${features.kicker_locations}` : ''}` : null,
    features !== undefined && features.beam_curve !== 'normal' ? `${description(features.beam_curve)} beams` : null,
    features !== undefined && features.beam_angle !== 'normal' ? `${description(features.beam_angle)} beam angle` : null,
    features?.notable_asymmetry,
    features?.broken_tines != null && features.broken_tines !== '' ? `Broken tine · ${features.broken_tines}` : null,
    features?.other_features,
    detection.distinguishingFeatures,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)
  const uniqueTraits = [...new Set(traits)]
  const ratios = fingerprint?.ratios
  const ratioRows: Array<[string, number | null | undefined]> = [
    ['G2 to G3', ratios?.g2_to_g3], ['Brow to G2', ratios?.g1_to_g2],
    ['Beam symmetry', ratios?.beam_symmetry], ['Tine symmetry', ratios?.tine_symmetry],
    ['Spread to beam', ratios?.spread_to_beam], ['Mass to beam', ratios?.mass_to_beam],
    ['Brow to ear', ratios?.brow_to_ear], ['Tallest tine to ear', ratios?.tallest_tine_to_ear],
  ]
  const tabClass = 'min-h-11 rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 shadow-none data-[state=active]:border-brass data-[state=active]:bg-transparent data-[state=active]:text-brass data-[state=active]:shadow-none'

  return <div className="space-y-4 text-parchment" data-deer-details>
    <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-6">
      <DeerPreview key={detection.id} detection={detection} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] uppercase tracking-wider text-weathered">{scores !== undefined ? 'Photo-based gross score' : 'Estimated gross score'}</p>{confirmedTrophy && <span className="rounded-full border border-brass/50 px-3 py-0.5 text-xs text-brass">Trophy</span>}</div>
        <p className="font-mono text-5xl font-semibold leading-tight tracking-tight text-score-gold sm:text-6xl">{gross !== null ? measurement(gross) : '—'}{gross !== null && <span className="text-2xl">″</span>}</p>
        <p className="mt-1 text-xs text-weathered">{scores !== undefined ? `Net ${measurement(scores.net_score)}″ · Deductions ${measurement(scores.deductions)}″ · ${description(scores.typical_status)}` : gross !== null ? 'Antler measurements not yet available.' : 'A score is not available for this sighting yet.'}</p>
        <dl className="mt-3 grid grid-cols-3 gap-2 sm:gap-5">
          {[
            ['Points', measures?.total_points ?? detection.estimatedPointRange ?? '—'],
            ['Inside spread', measures?.inside_spread != null ? `${measurement(measures.inside_spread)}″` : '—'],
            ['AI confidence', confidence !== null ? `${confidence}%` : '—'],
          ].map(([label, value]) => <div key={label}><dt className="text-[11px] text-weathered">{label}</dt><dd className="mt-1 font-mono text-sm font-semibold sm:text-lg">{value}</dd></div>)}
        </dl>
      </div>
    </div>
    <Tabs defaultValue="overview">
      <TabsList aria-label="Deer information" className="h-auto w-full justify-start gap-5 rounded-none border-y border-forest-light bg-transparent p-0">
        <TabsTrigger className={tabClass} value="overview">Overview</TabsTrigger><TabsTrigger className={tabClass} value="measurements">Measurements</TabsTrigger><TabsTrigger className={tabClass} value="identification">Identification</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="pt-3 sm:min-h-44">
        <div className="grid gap-5 sm:grid-cols-2 sm:gap-8">
          <section><h3 className="mb-2 font-fraunces text-lg">What stands out</h3><div className="flex flex-wrap gap-1.5">{uniqueTraits.length > 0 ? uniqueTraits.map(trait => <span key={trait} className="rounded-md bg-forest px-2 py-1 text-xs">{trait}</span>) : <p className="text-sm text-weathered">No distinctive traits recorded yet.</p>}</div><p className="mt-3 text-xs capitalize text-weathered">{description(detection.species)} · {description(detection.sex)} · {description(detection.ageClass)} age</p></section>
          <section><h3 className="mb-2 font-fraunces text-lg">Score context</h3><dl className="grid grid-cols-[1fr_auto] gap-2 text-sm"><dt className="text-weathered">Your trophy threshold</dt><dd className="font-mono">{threshold !== null ? `${threshold}″` : 'Unavailable'}</dd>{gross !== null && threshold !== null && <><dt className="text-weathered">{gross >= threshold ? 'Above threshold' : 'Below threshold'}</dt><dd className="font-mono">{measurement(Math.abs(gross - threshold))}″</dd></>}</dl><p className="mt-3 text-xs leading-relaxed text-weathered">Confidence reflects the AI’s assessment of this image. Measurements are photo-based estimates.</p></section>
        </div>
      </TabsContent>
      <TabsContent value="measurements" className="pt-3 sm:min-h-44">
        {measures !== undefined ? <><p className="mb-3 text-xs text-weathered">Lengths and circumferences in inches · Inside spread {measurement(measures.inside_spread)}″</p><div className="grid gap-6 sm:grid-cols-2">
          <MeasurementTable title="Beams & tines" rows={[
            ['Main beam', measures.main_beam_left, measures.main_beam_right],
            ...(['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7'] as const).filter(key => measures.tines.left[key] != null || measures.tines.right[key] != null).map(key => [key.toUpperCase(), measures.tines.left[key], measures.tines.right[key]] as [string, number | null, number | null]),
          ]} />
          <div><MeasurementTable title="Circumference" rows={(['h1', 'h2', 'h3', 'h4'] as const).map(key => [key.toUpperCase(), measures.mass.left[key], measures.mass.right[key]])} /><p className="mt-3 text-sm text-weathered">Points: <span className="font-mono text-parchment">{measures.points_per_side[0]} left · {measures.points_per_side[1]} right</span></p></div>
        </div></> : <p className="text-sm text-weathered">Detailed measurements will appear when an antler fingerprint is available.</p>}
      </TabsContent>
      <TabsContent value="identification" className="pt-3 sm:min-h-44">
        <div className="grid gap-5 sm:grid-cols-2 sm:gap-8"><section><h3 className="mb-2 font-fraunces text-lg">Recognition traits</h3><p className="text-sm text-cream-dark">{uniqueTraits.length > 0 ? uniqueTraits.join('. ') : 'No recognition traits recorded yet.'}</p></section><section><h3 className="mb-2 font-fraunces text-lg">Comparison ratios</h3><dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">{ratioRows.map(([label, value]) => <div key={label} className="contents"><dt className="text-weathered">{label}</dt><dd className="font-mono">{typeof value === 'number' ? value.toFixed(2) : '—'}</dd></div>)}</dl></section></div>
      </TabsContent>
    </Tabs>
  </div>
}
