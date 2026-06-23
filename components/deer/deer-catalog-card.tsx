'use client'

import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { DeerHeroImage } from './deer-hero-image'

export interface CatalogDeer {
  id: string
  name: string
  sighting_count: number
  score?: number | null
  is_trophy?: boolean
  last_seen?: string | null
  pending_match_count?: number
  reference_image_url?: string | null
  reference_bbox?: {
    x: number | null
    y: number | null
    width: number | null
    height: number | null
  } | null
}

export type CatalogView = 'immersive' | 'compact'

/** Compact relative time, e.g. "3d", "2w", "5mo". Returns null when unknown. */
function relTime(iso: string | null | undefined): string | null {
  if (iso == null || iso === '') return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return '1d'
  if (days < 7) return `${days}d`
  if (days < 30) return `${Math.floor(days / 7)}w`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}

function Photo({ deer }: { deer: CatalogDeer }): React.JSX.Element {
  if (deer.reference_image_url != null && deer.reference_image_url !== '') {
    return <DeerHeroImage imageUrl={deer.reference_image_url} bbox={deer.reference_bbox ?? null} alt={deer.name} />
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-light/40">
      <span className="font-display text-3xl text-cream-dark/50">{deer.name.charAt(0)}</span>
    </div>
  )
}

/** Engraved brass Score plaque — the hero metric (ADR 0004). */
function ScorePlate({ score, size = 'md' }: { score: number; size?: 'md' | 'lg' }): React.JSX.Element {
  const big = size === 'lg'
  return (
    <div className="flex-none rounded text-right border border-copper/45 bg-gradient-to-b from-copper/20 to-copper/[0.04] px-2 py-1 backdrop-blur-sm">
      <div className="font-mono uppercase tracking-[0.14em] text-brass-light/80 leading-none" style={{ fontSize: big ? 10 : 8 }}>Score</div>
      <div className={`font-mono font-bold text-brass-light leading-none tabular-nums ${big ? 'text-4xl' : 'text-xl'}`}>{score}</div>
    </div>
  )
}

/** Thin brass top-light that marks a confirmed trophy (status as material, not a badge). */
function TrophyLight(): React.JSX.Element {
  return <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[3px] bg-gradient-to-r from-transparent via-brass-light to-transparent" />
}

/** Copper pill flagging pending re-ID suggestions for this buck (ADR 0005). */
function PendingBadge({ count }: { count: number }): React.JSX.Element | null {
  if (count <= 0) return null
  return (
    <div className="absolute left-2 top-2 z-20 flex items-center gap-1 rounded-full bg-copper px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-deep shadow-md">
      <Sparkles className="h-3 w-3" />
      {count}
    </div>
  )
}

function MetaLine({ deer }: { deer: CatalogDeer }): string {
  const seen = relTime(deer.last_seen)
  const s = `${deer.sighting_count} sighting${deer.sighting_count === 1 ? '' : 's'}`
  return seen != null ? `Last seen ${seen} · ${s}` : s
}

export function DeerCatalogCard({ deer, view }: { deer: CatalogDeer; view: CatalogView }): React.JSX.Element {
  const trophy = deer.is_trophy === true
  const meta = MetaLine({ deer })

  if (view === 'compact') {
    return (
      <Link
        href={`/deer/${deer.id}`}
        className={`group block overflow-hidden rounded-xl border bg-slate transition-transform duration-150 hover:-translate-y-0.5 active:scale-[0.99] ${trophy ? 'border-copper/45' : 'border-cream/10'}`}
      >
        <div className="relative aspect-square overflow-hidden">
          {trophy && <TrophyLight />}
          <PendingBadge count={deer.pending_match_count ?? 0} />
          <Photo deer={deer} />
        </div>
        <div className="flex items-end justify-between gap-2 bg-gradient-to-b from-slate to-slate-deep px-3 py-2.5">
          <div className="min-w-0">
            <h3 className="truncate font-display italic font-semibold text-[15px] leading-tight text-cream">{deer.name}</h3>
            <p className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-cream-dark">{meta}</p>
          </div>
          {deer.score != null && <ScorePlate score={deer.score} />}
        </div>
      </Link>
    )
  }

  // Immersive: full-bleed mount, text overlaid on the photo.
  return (
    <Link
      href={`/deer/${deer.id}`}
      className={`group relative block overflow-hidden rounded-xl border shadow-[0_8px_22px_-14px_rgba(0,0,0,0.5)] transition-transform duration-150 hover:-translate-y-0.5 active:scale-[0.99] ${trophy ? 'border-copper/45' : 'border-cream/10'}`}
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        {trophy && <TrophyLight />}
        <PendingBadge count={deer.pending_match_count ?? 0} />
        <Photo deer={deer} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/0 to-black/5" />
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
        <div className="min-w-0">
          <h3 className="truncate font-display font-semibold text-[18px] leading-tight text-cream drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]">{deer.name}</h3>
          <p className="mt-0.5 truncate text-[11px] text-cream-dark drop-shadow-[0_1px_8px_rgba(0,0,0,0.7)]">{meta}</p>
        </div>
        {deer.score != null && <ScorePlate score={deer.score} />}
      </div>
    </Link>
  )
}
