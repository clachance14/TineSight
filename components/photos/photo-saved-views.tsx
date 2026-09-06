'use client'

import { useState, type JSX } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useFilterPresets, useCreateFilterPreset, useDeleteFilterPreset } from '@/lib/hooks/use-filter-presets'
import { parsePhotoFilters, photoFilterParams } from '@/lib/photos/filters'
import type { PhotoFilters } from '@/lib/services/photos'

export function PhotoSavedViews({ filters, onChange }: { filters: PhotoFilters; onChange: (filters: PhotoFilters) => void }): JSX.Element {
  const { data } = useFilterPresets()
  const create = useCreateFilterPreset()
  const remove = useDeleteFilterPreset()
  const [name, setName] = useState('')
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function save(): Promise<void> {
    if (name.trim() === '') return
    setError(null)
    try {
      const savedFilters = parsePhotoFilters(photoFilterParams(filters))
      if (savedFilters.datePreset !== undefined && savedFilters.datePreset !== 'custom') {
        delete savedFilters.dateFrom; delete savedFilters.dateTo
      }
      await create.mutateAsync({ name: name.trim(), filters: savedFilters as Record<string, unknown> })
      setName(''); setOpen(false)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save view.') }
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button variant="outline" className="min-h-11">Saved views</Button></PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <p className="font-fraunces text-parchment">Saved views</p>
        {(data?.presets ?? []).map(preset => (
          <div key={preset.id} className="flex items-center gap-2">
            <Button variant="ghost" className="min-h-11 flex-1 justify-start overflow-hidden" onClick={() => {
              try { onChange(parsePhotoFilters(photoFilterParams(preset.filters as PhotoFilters))); setOpen(false) }
              catch { setError('This saved view contains an invalid filter. Save a new view with your current filters.') }
            }}>{preset.name}</Button>
            <Button variant="ghost" className="min-h-11" disabled={remove.isPending} aria-label={`Delete saved view ${preset.name}`} onClick={() => {
              void remove.mutateAsync(preset.id).catch(() => setError('Could not delete saved view.'))
            }}>Delete</Button>
          </div>
        ))}
        {data?.presets.length === 0 && <p className="text-sm text-weathered">Save a camera, upload, or review filter for next time.</p>}
        <form className="space-y-2 border-t border-forest-light pt-3" onSubmit={event => { event.preventDefault(); void save() }}>
          <label htmlFor="photo-view-name" className="text-xs text-weathered">Name this view</label>
          <Input id="photo-view-name" value={name} maxLength={100} onChange={event => setName(event.target.value)} placeholder="North cameras · Bucks" />
          <Button type="submit" className="min-h-11 w-full" disabled={create.isPending || name.trim() === ''}>Save current view</Button>
        </form>
        {error !== null && <p role="alert" className="text-sm text-red-400">{error}</p>}
      </PopoverContent>
    </Popover>
  )
}
