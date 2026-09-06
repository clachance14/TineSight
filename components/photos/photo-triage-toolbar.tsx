'use client'

import { useEffect, useRef, useState, type JSX } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { ExportModal } from './export-modal'
import { usePhotoSelectionStore } from '@/lib/stores/photo-selection'
import { photoFilterParams } from '@/lib/photos/filters'
import type { PhotoFilters } from '@/lib/services/photos'

/** Selection always belongs to one filter scope; archive preserves originals and can be undone. */
export function PhotoTriageToolbar({ filters, visibleIds, total }: {
  filters: PhotoFilters
  visibleIds: string[]
  total: number
}): JSX.Element {
  const client = useQueryClient()
  const selected = usePhotoSelectionStore(state => state.selectedPhotoIds)
  const selecting = usePhotoSelectionStore(state => state.isSelectMode)
  const toggle = usePhotoSelectionStore(state => state.toggleSelectMode)
  const selectAll = usePhotoSelectionStore(state => state.selectAll)
  const exit = usePhotoSelectionStore(state => state.exitSelectMode)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [downloadIds, setDownloadIds] = useState<string[] | null>(null)
  const filterKey = photoFilterParams(filters).toString()
  const scope = useRef(filterKey)
  useEffect(() => {
    scope.current = filterKey
    exit()
    setMessage(null)
  }, [filterKey, exit])

  async function selectMatching(): Promise<void> {
    const requestedScope = filterKey
    setBusy(true); setMessage(null)
    try {
      const response = await fetch('/api/photos/ids', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filters }) })
      if (!response.ok) throw new Error('Could not select matching photos. Try again.')
      const data = await response.json() as { photoIds: string[] }
      if (scope.current === requestedScope) selectAll(data.photoIds)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not select photos.')
    } finally { setBusy(false) }
  }

  async function changeArchive(archived: boolean): Promise<void> {
    const ids = Array.from(selected)
    const requestedScope = filterKey
    setBusy(true); setMessage(null)
    let changed = 0
    try {
      // API size bound matches the service's 150-id PostgREST transport batches.
      for (let from = 0; from < ids.length; from += 150) {
        const response = await fetch('/api/photos/archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo_ids: ids.slice(from, from + 150), is_archived: archived }) })
        if (!response.ok) throw new Error('The remaining photos could not be updated. Try again.')
        const data = await response.json() as { archived_count: number }
        changed += data.archived_count
      }
      if (scope.current === requestedScope) {
        exit()
        setMessage(`${changed.toLocaleString()} photos ${archived ? 'archived. You can restore them from the Archived photos view.' : 'restored.'}`)
      }
    } catch (error) {
      setMessage(`${changed.toLocaleString()} photos updated. ${error instanceof Error ? error.message : 'Try again.'}`)
    } finally {
      await client.invalidateQueries({ queryKey: ['photos'] })
      setBusy(false)
    }
  }

  async function markReview(reviewStatus: 'keep' | 'review_later' | 'unreviewed'): Promise<void> {
    const ids = Array.from(selected)
    const requestedScope = filterKey
    setBusy(true); setMessage(null)
    let changed = 0
    try {
      for (let from = 0; from < ids.length; from += 150) {
        const response = await fetch('/api/photos/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo_ids: ids.slice(from, from + 150), review_status: reviewStatus }) })
        if (!response.ok) throw new Error('Could not update the remaining photos. Try again.')
        const data = await response.json() as { updated_count: number }
        changed += data.updated_count
      }
      if (scope.current === requestedScope) {
        exit()
        setMessage(`${changed.toLocaleString()} photos ${reviewStatus === 'keep' ? 'marked Keep' : reviewStatus === 'review_later' ? 'saved for review later' : 'marked unreviewed'}.`)
      }
    } catch (failure) { setMessage(`${changed.toLocaleString()} updated. ${failure instanceof Error ? failure.message : 'Try again.'}`) }
    finally { await client.invalidateQueries({ queryKey: ['photos'] }); setBusy(false) }
  }

  return (
    <div className="flex max-h-[35dvh] flex-wrap items-center gap-2 overflow-y-auto text-sm text-weathered">
      <Button variant="outline" className="min-h-11" disabled={busy || total === 0} onClick={toggle}>{selecting ? 'Cancel selection' : 'Select photos'}</Button>
      {selecting && <>
        <span className="font-mono">{selected.size.toLocaleString()} selected</span>
        <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => selectAll(visibleIds)}>Select loaded</Button>
        <Button variant="ghost" className="min-h-11" disabled={busy} onClick={() => { void selectMatching() }}>Select all {total.toLocaleString()} matching</Button>
        <Button variant="outline" className="min-h-11" disabled={busy || selected.size === 0} onClick={() => setDownloadIds(Array.from(selected))}><Download className="mr-2 h-4 w-4" aria-hidden="true" />Download selected</Button>
        <Button variant="outline" className="min-h-11" disabled={busy || selected.size === 0} onClick={() => { void markReview('keep') }}>Keep selected</Button>
        <Button variant="outline" className="min-h-11" disabled={busy || selected.size === 0} onClick={() => { void markReview('review_later') }}>Review later</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" className="min-h-11" disabled={busy || selected.size === 0}>More actions</Button></DropdownMenuTrigger>
          <DropdownMenuContent><DropdownMenuItem className="min-h-11" onSelect={() => { void markReview('unreviewed') }}>Mark unreviewed</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
        <Button className="min-h-11" disabled={busy || selected.size === 0} onClick={() => { void changeArchive(filters.isArchived !== true) }}>{busy ? 'Working…' : filters.isArchived === true ? 'Restore selected' : 'Archive selected'}</Button>
        {filters.includeArchived === true && <Button variant="outline" className="min-h-11" disabled={busy || selected.size === 0} onClick={() => { void changeArchive(false) }}>Restore selected</Button>}
      </>}
      {message !== null && <p role="status" className="w-full">{message}</p>}
      {downloadIds !== null && <ExportModal isOpen photoIds={downloadIds} photoCount={downloadIds.length} onClose={() => setDownloadIds(null)} />}
    </div>
  )
}
