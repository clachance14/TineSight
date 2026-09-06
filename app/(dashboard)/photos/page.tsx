'use client'

import React, { Suspense, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { usePhotosInfinite } from '@/lib/hooks/use-photos'
import { useActiveProcessingBatch } from '@/lib/hooks/use-active-batch'
import { useUploadStore } from '@/lib/stores/upload'
import { ProcessingStatusBar } from '@/components/photos/processing-status-bar'
import { useAreas } from '@/lib/hooks/use-areas'
import { useDeerCatalog } from '@/lib/hooks/use-deer'
import { PhotoGrid } from '@/components/photos/photo-grid'
import { PhotoTriageGroups } from '@/components/photos/photo-triage-groups'
import { PhotoTriageToolbar } from '@/components/photos/photo-triage-toolbar'
import { PhotoSavedViews } from '@/components/photos/photo-saved-views'
import { PhotoQuickFilters } from '@/components/photos/photo-quick-filters'
import type { PhotoFilters } from '@/lib/services/photos'
import { relativeDateRange } from '@/lib/photos/date-range'
import { parsePhotoFilters, photoFilterParams } from '@/lib/photos/filters'

type QuickFilters = Omit<PhotoFilters, 'offset'>

function PhotosContent(): React.JSX.Element {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Filters are derived from the URL (single source of truth) so refresh/back/
  // share all restore the same view. Re-derived per render; react-query hashes
  // the key structurally, so identity churn does not re-fetch.
  const spString = searchParams.toString()
  const parsed = useMemo(() => {
    try {
      const params = new URLSearchParams(spString)
      const filters = parsePhotoFilters(params)
      if (filters.datePreset !== undefined && filters.datePreset !== 'custom') Object.assign(filters, relativeDateRange(filters.datePreset))
      // Fresh visits surface trophy bucks; an explicit filter/deep link
      // keeps its requested scope. All photos remains one tap away.
      if (!params.has('triageView')) filters.triageView = spString === '' ? 'trophy' : 'all'
      if ((filters.triageView === 'trophy' || filters.triageView === 'priority') && !params.has('sortBy')) filters.sortBy = 'best_score'
      return { filters: { ...filters, limit: 50 }, error: null }
    }
    catch (error) { return { filters: { limit: 50 } as QuickFilters, error: error instanceof Error ? error.message : 'Invalid filters' } }
  }, [spString])
  const filters = parsed.filters
  const { batchId: activeSessionId, isProcessing, isLoading: isUploadStatusLoading } = useActiveProcessingBatch()
  const isTransferring = useUploadStore(state => state.isPreparing || state.isUploading)
  const uploadedCount = useUploadStore(state => state.completedCount)
  const uploadTotal = useUploadStore(state => state.totalCount)
  const viewingActiveUpload = activeSessionId !== null && filters.uploadSessionId === activeSessionId

  const setFilters = useCallback(
    (next: QuickFilters) => {
      const qs = photoFilterParams(next).toString()
      router.replace(Boolean(qs) ? `/photos?${qs}` : '/photos', { scroll: false })
    },
    [router]
  )

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    error,
    refetch,
  } = usePhotosInfinite(filters, { enabled: !Boolean(parsed.error), uploadActive: viewingActiveUpload && isTransferring })

  // Catalog-wide stats for the header summary (independent of the current filter).
  const { data: statsData } = useQuery({
    queryKey: ['photos', 'stats'],
    queryFn: async (): Promise<{ total_photos: number; photos_with_deer: number; trophy_threshold: number } | null> => {
      const res = await fetch('/api/photos/stats')
      if (!res.ok) return null
      return await res.json() as { total_photos: number; photos_with_deer: number; trophy_threshold: number }
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: areasData } = useAreas()
  const { data: deerData } = useDeerCatalog()

  // Flatten pages
  const photos = data?.pages?.flatMap(p => p.photos) ?? []
  const total = data?.pages?.[0]?.total ?? 0

  const totalPhotos = statsData?.total_photos ?? total
  // photos_with_deer is photo-level (<= total). We intentionally do NOT surface
  // buck_count / size_class trophy_count here: both are detection-level counts
  // (so they exceed the photo total), and size_class='trophy' is the cheap glance,
  // not the authoritative Score-gated trophy (ADR 0004). Showing them misleads.
  const withDeer = statsData?.photos_with_deer ?? 0
  const areasCount = areasData?.areas?.length ?? 0
  const trophyThreshold: number = statsData?.trophy_threshold ?? 130

  const areaList = areasData?.areas ?? []
  const deerList = useMemo(
    () => (deerData?.deer ?? []).map((d: { id: string; name: string }) => ({ id: d.id, name: d.name })),
    [deerData?.deer]
  )

  return (
    <div className="flex min-h-full flex-col gap-2">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-forest-light/60 pb-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="heading-display text-3xl text-parchment">Photos</h1>
          <p className="hidden text-xs text-weathered sm:block">
            <span className="font-mono">{totalPhotos.toLocaleString()}</span> photos
            {withDeer > 0 && <> · <span className="font-mono">{withDeer.toLocaleString()}</span> with deer</>}
            {areasCount > 0 && <> · <span className="font-mono">{areasCount}</span> areas</>}
          </p>
        </div>
        <PhotoSavedViews filters={filters} onChange={setFilters} />
      </header>

      {viewingActiveUpload && <div className="space-y-2">
        {isTransferring && <p role="status" className="text-sm text-cream-dark">Uploading {uploadedCount.toLocaleString()} of {uploadTotal.toLocaleString()} photos. Photos will appear here as they upload.</p>}
        <ProcessingStatusBar />
      </div>}

      {Boolean(parsed.error) && (
        <div role="alert" className="text-cream-dark">
          <p>{parsed.error}</p>
          <button type="button" className="min-h-11 underline" onClick={() => setFilters({})}>Clear invalid filters</button>
        </div>
      )}

      <div data-photo-toolbar className="sticky top-[calc(-1*var(--workspace-gutter))] z-30 -mx-[var(--workspace-gutter)] space-y-2 border-b border-forest-light/60 bg-deep-forest px-[var(--workspace-gutter)] py-2 shadow-sm">
      <PhotoTriageGroups filters={filters} onChange={setFilters} />

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <PhotoQuickFilters
          grouped
          filters={filters}
          onChange={setFilters}
          counts={{ all: totalPhotos }}
          trophyThreshold={trophyThreshold}
          deerList={deerList}
          areaList={areaList}
        />

        <PhotoTriageToolbar filters={filters} visibleIds={photos.map(photo => photo.id)} total={total} />
      </div>
      </div>

      <PhotoGrid
        filters={filters}
        waitingForUpload={viewingActiveUpload && (isTransferring || isProcessing || isUploadStatusLoading)}
        pendingPhotoCount={uploadTotal > 0 ? uploadTotal : 12}
        externalData={{
          photos,
          total,
          isLoading,
          error,
          retry: () => { void refetch() },
          hasNextPage: hasNextPage ?? false,
          isFetchingNextPage,
          fetchNextPage: () => { void fetchNextPage() },
        }}
        onPhotoClick={(id) => {
          const query = photoFilterParams(filters).toString()
          router.push(`/photos/${id}${Boolean(query) ? `?${query}` : ''}`)
        }}
      />
    </div>
  )
}

export default function PhotosPage(): React.JSX.Element {
  return (
    <Suspense fallback={<div className="text-cream-dark">Loading...</div>}>
      <PhotosContent />
    </Suspense>
  )
}
