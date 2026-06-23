'use client'

import { Button } from '@/components/ui/button'
import { MeasurementComparison } from './measurement-comparison'
import type { PendingMatchGroup } from '@/lib/services/trophy'
import { ChevronDown, ChevronRight, Eye, Check, X } from 'lucide-react'
import { useState } from 'react'

interface PendingMatchesSectionProps {
  groups: PendingMatchGroup[]
  onConfirmMatch?: (matchId: string) => void
  onRejectMatch?: (matchId: string) => void
  onBatchConfirm?: (matchIds: string[]) => void
  onBatchReject?: (matchIds: string[]) => void
}

/** Mono confidence readout — a measurement, not a colored status pill (DESIGN.md). */
function ConfidenceReadout({ label, value }: { label: string; value: number }): React.JSX.Element {
  const strong = value >= 85
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="font-sans text-[10px] uppercase tracking-[0.12em] text-cream-dark">{label}</span>
      <span className={`font-mono text-sm tabular-nums ${strong ? 'text-brass-light' : 'text-cream'}`}>{value}</span>
    </span>
  )
}

export function PendingMatchesSection({
  groups,
  onConfirmMatch,
  onRejectMatch,
  onBatchConfirm,
  onBatchReject,
}: PendingMatchesSectionProps): React.JSX.Element {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set())

  const toggleGroup = (deerId: string): void => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(deerId)) next.delete(deerId)
      else next.add(deerId)
      return next
    })
  }

  const toggleMatch = (matchId: string): void => {
    setExpandedMatches((prev) => {
      const next = new Set(prev)
      if (next.has(matchId)) next.delete(matchId)
      else next.add(matchId)
      return next
    })
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-xl border border-cream/10 bg-slate px-10 py-8">
          <h3 className="font-display text-xl font-semibold text-cream">You&rsquo;re all caught up</h3>
          <p className="mx-auto mt-2 max-w-xs text-sm text-cream-dark">
            No matches waiting. Run “Find Matches” to surface new re-ID suggestions.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const isExpanded = expandedGroups.has(group.deer.id)
        const matchIds = group.pending_matches.map((m) => m.id)

        return (
          <div key={group.deer.id} className="overflow-hidden rounded-xl border border-cream/10 bg-slate">
            {/* Group header: the known buck this batch may belong to */}
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <button
                onClick={() => toggleGroup(group.deer.id)}
                className="flex min-w-0 items-center gap-2 text-left transition-colors hover:text-copper"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 flex-none text-cream-dark" />
                ) : (
                  <ChevronRight className="h-4 w-4 flex-none text-cream-dark" />
                )}
                <span className="truncate font-display italic text-lg font-semibold text-cream">
                  {group.deer.name}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-cream-dark/70">
                  {group.total_count} to review
                </span>
              </button>

              {group.pending_matches.length > 1 && (
                <div className="flex flex-none gap-2">
                  <Button variant="default" size="sm" onClick={() => onBatchConfirm?.(matchIds)}>
                    <Check className="h-4 w-4" />
                    Accept all {group.total_count}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onBatchReject?.(matchIds)}>
                    Reject all
                  </Button>
                </div>
              )}
            </div>

            {isExpanded && (
              <div className="space-y-2 border-t border-cream/10 p-3">
                {group.pending_matches.map((match) => {
                  const isMatchExpanded = expandedMatches.has(match.id)

                  return (
                    <div key={match.id} className="overflow-hidden rounded-lg border border-cream/10">
                      <div className="flex items-center gap-4 bg-slate-deep/40 p-3">
                        {/* Detection photo — the thing being judged. Plain <img>:
                            next/image fails on signed Supabase crop URLs and
                            optimization is disabled globally anyway (see
                            deer-find-sightings.tsx). */}
                        <div className="relative h-24 w-24 flex-none overflow-hidden rounded-lg border border-cream/10 bg-slate-light/40">
                          {match.detection.thumbnail_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={match.detection.thumbnail_url}
                              alt="Candidate detection"
                              className="absolute inset-0 h-full w-full object-cover"
                            />
                          )}
                        </div>

                        {/* Readouts */}
                        <div className="flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <ConfidenceReadout label="Visual" value={Math.round(match.visual_confidence)} />
                            {match.antler_print_similarity !== null && (
                              <ConfidenceReadout
                                label="Print"
                                value={Math.round(match.antler_print_similarity * 100)}
                              />
                            )}
                          </div>
                          {match.possible_broken_tine && (
                            <p className="font-sans text-[10px] uppercase tracking-[0.12em] text-saddle-light">
                              Possible broken tine
                            </p>
                          )}
                          <p className="font-mono text-[11px] tabular-nums text-cream-dark/70">
                            {match.detection.captured_at
                              ? new Date(match.detection.captured_at).toLocaleDateString()
                              : 'Unknown date'}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-none items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => toggleMatch(match.id)}>
                            <Eye className="h-4 w-4" />
                            {isMatchExpanded ? 'Hide' : 'Details'}
                          </Button>
                          <Button variant="default" size="icon-sm" aria-label="Confirm match" onClick={() => onConfirmMatch?.(match.id)}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="icon-sm" aria-label="Reject match" onClick={() => onRejectMatch?.(match.id)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {isMatchExpanded && (
                        <div className="space-y-4 p-4">
                          {match.gemini_reasoning && (
                            <div className="text-sm">
                              <div className="mb-1 font-sans text-[10px] uppercase tracking-[0.12em] text-cream-dark">
                                AI reasoning
                              </div>
                              <p className="text-cream-dark">{match.gemini_reasoning}</p>
                            </div>
                          )}

                          {match.detection.antler_print && group.deer.antler_print && (
                            <MeasurementComparison
                              detection={match.detection.antler_print}
                              reference={group.deer.antler_print}
                              {...(match.antler_print_similarity !== null && {
                                similarity: match.antler_print_similarity,
                              })}
                              {...(match.possible_broken_tine && {
                                possibleBrokenTine: match.possible_broken_tine,
                              })}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
