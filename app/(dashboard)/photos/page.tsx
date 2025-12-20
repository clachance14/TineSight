'use client'

import React, { Suspense, useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { PhotoGrid } from '@/components/photos/photo-grid'
import { PhotoFilters, type PhotoFilters as PhotoFiltersType } from '@/components/photos/photo-filters'
import { PhotoFilterDrawer } from '@/components/photos/photo-filter-drawer'
import { usePhotosInfinite } from '@/lib/hooks/use-photos'
import { useDeerCatalog } from '@/lib/hooks/use-deer'
import { useAreas } from '@/lib/hooks/use-areas'
import { useRealtimePhotos } from '@/lib/hooks/use-realtime-photos'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import type { PhotoFilters as ServicePhotoFilters } from '@/lib/services/photos'

function PhotosContent(): React.JSX.Element {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Get current user for realtime subscription
  const { userId } = useCurrentUser()

  // Subscribe to realtime photo updates
  const { isConnected } = useRealtimePhotos({
    userId,
    enabled: userId.length > 0
  })

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
    const batchIdParam = searchParams.get('batchId')
    const uploadSessionIdParam = searchParams.get('uploadSessionId')
    const areaNameParam = searchParams.get('areaName')
    const sortByParam = searchParams.get('sortBy') as PhotoFiltersType['sortBy'] | null

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
      ...(batchIdParam ? { batchId: batchIdParam } : {}),
      ...(uploadSessionIdParam ? { uploadSessionId: uploadSessionIdParam } : {}),
      ...(areaNameParam ? { areaName: areaNameParam } : {}),
      ...(sortByParam ? { sortBy: sortByParam } : {}),
    }
  }

  // Filter state
  const [filters, setFilters] = useState<PhotoFiltersType>(getInitialFilters)

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Fetch deer catalog for filter dropdown
  const { data: deerData } = useDeerCatalog()
  const deerList = deerData?.deer ?? []

  // Fetch areas for filter dropdown
  const { data: areasData } = useAreas()
  const areaList = areasData?.areas ?? []

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
    if (currentFilters.batchId) params.set('batchId', currentFilters.batchId)
    if (currentFilters.uploadSessionId) params.set('uploadSessionId', currentFilters.uploadSessionId)
    if (currentFilters.areaName) params.set('areaName', currentFilters.areaName)
    if (currentFilters.sortBy && currentFilters.sortBy !== 'imported_at') params.set('sortBy', currentFilters.sortBy)

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
    ...(filters.uploadSessionId !== undefined ? { uploadSessionId: filters.uploadSessionId } : {}),
    ...(filters.areaName !== undefined ? { areaName: filters.areaName } : {}),
    ...(filters.sortBy !== undefined ? { sortBy: filters.sortBy } : {}),
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
  } = usePhotosInfinite(serviceFilters, { realtimeActive: isConnected })

  // Show updating indicator when fetching new filter results (but not initial load)
  const isUpdatingFilters = !isLoading && isFetching && isPlaceholderData

  // Fetch unfiltered total for stats display
  const { data: statsData } = useQuery({
    queryKey: ['photos', 'stats'],
    queryFn: async () => {
      const res = await fetch('/api/photos/stats')
      if (!res.ok) return null
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // Check if any filters are active
  const hasActiveFilters =
    filters.status !== 'all' ||
    filters.hasDeer !== null ||
    filters.hasDetections !== null ||
    filters.qualityStatus !== 'all' ||
    filters.sex !== 'all' ||
    filters.sizeClass !== 'all' ||
    filters.minConfidence !== undefined ||
    filters.minPoints !== undefined ||
    filters.maxPoints !== undefined ||
    filters.dateFrom !== undefined ||
    filters.dateTo !== undefined ||
    filters.datePreset !== undefined ||
    filters.cameraId !== undefined ||
    filters.deerId !== undefined ||
    filters.batchId !== undefined ||
    filters.uploadSessionId !== undefined ||
    filters.areaName !== undefined ||
    filters.sortBy === 'captured_at' // Only count as active if non-default

  // Flatten paginated data
  const photos = data?.pages?.flatMap(page => page.photos) ?? []
  const total = data?.pages?.[0]?.total ?? 0
  const unfilteredTotal = statsData?.total_photos ?? 0

  // Calculate stats from the same data that renders in the grid
  const stats = {
    filtered: total,
    unfilteredTotal,
    processing: photos.filter(p => p.detection_status === 'processing').length,
    failed: photos.filter(p => p.detection_status === 'failed').length,
    hasActiveFilters,
  }

  return (
    <div className="flex flex-col h-full space-y-4">
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
              {stats.hasActiveFilters && stats.unfilteredTotal > 0 ? (
                <>
                  <span className="font-semibold tabular-nums text-cream">{stats.filtered}</span>
                  {' of '}
                  <span className="font-semibold tabular-nums text-cream">{stats.unfilteredTotal}</span>
                  {' photos'}
                </>
              ) : (
                <>
                  <span className="font-semibold tabular-nums text-cream">{stats.unfilteredTotal || stats.filtered}</span>
                  {' photos'}
                </>
              )}
            </span>
            {stats.processing > 0 && (
              <span className="text-blue-400">
                <span className="font-semibold tabular-nums">{stats.processing}</span> processing
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
        areaList={areaList}
        totalFailedCount={statsData?.failed_photos}
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
          // Store photo ID for scroll restoration when returning
          sessionStorage.setItem('photos:scrollToId', id)
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
