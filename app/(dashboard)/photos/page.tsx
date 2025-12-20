'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { PhotoGrid } from '@/components/photos/photo-grid'
import { PhotoFilters, type PhotoFilters as PhotoFiltersType } from '@/components/photos/photo-filters'
import { PhotoFilterDrawer } from '@/components/photos/photo-filter-drawer'
import { usePhotosInfinite } from '@/lib/hooks/use-photos'
import { useDeerCatalog } from '@/lib/hooks/use-deer'
import type { PhotoFilters as ServicePhotoFilters } from '@/lib/services/photos'

function PhotosContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Initialize filters from URL params
  const getInitialFilters = (): PhotoFiltersType => {
    const status = searchParams.get('status') as PhotoFiltersType['status'] | null
    const hasDeerParam = searchParams.get('hasDeer')
    const hasDetectionsParam = searchParams.get('hasDetections')
    const qualityStatus = searchParams.get('qualityStatus') as PhotoFiltersType['qualityStatus'] | null
    const minConfidenceParam = searchParams.get('minConfidence')
    const sex = searchParams.get('sex') as PhotoFiltersType['sex'] | null
    const minPointsParam = searchParams.get('minPoints')
    const maxPointsParam = searchParams.get('maxPoints')
    const dateFromParam = searchParams.get('dateFrom')
    const dateToParam = searchParams.get('dateTo')
    const datePreset = searchParams.get('datePreset') as PhotoFiltersType['datePreset'] | null
    const sizeClass = searchParams.get('sizeClass') as PhotoFiltersType['sizeClass'] | null
    const cameraIdParam = searchParams.get('cameraId')
    const deerIdParam = searchParams.get('deerId')

    return {
      status: status || 'all',
      hasDeer: hasDeerParam === null ? null : hasDeerParam === 'true',
      hasDetections: hasDetectionsParam === 'true' ? true : hasDetectionsParam === 'false' ? false : null,
      qualityStatus: qualityStatus || 'all',
      sex: sex || 'all',
      sizeClass: sizeClass || 'all',
      ...(minConfidenceParam ? { minConfidence: parseInt(minConfidenceParam, 10) } : {}),
      ...(minPointsParam ? { minPoints: parseInt(minPointsParam, 10) } : {}),
      ...(maxPointsParam ? { maxPoints: parseInt(maxPointsParam, 10) } : {}),
      ...(dateFromParam ? { dateFrom: dateFromParam } : {}),
      ...(dateToParam ? { dateTo: dateToParam } : {}),
      ...(datePreset ? { datePreset } : {}),
      ...(cameraIdParam ? { cameraId: cameraIdParam } : {}),
      ...(deerIdParam ? { deerId: deerIdParam } : {}),
    }
  }

  // Filter state
  const [filters, setFilters] = useState<PhotoFiltersType>(getInitialFilters)

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Fetch deer catalog for filter dropdown
  const { data: deerData } = useDeerCatalog()
  const deerList = deerData?.deer ?? []

  // Build filter query string from current filters
  const buildFilterQueryString = (currentFilters: PhotoFiltersType): string => {
    const params = new URLSearchParams()

    if (currentFilters.status && currentFilters.status !== 'all') params.set('status', currentFilters.status)
    if (currentFilters.hasDeer !== null && currentFilters.hasDeer !== undefined) params.set('hasDeer', String(currentFilters.hasDeer))
    if (currentFilters.hasDetections !== null && currentFilters.hasDetections !== undefined) params.set('hasDetections', String(currentFilters.hasDetections))
    if (currentFilters.qualityStatus && currentFilters.qualityStatus !== 'all') params.set('qualityStatus', currentFilters.qualityStatus)
    if (currentFilters.minConfidence !== undefined) params.set('minConfidence', String(currentFilters.minConfidence))
    if (currentFilters.sex && currentFilters.sex !== 'all') params.set('sex', currentFilters.sex)
    if (currentFilters.minPoints !== undefined) params.set('minPoints', String(currentFilters.minPoints))
    if (currentFilters.maxPoints !== undefined) params.set('maxPoints', String(currentFilters.maxPoints))
    if (currentFilters.dateFrom) params.set('dateFrom', currentFilters.dateFrom)
    if (currentFilters.dateTo) params.set('dateTo', currentFilters.dateTo)
    if (currentFilters.datePreset) params.set('datePreset', currentFilters.datePreset)
    if (currentFilters.sizeClass && currentFilters.sizeClass !== 'all') params.set('sizeClass', currentFilters.sizeClass)
    if (currentFilters.cameraId) params.set('cameraId', currentFilters.cameraId)
    if (currentFilters.deerId) params.set('deerId', currentFilters.deerId)

    return params.toString()
  }

  // Sync filters to URL params for shareability
  useEffect(() => {
    const queryString = buildFilterQueryString(filters)
    const newUrl = queryString ? `?${queryString}` : '/photos'
    router.replace(newUrl, { scroll: false })
  }, [filters, router])

  // Convert component filters to service filters
  const serviceFilters: ServicePhotoFilters = {
    ...(filters.status !== 'all' && filters.status !== undefined ? { status: filters.status } : {}),
    ...(filters.hasDeer !== null && filters.hasDeer !== undefined ? { hasDeer: filters.hasDeer } : {}),
    ...(filters.hasDetections !== null && filters.hasDetections !== undefined ? { hasDetections: filters.hasDetections } : {}),
    ...(filters.batchId !== undefined ? { batchId: filters.batchId } : {}),
    ...(filters.qualityStatus !== 'all' && filters.qualityStatus !== undefined ? { qualityStatus: filters.qualityStatus } : {}),
    ...(filters.minConfidence !== undefined ? { minConfidence: filters.minConfidence } : {}),
    ...(filters.sex !== 'all' && filters.sex !== undefined ? { sex: filters.sex } : {}),
    ...(filters.minPoints !== undefined ? { minPoints: filters.minPoints } : {}),
    ...(filters.maxPoints !== undefined ? { maxPoints: filters.maxPoints } : {}),
    ...(filters.dateFrom !== undefined ? { dateFrom: filters.dateFrom } : {}),
    ...(filters.dateTo !== undefined ? { dateTo: filters.dateTo } : {}),
    ...(filters.sizeClass !== 'all' && filters.sizeClass !== undefined ? { sizeClass: filters.sizeClass } : {}),
    ...(filters.cameraId !== undefined ? { cameraId: filters.cameraId } : {}),
    ...(filters.deerId !== undefined ? { deerId: filters.deerId } : {}),
    limit: 50,
  }

  // Fetch photos with filters - single data source for both stats and grid
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPlaceholderData, // True when showing previous data while loading new filter results
    isFetching, // True when any fetch is in progress (including background)
  } = usePhotosInfinite(serviceFilters)

  // Show updating indicator when fetching new filter results (but not initial load)
  const isUpdatingFilters = !isLoading && isFetching && isPlaceholderData

  // Flatten paginated data
  const photos = data?.pages?.flatMap(page => page.photos) ?? []
  const total = data?.pages?.[0]?.total ?? 0

  // Calculate stats from the same data that renders in the grid
  const stats = {
    total,
    processing: photos.filter(p => p.detection_status === 'processing').length,
    completed: photos.filter(p => p.detection_status === 'completed').length,
    failed: photos.filter(p => p.detection_status === 'failed').length,
  }

  return (
    <div className="space-y-4">
      {/* Header with Stats */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-cream">
              Photos
            </h1>
            {/* Subtle indicator when updating filter results */}
            {isUpdatingFilters && (
              <span className="text-xs text-copper animate-pulse">
                updating...
              </span>
            )}
          </div>
          {/* Compact Stats Bar */}
          <div className="mt-1 flex items-center gap-4 text-sm">
            <span className="text-cream-dark">
              <span className="font-semibold tabular-nums text-cream">{stats.total}</span> total
            </span>
            {stats.processing > 0 && (
              <span className="text-blue-400">
                <span className="font-semibold tabular-nums">{stats.processing}</span> processing
              </span>
            )}
            {stats.completed > 0 && (
              <span className="text-green-400">
                <span className="font-semibold tabular-nums">{stats.completed}</span> completed
              </span>
            )}
            {stats.failed > 0 && (
              <span className="text-red-400">
                <span className="font-semibold tabular-nums">{stats.failed}</span> failed
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <PhotoFilters
        filters={filters}
        onFiltersChange={setFilters}
        onOpenDrawer={() => setDrawerOpen(true)}
        deerList={deerList}
      />

      {/* Filter Drawer */}
      <PhotoFilterDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        filters={filters}
        onFiltersChange={setFilters}
      />

      {/* Photo Grid - uses same data source as stats */}
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
          const queryString = buildFilterQueryString(filters)
          const url = queryString ? `/photos/${id}?${queryString}` : `/photos/${id}`
          router.push(url)
        }}
      />
    </div>
  )
}

export default function PhotosPage() {
  return (
    <Suspense fallback={<div className="text-cream-dark">Loading photos...</div>}>
      <PhotosContent />
    </Suspense>
  )
}
