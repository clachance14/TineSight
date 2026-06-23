'use client'

import React, { Suspense, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { usePhotosInfinite } from '@/lib/hooks/use-photos'
import { useAreas } from '@/lib/hooks/use-areas'
import { useDeerCatalog } from '@/lib/hooks/use-deer'
import { PhotoGrid } from '@/components/photos/photo-grid'
import { PhotoQuickFilters } from '@/components/photos/photo-quick-filters'
import type { OtherAnimalType, PhotoFilters, PhotoSortField, PhotoSortDirection } from '@/lib/services/photos'

type QuickFilters = Omit<PhotoFilters, 'offset'>

// Newest-captured-first by default; the grid virtualizes rows and loads
// thumbnails only, so a 50-per-page window is safe (ADR 0003).
const DEFAULT_SORT_BY: PhotoSortField = 'captured_at'
const DEFAULT_SORT_DIR: PhotoSortDirection = 'desc'

// --- URL <-> filter serialization -------------------------------------------
// Filters live in the URL query string so a filtered view is refresh-safe,
// back-button-safe, and shareable (RLS keeps it owner-only — it restores the
// view, it is not a public share; that is the Showcase's job).

function parseFilters(sp: URLSearchParams): QuickFilters {
  const f: QuickFilters = { limit: 50, sortBy: DEFAULT_SORT_BY, sortDirection: DEFAULT_SORT_DIR }

  const sex = sp.get('sex')
  if (sex !== null && sex !== '') f.sex = sex

  const minScore = sp.get('minScore')
  if (minScore !== null && !Number.isNaN(Number(minScore))) f.minScore = parseInt(minScore, 10)

  const areaNames = sp.get('areaNames')
  if (areaNames !== null && areaNames !== '') f.areaNames = areaNames.split(',').filter(Boolean)

  const deerId = sp.get('deerId')
  if (deerId !== null && deerId !== '') f.deerId = deerId

  const dateFrom = sp.get('dateFrom')
  if (dateFrom !== null && dateFrom !== '') f.dateFrom = dateFrom

  const dateTo = sp.get('dateTo')
  if (dateTo !== null && dateTo !== '') f.dateTo = dateTo

  const otherAnimals = sp.get('otherAnimals')
  if (otherAnimals !== null && otherAnimals !== '') {
    f.otherAnimals = otherAnimals.split(',').filter(Boolean) as OtherAnimalType[]
  }

  const sortBy = sp.get('sortBy')
  if (sortBy === 'best_score' || sortBy === 'captured_at' || sortBy === 'imported_at') f.sortBy = sortBy

  const sortDirection = sp.get('sortDirection')
  if (sortDirection === 'asc' || sortDirection === 'desc') f.sortDirection = sortDirection

  return f
}

function toQueryString(f: QuickFilters): string {
  const p = new URLSearchParams()
  if (f.sex !== undefined) p.set('sex', f.sex)
  if (f.minScore !== undefined) p.set('minScore', String(f.minScore))
  if (f.areaNames?.length) p.set('areaNames', f.areaNames.join(','))
  if (f.deerId !== undefined) p.set('deerId', f.deerId)
  if (f.dateFrom !== undefined) p.set('dateFrom', f.dateFrom)
  if (f.dateTo !== undefined) p.set('dateTo', f.dateTo)
  if (f.otherAnimals?.length) p.set('otherAnimals', f.otherAnimals.join(','))

  // Persist sort only when non-default, to keep shared URLs tidy.
  const sortBy = f.sortBy ?? DEFAULT_SORT_BY
  const sortDirection = f.sortDirection ?? DEFAULT_SORT_DIR
  if (!(sortBy === DEFAULT_SORT_BY && sortDirection === DEFAULT_SORT_DIR)) {
    p.set('sortBy', sortBy)
    p.set('sortDirection', sortDirection)
  }
  return p.toString()
}

function PhotosContent(): React.JSX.Element {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Filters are derived from the URL (single source of truth) so refresh/back/
  // share all restore the same view. Re-derived per render; react-query hashes
  // the key structurally, so identity churn does not re-fetch.
  const spString = searchParams.toString()
  const filters = useMemo(() => parseFilters(new URLSearchParams(spString)), [spString])

  const setFilters = useCallback(
    (next: QuickFilters) => {
      const qs = toQueryString(next)
      router.replace(qs ? `/photos?${qs}` : '/photos', { scroll: false })
    },
    [router]
  )

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePhotosInfinite(filters)

  // Catalog-wide stats for the header summary (independent of the current filter).
  const { data: statsData } = useQuery({
    queryKey: ['photos', 'stats'],
    queryFn: async () => {
      const res = await fetch('/api/photos/stats')
      if (!res.ok) return null
      return res.json()
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
    <div className="flex flex-col h-full gap-4">
      <header>
        <p className="label-premium text-brass">Catalog</p>
        <h1 className="heading-display mt-1 text-3xl text-parchment md:text-4xl">Photos</h1>
        <p className="mt-1.5 text-sm text-weathered">
          <b className="font-semibold text-parchment-dark">{totalPhotos.toLocaleString()}</b> photos
          {withDeer > 0 && (
            <> · <b className="font-semibold text-parchment-dark">{withDeer.toLocaleString()}</b> with deer</>
          )}
          {areasCount > 0 && (
            <> · across <b className="font-semibold text-parchment-dark">{areasCount}</b> {areasCount === 1 ? 'area' : 'areas'}</>
          )}
        </p>
      </header>

      <PhotoQuickFilters
        filters={filters}
        onChange={setFilters}
        counts={{ all: totalPhotos }}
        trophyThreshold={trophyThreshold}
        deerList={deerList}
        areaList={areaList}
      />

      <PhotoGrid
        externalData={{
          photos,
          total,
          isLoading,
          hasNextPage: hasNextPage ?? false,
          isFetchingNextPage,
          fetchNextPage,
        }}
        onPhotoClick={(id) => {
          router.push(`/photos/${id}`)
        }}
      />
    </div>
  )
}

export default function PhotosPage() {
  return (
    <Suspense fallback={<div className="text-cream-dark">Loading...</div>}>
      <PhotosContent />
    </Suspense>
  )
}
