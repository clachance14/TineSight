'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, X, Loader2, Sparkles } from 'lucide-react'
import { usePendingMatchesForDeer, useConfirmMatch, useRejectMatch } from '@/lib/hooks/use-matches'

/**
 * Pending re-ID review for one Buck (ADR 0005). Shows the AI's proposed Sightings
 * — "is this <name>?" — so the operator can confirm (adds the Sighting) or reject.
 * Renders nothing when there are no pending suggestions.
 */
export function DeerPendingSightings({ deerId, deerName }: { deerId: string; deerName: string }): React.JSX.Element | null {
  const { data } = usePendingMatchesForDeer(deerId)
  const confirm = useConfirmMatch()
  const reject = useRejectMatch()

  const matches = data?.matches ?? []
  if (matches.length === 0) return null

  const busyId = confirm.isPending
    ? (confirm.variables as string | undefined)
    : reject.isPending
      ? (reject.variables as string | undefined)
      : undefined

  return (
    <Card className="border-copper/45 bg-slate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-cream">
          <Sparkles className="h-4 w-4 text-copper" />
          {matches.length} possible sighting{matches.length === 1 ? '' : 's'} of {deerName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {matches.map((m) => {
            const busy = busyId === m.id
            const confidence = m.gemini_confidence != null
              ? `${Math.round(m.gemini_confidence)}% visual match`
              : 'Strong fingerprint match'
            return (
              <li key={m.id} className="flex items-center gap-3 rounded-lg border border-cream/10 bg-slate-deep/60 p-2.5">
                <div className="relative h-16 w-16 flex-none overflow-hidden rounded-md bg-slate-light/40">
                  {m.detection.crop_url != null && m.detection.crop_url !== '' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.detection.crop_url} alt="Proposed sighting" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-cream-dark/50">?</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs uppercase tracking-wide text-brass-light">{confidence}</p>
                  <p className="mt-0.5 truncate text-xs text-cream-dark">
                    {m.detection.antler_points != null ? `${m.detection.antler_points} pts · ` : ''}
                    {m.detection.age_class ?? 'unknown age'}
                  </p>
                </div>
                <div className="flex flex-none gap-1.5">
                  <Button
                    size="sm"
                    className="gap-1"
                    disabled={busy}
                    onClick={() => confirm.mutate(m.id)}
                    aria-label="Confirm this sighting"
                  >
                    {busy && confirm.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 text-cream-dark hover:text-cream"
                    disabled={busy}
                    onClick={() => reject.mutate(m.id)}
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
      </CardContent>
    </Card>
  )
}
