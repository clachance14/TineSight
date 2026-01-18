'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Check, X } from 'lucide-react'
import { useDeer, useUpdateDeer } from '@/lib/hooks/use-deer'
import { useToast } from '@/lib/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SightingsGrid } from '@/components/deer/sightings-grid'
import { AntlerPrintCard } from '@/components/deer/antler-print-card'
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

  // Use initial data for header while sightings load
  const displayDeer = deer ?? initialDeer

  // Helper function to get CSS background style for cropped detection thumbnail
  const getReferenceImageStyle = (
    imageUrl: string,
    bbox: ReferenceBbox | null | undefined
  ): React.CSSProperties => {
    // If no valid bbox, show centered full image
    if (!bbox || bbox.x === null || bbox.y === null || bbox.width === null || bbox.height === null) {
      return {
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    }

    // YOLO normalized coordinates (0-10000 scale, center-based)
    const imageSize = 10000
    const centerXPct = (bbox.x / imageSize) * 100
    const centerYPct = (bbox.y / imageSize) * 100
    const widthPct = (bbox.width / imageSize) * 100
    const heightPct = (bbox.height / imageSize) * 100

    // Add 20% padding around the detection
    const padding = 0.20
    const regionWidthPct = widthPct * (1 + 2 * padding)
    const regionHeightPct = heightPct * (1 + 2 * padding)

    // Calculate background size to show the padded region
    // Use Math.min to ensure entire bbox fits (contain), not Math.max (cover/crop)
    const bgSizeX = (100 / regionWidthPct) * 100
    const bgSizeY = (100 / regionHeightPct) * 100
    const bgSize = Math.min(bgSizeX, bgSizeY, 2000)

    return {
      backgroundImage: `url(${imageUrl})`,
      backgroundSize: `${bgSize}%`,
      backgroundPosition: `${centerXPct}% ${centerYPct}%`,
    }
  }
  const sightings = deer?.sightings ?? []
  const pagination = deer?.pagination ?? { page: 1, pageSize, total: 0, totalPages: 0 }

  // Initialize edit values when entering edit mode
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
        data: { name: editName.trim(), notes: editNotes.trim() || null }
      })
      toast({
        title: 'Profile Updated',
        description: 'Deer profile has been saved.'
      })
      setIsEditing(false)
      setNameError(null)
      router.refresh() // Re-run server components to update header
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save',
        variant: 'destructive'
      })
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Main content - 2/3 width */}
      <div className="lg:col-span-2 space-y-6">
        {/* Reference image */}
        <Card>
          <CardContent className="p-0">
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate">
              {displayDeer.reference_image_url ? (
                <div
                  className="h-full w-full"
                  style={getReferenceImageStyle(
                    displayDeer.reference_image_url,
                    initialDeer.reference_bbox
                  )}
                  role="img"
                  aria-label={`${displayDeer.name} reference image`}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <div className="text-center">
                    <span className="text-6xl">🦌</span>
                    <p className="mt-4 text-sm text-cream-dark">No reference image</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Add notes about this deer..."
                className="min-h-[120px] bg-slate border-cream/20 text-cream placeholder:text-cream-dark/50"
              />
            ) : (
              <>
                {displayDeer.notes ? (
                  <p className="text-cream whitespace-pre-wrap">{displayDeer.notes}</p>
                ) : (
                  <p className="text-cream-dark text-sm italic">No notes yet</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sidebar - 1/3 width */}
      <div className="space-y-6">
        {/* Deer info */}
        <Card>
          <CardHeader>
            {isEditing ? (
              <div className="space-y-2">
                <div className="space-y-1">
                  <Input
                    value={editName}
                    onChange={(e) => {
                      setEditName(e.target.value)
                      setNameError(null)
                    }}
                    placeholder="Deer name"
                    className="text-2xl font-semibold bg-slate border-cream/20 text-cream placeholder:text-cream-dark/50"
                  />
                  {nameError && (
                    <p className="text-sm text-red-400">{nameError}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleSave}
                    disabled={updateDeer.isPending}
                    className="bg-copper hover:bg-copper-light text-white"
                    size="sm"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                  <Button
                    onClick={cancelEditing}
                    disabled={updateDeer.isPending}
                    variant="outline"
                    className="border-cream/20 text-cream hover:bg-slate"
                    size="sm"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-2xl">{displayDeer.name}</CardTitle>
                <Button
                  onClick={startEditing}
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-cream-dark hover:text-cream hover:bg-slate"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-cream-dark">Sightings:</span>
                <Badge variant="secondary">
                  {displayDeer.sighting_count}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Antler Print Card */}
        <AntlerPrintCard fingerprint={initialDeer.antler_fingerprint as AntlerFingerprint | null} />

        {/* Sightings grid */}
        <Card>
          <CardHeader>
            <CardTitle>Sightings</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="aspect-square w-full rounded-lg" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  ))}
                </div>
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
      </div>
    </div>
  )
}
