'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X, ArrowLeft } from 'lucide-react'
import { useDeer, useUpdateDeer } from '@/lib/hooks/use-deer'
import { useToast } from '@/lib/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SightingsGrid } from '@/components/deer/sightings-grid'
import { DeerPendingSightings } from '@/components/deer/deer-pending-sightings'
import { DeerFindSightings } from '@/components/deer/deer-find-sightings'
import { DeerHeroImage } from '@/components/deer/deer-hero-image'
import { AntlerPrintCard, getScoreClassDisplay } from '@/components/deer/antler-print-card'
import { AntlerFingerprint } from '@/types/fingerprint'

interface ReferenceBbox {
  x: number | null
  y: number | null
  width: number | null
  height: number | null
}

interface DeerDetailClientProps {
  deerId: string
  initialDeer: {
    id: string
    name: string
    notes: string | null
    sighting_count: number
    reference_image_url?: string | null
    reference_bbox?: ReferenceBbox | null
    antler_fingerprint?: unknown
  }
}

/**
 * Build the short identity-signature chips shown on the hero — the at-a-glance
 * way to tell this buck apart. Detail lives in the Antler Print section.
 */
function buildIdentityChips(fp: AntlerFingerprint | null): string[] {
  if (!fp) return []
  const { measurements, features } = fp
  const chips: string[] = []

  if (measurements.total_points) {
    chips.push(`${measurements.total_points} points`)
  }
  if (measurements.inside_spread !== null) {
    chips.push(`${measurements.inside_spread.toFixed(1)}" spread`)
  }
  if (features.has_drop_tine) {
    const loc = features.drop_tine_location === 'both' ? 'both' : features.drop_tine_location
    chips.push(`Drop tine${loc ? ` · ${loc}` : ''}`)
  }
  if (features.has_split_g2) {
    chips.push('Split G2')
  }
  if (features.has_kickers && features.kicker_count > 0) {
    chips.push(`${features.kicker_count} kicker${features.kicker_count > 1 ? 's' : ''}`)
  }
  return chips
}

export function DeerDetailClient({ deerId, initialDeer }: DeerDetailClientProps): React.JSX.Element {
  const [page, setPage] = useState(1)
  const pageSize = 12

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)

  const router = useRouter()
  const { data: deer, isLoading } = useDeer(deerId, { page, pageSize })
  const updateDeer = useUpdateDeer()
  const { toast } = useToast()

  // Use initial data for the hero while sightings load
  const displayDeer = deer ?? initialDeer
  const fingerprint = (initialDeer.antler_fingerprint as AntlerFingerprint | null) ?? null
  const chips = buildIdentityChips(fingerprint)
  const scoreClass = fingerprint ? getScoreClassDisplay(fingerprint.scores.score_class) : null

  const sightings = deer?.sightings ?? []
  const pagination = deer?.pagination ?? { page: 1, pageSize, total: 0, totalPages: 0 }

  const startEditing = () => {
    setEditName(displayDeer.name)
    setEditNotes(displayDeer.notes || '')
    setNameError(null)
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setNameError(null)
  }

  const handleSave = async () => {
    if (!editName.trim()) {
      setNameError('Name is required')
      return
    }

    try {
      await updateDeer.mutateAsync({
        id: deerId,
        data: { name: editName.trim(), notes: editNotes.trim() || null },
      })
      toast({
        title: 'Profile Updated',
        description: 'Deer profile has been saved.',
      })
      setIsEditing(false)
      setNameError(null)
      router.refresh()
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-8">
      {/* ============================ HERO / DOSSIER ========================= */}
      <section className="brass-corners relative overflow-hidden rounded-2xl border border-cream/10 bg-slate">
        {/* Image layer (medium variant only — never full-res, ADR 0003).
            DeerHeroImage frames the detection bbox dead-center. */}
        {displayDeer.reference_image_url ? (
          <DeerHeroImage
            imageUrl={displayDeer.reference_image_url}
            bbox={initialDeer.reference_bbox ?? null}
            alt={`${displayDeer.name} reference image`}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-slate">
            <span className="text-7xl opacity-40">🦌</span>
          </div>
        )}

        {/* Legibility gradient: dark at the bottom where the identity block sits */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-deep via-slate-deep/70 to-slate-deep/10" />

        {/* Content */}
        <div className="relative flex min-h-[400px] flex-col justify-between p-5 sm:min-h-[420px] sm:p-7">
          {/* Top bar: back + edit */}
          <div className="flex items-start justify-between">
            <Button
              variant="outline"
              size="icon"
              asChild
              className="border-cream/20 bg-slate-deep/60 backdrop-blur hover:bg-slate-deep"
            >
              <Link href="/deer" aria-label="Back to catalog">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            {!isEditing && (
              <Button
                onClick={startEditing}
                variant="outline"
                size="icon"
                aria-label="Edit profile"
                className="border-cream/20 bg-slate-deep/60 backdrop-blur hover:bg-slate-deep"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Identity block (bottom-anchored) */}
          <div className="space-y-3">
            {isEditing ? (
              <div className="max-w-md space-y-2">
                <Input
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value)
                    setNameError(null)
                  }}
                  placeholder="Deer name"
                  aria-label="Deer name"
                  className="heading-display border-cream/20 bg-slate-deep/70 text-2xl text-cream backdrop-blur placeholder:text-cream-dark/50"
                />
                {nameError && <p className="text-sm text-red-400">{nameError}</p>}
                <div className="flex gap-2">
                  <Button
                    onClick={handleSave}
                    disabled={updateDeer.isPending}
                    className="bg-copper text-white hover:bg-copper-light"
                    size="sm"
                  >
                    <Check className="mr-1 h-4 w-4" />
                    Save
                  </Button>
                  <Button
                    onClick={cancelEditing}
                    disabled={updateDeer.isPending}
                    variant="outline"
                    className="border-cream/20 bg-slate-deep/60 text-cream backdrop-blur hover:bg-slate-deep"
                    size="sm"
                  >
                    <X className="mr-1 h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="label-premium text-copper">Buck Profile</p>
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                  <h1 className="heading-display text-3xl text-cream sm:text-5xl">{displayDeer.name}</h1>
                  {fingerprint && scoreClass && (
                    <div className="flex items-end gap-3">
                      <div className="text-right">
                        <p className="font-display text-4xl leading-none text-cream tabular-nums sm:text-5xl">
                          {fingerprint.scores.gross_score.toFixed(1)}
                          <span className="text-2xl text-cream-dark">&Prime;</span>
                        </p>
                        <p className="label-premium mt-1 text-cream-dark">Gross B&amp;C</p>
                      </div>
                      <Badge variant={scoreClass.variant} className="glow-brass">
                        {scoreClass.label}
                      </Badge>
                    </div>
                  )}
                </div>
                {chips.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-cream/10 bg-slate-deep/70 px-3 py-1 text-xs text-cream backdrop-blur"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-sm text-cream-dark">Sightings</span>
                  <Badge variant="secondary">{displayDeer.sighting_count}</Badge>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ================= DATA: side-by-side on desktop, stacked on mobile ==
          Antler Print is a tall, narrow stat panel → right column.
          Sightings (a gallery) wants width → wide left column.
          On mobile, order puts the Antler Print data ahead of the gallery. */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Antler Print — right column on desktop */}
        <div className="space-y-6 lg:order-2 lg:col-span-1">
          <AntlerPrintCard fingerprint={fingerprint} />
        </div>

        {/* Sightings + Notes — wide left column on desktop */}
        <div className="space-y-6 lg:order-1 lg:col-span-2">
          {/* PENDING RE-ID (proposed sightings awaiting confirmation) */}
          <DeerPendingSightings deerId={deerId} deerName={displayDeer.name} />

          {/* MANUAL RE-ID — operator-driven ranked search (ADR 0005) */}
          <DeerFindSightings
            deerId={deerId}
            deerName={displayDeer.name}
            hasFingerprint={fingerprint != null}
          />

          {/* SIGHTINGS */}
          <Card>
            <CardHeader>
              <CardTitle>Sightings</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="aspect-square w-full rounded-lg" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  ))}
                </div>
              ) : (
                <SightingsGrid
                  sightings={sightings}
                  deerId={deerId}
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  onPageChange={setPage}
                />
              )}
            </CardContent>
          </Card>

          {/* NOTES */}
          <Card className="bg-slate/50">
            <CardHeader>
              <CardTitle className="text-base text-cream-dark">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Add notes about this deer..."
                  className="min-h-[120px] border-cream/20 bg-slate text-cream placeholder:text-cream-dark/50"
                />
              ) : displayDeer.notes ? (
                <p className="whitespace-pre-wrap text-cream">{displayDeer.notes}</p>
              ) : (
                <p className="text-sm italic text-cream-dark">
                  No notes yet — tap the pencil to add field observations.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
