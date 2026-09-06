'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useUpdateLocation } from '@/lib/hooks/use-locations'
import { ColorPicker } from './color-picker'
import { DEFAULT_LOCATION_COLOR } from '@/lib/constants/location-colors'
import type { LocationWithPhotoCount } from '@/lib/services/locations'
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

interface LocationEditFormProps {
  location: LocationWithPhotoCount
  onClose: () => void
  onSuccess: (() => void) | undefined
}

function LocationEditForm({
  location,
  onClose,
  onSuccess,
}: LocationEditFormProps): React.ReactElement {
  const [name, setName] = useState(location.name)
  const [selectedDirection, setSelectedDirection] = useState<
    number | undefined
  >(location.direction_compass ?? undefined)
  const [directionNotes, setDirectionNotes] = useState(
    location.direction_notes ?? '',
  )
  const [notes, setNotes] = useState(location.notes ?? '')
  const [color, setColor] = useState(location.color ?? DEFAULT_LOCATION_COLOR)
  const [error, setError] = useState<string | null>(null)

  const updateLocation = useUpdateLocation()

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    setError(null)

    if (name.trim().length === 0) {
      setError('Name is required')
      return
    }

    void updateLocation
      .mutateAsync({
        locationId: location.id,
        data: {
          name: name.trim(),
          directionCompass: selectedDirection ?? null,
          directionNotes:
            directionNotes.trim().length > 0 ? directionNotes.trim() : null,
          notes: notes.trim().length > 0 ? notes.trim() : null,
          color: color,
        },
      })
      .then(() => {
        onClose()
        onSuccess?.()
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : 'Failed to update location',
        )
      })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Location Name */}
      <div className="space-y-2">
        <Label htmlFor="edit-location-name" className="text-cream">
          Name <span className="text-copper">*</span>
        </Label>
        <Input
          id="edit-location-name"
          placeholder="e.g., North Pasture, Oak Ridge"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-12 bg-forest/30 border-forest-light text-parchment placeholder:text-weathered/60"
        />
      </div>

      {/* Coordinates (read-only) */}
      <div className="font-mono text-xs text-weathered">
        Coordinates: {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
      </div>

      {/* Pin Color */}
      <div className="space-y-2">
        <Label className="text-cream">Pin Color</Label>
        <ColorPicker
          value={color}
          onChange={setColor}
          disabled={updateLocation.isPending}
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
        <Label htmlFor="edit-direction-notes" className="text-cream">
          Direction Notes (Optional)
        </Label>
        <Textarea
          id="edit-direction-notes"
          placeholder="e.g., Facing the water hole"
          value={directionNotes}
          onChange={(e) => setDirectionNotes(e.target.value)}
          className="bg-slate border-slate-600 text-cream placeholder:text-cream-dark/50 min-h-16 resize-none"
        />
      </div>

      {/* General Notes */}
      <div className="space-y-2">
        <Label htmlFor="edit-notes" className="text-cream">
          Notes (Optional)
        </Label>
        <Textarea
          id="edit-notes"
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
          onClick={onClose}
          disabled={updateLocation.isPending}
          className="min-h-12 flex-1 bg-slate hover:bg-slate-600 border-slate-600 text-cream"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={updateLocation.isPending || name.trim().length === 0}
          className="min-h-12 flex-1 border-brass bg-brass/10 text-brass-light hover:bg-brass/15 disabled:opacity-50"
        >
          {updateLocation.isPending ? (
            <>
              <Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Changes'
          )}
        </Button>
      </div>
    </form>
  )
}

interface LocationEditDialogProps {
  location: LocationWithPhotoCount
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function LocationEditDialog({
  location,
  open,
  onOpenChange,
  onSuccess,
}: LocationEditDialogProps): React.ReactElement {
  const handleClose = (): void => {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md bg-slate-deep border-slate-600">
        <DialogHeader>
          <DialogTitle className="pr-9 font-display text-2xl text-parchment">
            Edit location
          </DialogTitle>
          <DialogDescription>
            Update the name, camera direction, and field notes for this place.
          </DialogDescription>
        </DialogHeader>
        {/* Key forces remount when location changes, resetting form state */}
        <LocationEditForm
          key={location.id}
          location={location}
          onClose={handleClose}
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  )
}
