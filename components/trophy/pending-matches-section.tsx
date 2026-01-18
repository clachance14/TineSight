'use client'

import Image from 'next/image'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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

export function PendingMatchesSection({
  groups,
  onConfirmMatch,
  onRejectMatch,
  onBatchConfirm,
  onBatchReject,
}: PendingMatchesSectionProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set())
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set())

  const toggleGroup = (deerId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(deerId)) {
        next.delete(deerId)
      } else {
        next.add(deerId)
      }
      return next
    })
  }

  const toggleMatch = (matchId: string) => {
    setExpandedMatches((prev) => {
      const next = new Set(prev)
      if (next.has(matchId)) {
        next.delete(matchId)
      } else {
        next.add(matchId)
      }
      return next
    })
  }

  const toggleSelectMatch = (matchId: string, _deerId: string) => {
    setSelectedMatches((prev) => {
      const next = new Set(prev)
      if (next.has(matchId)) {
        next.delete(matchId)
      } else {
        next.add(matchId)
      }
      return next
    })
  }

  const getSelectedForDeer = (_deerId: string, group: PendingMatchGroup) => {
    return group.pending_matches
      .filter((m) => selectedMatches.has(m.id))
      .map((m) => m.id)
  }

  if (groups.length === 0) {
    return (
      <Card variant="elevated">
        <CardContent className="py-8 text-center text-cream-dark">
          No pending matches. Great job keeping up with match review!
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const isExpanded = expandedGroups.has(group.deer.id)
        const selectedInGroup = getSelectedForDeer(group.deer.id, group)

        return (
          <Card key={group.deer.id} variant="elevated">
            <CardHeader>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => toggleGroup(group.deer.id)}
                  className="flex items-center gap-2 hover:text-copper transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-5 w-5" />
                  ) : (
                    <ChevronRight className="h-5 w-5" />
                  )}
                  <CardTitle className="text-lg">{group.deer.name}</CardTitle>
                </button>
                <Badge variant="warning">{group.total_count} pending</Badge>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="space-y-4">
                {/* Batch actions */}
                {group.pending_matches.length > 1 && (
                  <div className="flex gap-2 pb-4 border-b border-slate/20">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => {
                        const matchIds = group.pending_matches.map((m) => m.id)
                        onBatchConfirm?.(matchIds)
                      }}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Accept All {group.total_count}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const matchIds = group.pending_matches.map((m) => m.id)
                        onBatchReject?.(matchIds)
                      }}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Reject All
                    </Button>
                    {selectedInGroup.length > 0 && (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onBatchConfirm?.(selectedInGroup)}
                        >
                          Confirm Selected ({selectedInGroup.length})
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onBatchReject?.(selectedInGroup)}
                        >
                          Reject Selected
                        </Button>
                      </>
                    )}
                  </div>
                )}

                {/* Match candidates */}
                <div className="space-y-3">
                  {group.pending_matches.map((match) => {
                    const isMatchExpanded = expandedMatches.has(match.id)
                    const isSelected = selectedMatches.has(match.id)

                    return (
                      <div
                        key={match.id}
                        className="border border-slate/20 rounded-lg overflow-hidden"
                      >
                        <div className="p-4 bg-slate/10 flex items-center gap-4">
                          {/* Selection checkbox */}
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectMatch(match.id, group.deer.id)}
                            className="h-4 w-4 rounded border-slate-600 text-copper focus:ring-copper"
                          />

                          {/* Thumbnail */}
                          <div className="relative w-20 h-20 rounded overflow-hidden bg-slate/30 flex-shrink-0">
                            {match.detection.thumbnail_url && (
                              <Image
                                src={match.detection.thumbnail_url}
                                alt="Detection"
                                fill
                                className="object-cover"
                              />
                            )}
                          </div>

                          {/* Match info */}
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  match.visual_confidence >= 85
                                    ? 'success'
                                    : match.visual_confidence >= 70
                                      ? 'secondary'
                                      : 'outline'
                                }
                              >
                                Visual: {Math.round(match.visual_confidence)}%
                              </Badge>
                              {match.antler_print_similarity !== null && (
                                <Badge
                                  variant={
                                    match.antler_print_similarity >= 0.85
                                      ? 'success'
                                      : match.antler_print_similarity >= 0.7
                                        ? 'secondary'
                                        : 'outline'
                                  }
                                >
                                  Print: {Math.round(match.antler_print_similarity * 100)}%
                                </Badge>
                              )}
                              {match.possible_broken_tine && (
                                <Badge variant="warning">Possible Broken Tine</Badge>
                              )}
                            </div>
                            <p className="text-sm text-cream-dark">
                              {match.detection.captured_at
                                ? new Date(match.detection.captured_at).toLocaleDateString()
                                : 'Unknown date'}
                            </p>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleMatch(match.id)}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              {isMatchExpanded ? 'Hide' : 'View'} Details
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => onConfirmMatch?.(match.id)}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => onRejectMatch?.(match.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Expanded details */}
                        {isMatchExpanded && (
                          <div className="p-4 space-y-4">
                            {/* Reasoning */}
                            {match.gemini_reasoning && (
                              <div className="text-sm">
                                <div className="font-medium text-cream mb-1">
                                  AI Reasoning:
                                </div>
                                <p className="text-cream-dark">{match.gemini_reasoning}</p>
                              </div>
                            )}

                            {/* Measurement comparison */}
                            {match.detection.antler_print &&
                              group.deer.antler_print && (
                                <MeasurementComparison
                                  detection={match.detection.antler_print}
                                  reference={group.deer.antler_print}
                                  {...(match.antler_print_similarity !== null && { similarity: match.antler_print_similarity })}
                                  {...(match.possible_broken_tine && { possibleBrokenTine: match.possible_broken_tine })}
                                />
                              )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}
