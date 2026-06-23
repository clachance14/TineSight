'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, X, Loader2, ScanSearch, RotateCw, Maximize2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useFindSightings, useReviewSightingCandidate, type SightingCandidate } from '@/lib/hooks/use-matches'

/** "Mar 14, 2026" — the source Photo's capture date (re-ID is temporal). */
function formatCaptured(iso: string | null): string | null {
  if (iso == null || iso === '') return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** One line of metadata: "174″ gross · 10+ points · mature" (null when empty). */
function detailLine(c: SightingCandidate): string | null {
  const line = [
    c.score_gross != null ? `${c.score_gross.toFixed(0)}″ gross` : null,
    c.point_range != null && c.point_range !== '' ? c.point_range : null,
    c.age_class ?? null,
  ]
    .filter((p): p is string => p != null)
    .join(' · ')
  return line === '' ? null : line
}

/**
 * Operator-driven re-ID for one Buck (ADR 0005). "Find sightings" ranks the
 * account's unassigned fingerprinted Detections by antler-print similarity to this
 * Buck and lets the operator confirm (adds the Sighting) or reject (sticky) each.
 *
 * Ranked-manual on purpose: the fingerprint scores "is this a big typical rack",
 * not "is this *this* buck", so similarity is a shortlist, not a verdict — the
 * operator decides from the crops. Tap a crop to open a full-size viewer with the
 * details + match confidence and arrow/swipe navigation through the shortlist.
 */
export function DeerFindSightings({
  deerId,
  deerName,
  hasFingerprint,
}: {
  deerId: string
  deerName: string
  hasFingerprint: boolean
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const touchStartX = useRef<number | null>(null)
  const { data, isFetching, isError, refetch } = useFindSightings(deerId, open)
  const review = useReviewSightingCandidate(deerId)

  const candidates = data?.candidates ?? []
  const count = candidates.length
  const current = lightboxIndex != null ? candidates[lightboxIndex] ?? null : null

  // Keyboard nav for the enlarged viewer: ← → to move, Esc to close.
  useEffect(() => {
    if (lightboxIndex == null) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setLightboxIndex(null)
      else if (e.key === 'ArrowLeft') setLightboxIndex((i) => (i == null ? i : Math.max(0, i - 1)))
      else if (e.key === 'ArrowRight') setLightboxIndex((i) => (i == null ? i : Math.min(count - 1, i + 1)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, count])

  if (!hasFingerprint) return null

  const busyId = review.isPending ? review.variables?.detectionId : undefined
  const go = (delta: number): void =>
    setLightboxIndex((i) => (i == null ? i : Math.min(count - 1, Math.max(0, i + delta))))

  // Review (confirm/reject) optimistically REMOVES the current row, so the next
  // candidate shifts into this index — keep the index, clamp to the shrunk list,
  // and close when the shortlist empties.
  const reviewCurrent = (decision: 'confirm' | 'reject'): void => {
    if (current == null) return
    review.mutate({ detectionId: current.detection_id, decision, similarity: current.similarity })
    setLightboxIndex((i) => {
      if (i == null) return i
      const nextLen = count - 1
      return nextLen <= 0 ? null : Math.min(i, nextLen - 1)
    })
  }

  return (
    <>
      <Card className="border-cream/10 bg-slate">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="flex items-center gap-2 text-cream">
            <ScanSearch className="h-4 w-4 text-copper" />
            Find sightings
          </CardTitle>
          {open ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-cream-dark hover:text-cream"
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          ) : (
            <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
              <ScanSearch className="h-3.5 w-3.5" />
              Search
            </Button>
          )}
        </CardHeader>

        {open && (
          <CardContent className="space-y-3">
            <p className="text-xs text-cream-dark">
              Unassigned bucks ranked by antler-print similarity to {deerName}. This is a
              shortlist, not a verdict — tap a crop to see it full-size and confirm only the
              ones that are really him.
            </p>

            {isFetching && candidates.length === 0 ? (
              <div className="flex items-center gap-2 py-6 text-sm text-cream-dark">
                <Loader2 className="h-4 w-4 animate-spin" /> Scanning the catalog…
              </div>
            ) : isError ? (
              <div className="space-y-2 py-4">
                <p className="text-sm text-red-400">Couldn’t run the search.</p>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void refetch()}>
                  <RotateCw className="h-3.5 w-3.5" /> Try again
                </Button>
              </div>
            ) : candidates.length === 0 ? (
              <div className="space-y-2 py-4">
                <p className="text-sm text-cream-dark">
                  No more candidates — every similar unassigned buck has been reviewed.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={isFetching}
                  onClick={() => void refetch()}
                >
                  {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                  Search again
                </Button>
              </div>
            ) : (
              <ul className="space-y-3">
                {candidates.map((c, idx) => {
                  const busy = busyId === c.detection_id
                  const hasCrop = c.crop_url != null && c.crop_url !== ''
                  return (
                    <li
                      key={c.detection_id}
                      className="flex items-center gap-3 rounded-lg border border-cream/10 bg-slate-deep/60 p-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => hasCrop && setLightboxIndex(idx)}
                        disabled={!hasCrop}
                        className="group relative h-16 w-16 flex-none overflow-hidden rounded-md bg-slate-light/40 disabled:cursor-default"
                        aria-label="View crop full-size"
                      >
                        {hasCrop ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={c.crop_url ?? ''}
                              alt="Candidate sighting"
                              className="h-full w-full object-cover transition group-hover:scale-105"
                            />
                            <span className="absolute inset-0 hidden items-center justify-center bg-slate-deep/45 group-hover:flex">
                              <Maximize2 className="h-4 w-4 text-cream" />
                            </span>
                          </>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-cream-dark/50">?</div>
                        )}
                        <span className="absolute left-0 top-0 rounded-br-md bg-slate-deep/85 px-1.5 py-0.5 font-mono text-[10px] text-cream-dark">
                          #{idx + 1}
                        </span>
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-sm tabular-nums text-brass-light">
                          {c.similarity.toFixed(1)}
                          <span className="text-xs text-cream-dark"> % match</span>
                        </p>
                        <p className="mt-0.5 truncate text-xs text-cream-dark">{detailLine(c) ?? 'unknown age'}</p>
                      </div>
                      <div className="flex flex-none gap-1.5">
                        <Button
                          size="sm"
                          className="gap-1"
                          disabled={busy}
                          onClick={() =>
                            review.mutate({ detectionId: c.detection_id, decision: 'confirm', similarity: c.similarity })
                          }
                          aria-label={`Confirm this is ${deerName}`}
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-cream-dark hover:text-cream"
                          disabled={busy}
                          onClick={() =>
                            review.mutate({ detectionId: c.detection_id, decision: 'reject', similarity: c.similarity })
                          }
                          aria-label="Not this buck"
                        >
                          <X className="h-3.5 w-3.5" />
                          Not him
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        )}
      </Card>

      {/* Enlarged-crop viewer — the operator's real "is this him?" view, with the
          details + match confidence and ← → / swipe navigation through the shortlist. */}
      {current != null && lightboxIndex != null && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/92 p-4"
          onClick={() => setLightboxIndex(null)}
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0]?.clientX ?? null
          }}
          onTouchEnd={(e) => {
            const sx = touchStartX.current
            touchStartX.current = null
            if (sx == null) return
            const dx = (e.changedTouches[0]?.clientX ?? sx) - sx
            if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged crop"
        >
          {/* Close */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setLightboxIndex(null)
            }}
            className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-slate-deep/80 text-cream hover:bg-slate-deep"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Prev */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              go(-1)
            }}
            disabled={lightboxIndex === 0}
            className="absolute left-2 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-slate-deep/70 text-cream hover:bg-slate-deep disabled:opacity-30 sm:left-4"
            aria-label="Previous candidate"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          {/* Next */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              go(1)
            }}
            disabled={lightboxIndex === count - 1}
            className="absolute right-2 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-slate-deep/70 text-cream hover:bg-slate-deep disabled:opacity-30 sm:right-4"
            aria-label="Next candidate"
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          {/* Crop */}
          {current.crop_url != null && current.crop_url !== '' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.crop_url}
              alt={`Candidate sighting #${lightboxIndex + 1}`}
              className="max-h-[78vh] max-w-full rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="flex h-40 w-40 items-center justify-center rounded-lg bg-slate text-cream-dark">no crop</div>
          )}

          {/* Details + confidence panel */}
          <div
            className="mt-4 w-full max-w-md rounded-xl border border-cream/10 bg-slate/90 p-4 backdrop-blur"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-xs uppercase tracking-wide text-cream-dark">
                #{lightboxIndex + 1} of {count}
              </span>
              <span className="font-mono text-2xl tabular-nums text-score-gold">
                {current.similarity.toFixed(1)}
                <span className="ml-1 text-sm text-cream-dark">% match</span>
              </span>
            </div>
            <p className="mt-1 text-sm text-cream">{detailLine(current) ?? 'No measurements recorded'}</p>
            {formatCaptured(current.captured_at) != null && (
              <p className="mt-0.5 text-xs text-cream-dark">Seen {formatCaptured(current.captured_at)}</p>
            )}
            <p className="mt-2 text-[11px] leading-snug text-cream-dark/80">
              Match = antler-print similarity to {deerName}, not a same-buck guarantee. Judge from
              the photo.
            </p>

            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                className="flex-1 gap-1"
                disabled={busyId === current.detection_id}
                onClick={() => reviewCurrent('confirm')}
                aria-label={`Confirm this is ${deerName}`}
              >
                {busyId === current.detection_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 gap-1 border-cream/20 text-cream-dark hover:text-cream"
                disabled={busyId === current.detection_id}
                onClick={() => reviewCurrent('reject')}
                aria-label="Not this buck"
              >
                <X className="h-3.5 w-3.5" />
                Not him
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
