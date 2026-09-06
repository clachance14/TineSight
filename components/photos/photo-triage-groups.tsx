'use client'

import { type JSX, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useQuery } from '@tanstack/react-query'
import { photoFilterParams } from '@/lib/photos/filters'
import type { PhotoFilters } from '@/lib/services/photos'

type TriageView = NonNullable<PhotoFilters['triageView']>
export function PhotoTriageGroups({ filters, onChange }: { filters: PhotoFilters; onChange: (filters: PhotoFilters) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const scope = { ...filters }; delete scope.triageView
  const query = photoFilterParams(scope).toString()
  const { data, isError, isFetching, refetch } = useQuery({
    queryKey: ['photos', 'triage', query],
    queryFn: async ({ signal }): Promise<{ counts: Record<string, number> }> => {
      const response = await fetch(`/api/photos/triage?${query}`, { signal, cache: 'no-store' })
      if (!response.ok) throw new Error('Could not load photo groups')
      return response.json() as Promise<{ counts: Record<string, number> }>
    },
    staleTime: 30000, refetchInterval: 60000,
  })
  const active = filters.triageView ?? 'trophy'
  function choose(view: TriageView): void {
    const next = { ...filters, triageView: view }
    for (const key of ['sex', 'hasDeer', 'hasDetections', 'emptyOnly', 'otherAnimals', 'sizeClass'] as const) delete next[key]
    onChange(next)
    setOpen(false)
  }
  function control(view: TriageView, label: string): JSX.Element {
    return <button key={view} type="button" aria-pressed={active === view} onClick={() => choose(view)} className={`min-h-11 rounded-md border px-3 text-sm ${active === view ? 'border-brass bg-brass/10 text-parchment' : 'border-forest-light text-weathered'}`}>
      {label}{data !== undefined && <span className="ml-2 hidden font-mono sm:inline">{(data.counts[view] ?? 0).toLocaleString()}</span>}
    </button>
  }
  return (
    <section aria-label="Photo triage" className="flex shrink-0 flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-2">
        {control('trophy', 'Trophy bucks')}
        {control('all', 'All photos')}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" aria-label="Other photo groups" className={`min-h-11 rounded-md px-2 text-sm ${active !== 'trophy' && active !== 'all' ? 'text-brass' : 'text-weathered'}`}>
            {active === 'security' ? 'People & vehicles' : active === 'buck' ? 'Other bucks' : active === 'doe' ? 'Does & other deer' : active === 'empty' ? 'Empty photos' : active === 'unprocessed' ? 'Pending & failed' : active === 'other' ? 'Other activity' : 'Other groups'} ▾
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 space-y-2">
          <p className="text-sm text-weathered">Other photo groups</p>
          <div className="flex flex-wrap gap-2">
            {control('security', 'People & vehicles')}
            <button type="button" className="min-h-11 rounded-md border border-forest-light px-3 text-sm text-weathered" onClick={() => {
              const next = { ...filters, triageView: 'all' as const, sex: 'buck' as const }
              delete next.hasDeer; delete next.hasDetections; delete next.emptyOnly; delete next.otherAnimals; delete next.sizeClass
              onChange(next); setOpen(false)
            }}>All bucks</button>
            {control('buck', 'Other bucks')}{control('doe', 'Does & other deer')}
            {control('other', 'Other activity')}{control('empty', 'Empty photos')}{control('unprocessed', 'Pending & failed')}
          </div>
        </PopoverContent>
      </Popover>
      {active === 'priority' && <p role="status" className="basis-full text-sm text-weathered">This legacy saved view includes multiple groups. Choose Trophy bucks or another group to replace it.</p>}
      {isError && <div role="status" className="flex flex-wrap items-center gap-2">
        <p>Group counts are unavailable. You can still browse each group.</p>
        <button type="button" disabled={isFetching} onClick={() => { void refetch() }} className="min-h-11 rounded border px-3 text-sm">
          {isFetching ? 'Retrying counts…' : 'Retry counts'}
        </button>
      </div>}
    </section>
  )
}
