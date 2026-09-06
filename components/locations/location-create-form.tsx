'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useCreateLocation } from '@/lib/hooks/use-locations'
import { ColorPicker } from './color-picker'
import { DEFAULT_LOCATION_COLOR } from '@/lib/constants/location-colors'
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
  onSuccess: (locationId: string) => void
  onCancel: () => void
}

export function LocationCreateForm({
  lat,
  lng,
  onSuccess,
  onCancel,
}: LocationCreateFormProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [selectedDirection, setSelectedDirection] = useState<
    number | undefined
  >(undefined)
  const [directionNotes, setDirectionNotes] = useState('')
  const [notes, setNotes] = useState('')
  const [color, setColor] = useState(DEFAULT_LOCATION_COLOR)
  const [error, setError] = useState<string | null>(null)

  const createLocation = useCreateLocation()

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)

    if (name.trim().length === 0) {
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
      if (directionNotes.trim().length > 0) {
        data.directionNotes = directionNotes.trim()
      }
      if (notes.trim().length > 0) {
        data.notes = notes.trim()
      }
      if (color.length > 0) {
        data.color = color
      }
      const result = await createLocation.mutateAsync(data)
      onSuccess(result.location.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create location')
    }
  }

  return (
    <div>
      <form
        onSubmit={(event) => {
          void handleSubmit(event)
        }}
        className="space-y-4"
      >
        {/* Location Name */}
        <div className="space-y-2">
          <Label htmlFor="location-name" className="text-cream">
            Name <span className="text-copper">*</span>
          </Label>
          <Input
            id="location-name"
            required
            maxLength={100}
            placeholder="e.g., North Pasture, Oak Ridge"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-12 bg-forest/30 border-forest-light text-parchment placeholder:text-weathered/60"
          />
        </div>

        {/* Coordinates (read-only) */}
        <div className="font-mono text-xs text-weathered">
          Coordinates: {lat.toFixed(6)}, {lng.toFixed(6)}
        </div>

        {/* Pin Color */}
        <div className="space-y-2">
          <Label className="text-cream">Pin Color</Label>
          <ColorPicker
            value={color}
            onChange={setColor}
            disabled={createLocation.isPending}
          />
        </div>

        {/* Compass Direction */}
        <div className="space-y-2">
          <Label className="text-cream">Camera Direction (Optional)</Label>
          <div className="grid grid-cols-4 gap-2">
            {COMPASS_DIRECTIONS.map(({ label, degrees }) => (
              <Button
                key={degrees}
                type="button"
                variant={selectedDirection === degrees ? 'default' : 'outline'}
                size="sm"
                aria-pressed={selectedDirection === degrees}
                onClick={() =>
                  setSelectedDirection(
                    selectedDirection === degrees ? undefined : degrees,
                  )
                }
                className={
                  selectedDirection === degrees
                    ? 'min-h-11 border-brass bg-brass/10 text-brass-light hover:bg-brass/15'
                    : 'min-h-11 bg-slate hover:bg-slate-600 border-slate-600 text-cream'
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
        {error !== null && (
          <div role="alert" className="text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="min-h-12 flex-1 bg-slate hover:bg-slate-600 border-slate-600 text-cream"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={createLocation.isPending || name.trim().length === 0}
            className="min-h-12 flex-1 border-brass bg-brass/10 text-brass-light hover:bg-brass/15 disabled:opacity-50"
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
