'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useCreateLocation } from '@/lib/hooks/use-locations'
import { Loader2Icon } from 'lucide-react'

const COMPASS_DIRECTIONS = [
  { label: 'N', degrees: 0 },
  { label: 'NE', degrees: 45 },
  { label: 'E', degrees: 90 },
  { label: 'SE', degrees: 135 },
  { label: 'S', degrees: 180 },
  { label: 'SW', degrees: 225 },
  { label: 'W', degrees: 270 },
  { label: 'NW', degrees: 315 },
]

interface LocationCreateFormProps {
  lat: number
  lng: number
  onSuccess: () => void
  onCancel: () => void
}

export function LocationCreateForm({
  lat,
  lng,
  onSuccess,
  onCancel,
}: LocationCreateFormProps) {
  const [name, setName] = useState('')
  const [selectedDirection, setSelectedDirection] = useState<number | undefined>(undefined)
  const [directionNotes, setDirectionNotes] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const createLocation = useCreateLocation()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Name is required')
      return
    }

    try {
      const data: Parameters<typeof createLocation.mutateAsync>[0] = {
        name: name.trim(),
        lat,
        lng,
      }
      if (selectedDirection !== undefined) {
        data.directionCompass = selectedDirection
      }
      if (directionNotes.trim()) {
        data.directionNotes = directionNotes.trim()
      }
      if (notes.trim()) {
        data.notes = notes.trim()
      }
      await createLocation.mutateAsync(data)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create location')
    }
  }

  return (
    <div className="bg-slate-deep/95 border border-slate-600 rounded-lg p-4 shadow-xl">
      <h3 className="text-lg font-semibold text-cream mb-4">New Location</h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Location Name */}
        <div className="space-y-2">
          <Label htmlFor="location-name" className="text-cream">
            Name <span className="text-copper">*</span>
          </Label>
          <Input
            id="location-name"
            placeholder="e.g., North Pasture, Oak Ridge"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-slate border-slate-600 text-cream placeholder:text-cream-dark/50"
          />
        </div>

        {/* Coordinates (read-only) */}
        <div className="text-xs text-cream-dark">
          Coordinates: {lat.toFixed(6)}, {lng.toFixed(6)}
        </div>

        {/* Compass Direction */}
        <div className="space-y-2">
          <Label className="text-cream">Camera Direction (Optional)</Label>
          <div className="grid grid-cols-4 gap-1">
            {COMPASS_DIRECTIONS.map(({ label, degrees }) => (
              <Button
                key={degrees}
                type="button"
                variant={selectedDirection === degrees ? 'default' : 'outline'}
                size="sm"
                onClick={() =>
                  setSelectedDirection(selectedDirection === degrees ? undefined : degrees)
                }
                className={
                  selectedDirection === degrees
                    ? 'bg-copper hover:bg-copper-light text-slate-deep'
                    : 'bg-slate hover:bg-slate-600 border-slate-600 text-cream'
                }
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        {/* Direction Notes */}
        <div className="space-y-2">
          <Label htmlFor="direction-notes" className="text-cream">
            Direction Notes (Optional)
          </Label>
          <Textarea
            id="direction-notes"
            placeholder="e.g., Facing the water hole"
            value={directionNotes}
            onChange={(e) => setDirectionNotes(e.target.value)}
            className="bg-slate border-slate-600 text-cream placeholder:text-cream-dark/50 min-h-16 resize-none"
          />
        </div>

        {/* General Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes" className="text-cream">
            Notes (Optional)
          </Label>
          <Textarea
            id="notes"
            placeholder="e.g., Trail camera on old oak tree"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="bg-slate border-slate-600 text-cream placeholder:text-cream-dark/50 min-h-16 resize-none"
          />
        </div>

        {/* Error Message */}
        {error && (
          <div className="text-red-400 text-sm">{error}</div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="flex-1 bg-slate hover:bg-slate-600 border-slate-600 text-cream"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={createLocation.isPending || !name.trim()}
            className="flex-1 bg-copper hover:bg-copper-light text-slate-deep disabled:opacity-50"
          >
            {createLocation.isPending ? (
              <>
                <Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Location'
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
