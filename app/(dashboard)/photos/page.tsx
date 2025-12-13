'use client'

import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { PhotoGrid } from '@/components/photos/photo-grid'
import { PhotoFilters, type PhotoFilters as PhotoFiltersType } from '@/components/photos/photo-filters'
import { usePhotos } from '@/lib/hooks/use-photos'
import type { PhotoFilters as ServicePhotoFilters } from '@/lib/services/photos'

function PhotosContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  // Initialize filters from URL params
  const getInitialFilters = (): PhotoFiltersType => {
    const status = searchParams.get('status') as PhotoFiltersType['status'] | null
    const hasDeerParam = searchParams.get('hasDeer')
    const qualityStatus = searchParams.get('qualityStatus') as PhotoFiltersType['qualityStatus'] | null
    const minConfidenceParam = searchParams.get('minConfidence')

    return {
      status: status || 'all',
      hasDeer: hasDeerParam === null ? null : hasDeerParam === 'true',
      batchId: undefined,
      qualityStatus: qualityStatus || 'all',
      minConfidence: minConfidenceParam ? parseInt(minConfidenceParam, 10) : undefined,
    }
  }

  // Filter state
  const [filters, setFilters] = useState<PhotoFiltersType>(getInitialFilters)

  // Convert component filters to service filters
  const serviceFilters: ServicePhotoFilters = {
    ...(filters.status !== 'all' && filters.status !== undefined ? { status: filters.status } : {}),
    ...(filters.hasDeer !== null && filters.hasDeer !== undefined ? { hasDeer: filters.hasDeer } : {}),
    ...(filters.batchId !== undefined ? { batchId: filters.batchId } : {}),
    ...(filters.qualityStatus !== 'all' && filters.qualityStatus !== undefined ? { qualityStatus: filters.qualityStatus } : {}),
    ...(filters.minConfidence !== undefined ? { minConfidence: filters.minConfidence } : {}),
    limit: 50,
  }

  // Fetch photos with filters
  const { data } = usePhotos(serviceFilters)

  // Track photo IDs for navigation
  const photos = data?.photos ?? []

  // Calculate stats
  const stats = {
    total: data?.total ?? 0,
    processing: photos.filter(p => p.detection_status === 'processing').length,
    completed: photos.filter(p => p.detection_status === 'completed').length,
    failed: photos.filter(p => p.detection_status === 'failed').length,
  }

  return (
    <div className="space-y-4">
      {/* Header with Stats */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-cream">
            Photos
          </h1>
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
      <PhotoFilters filters={filters} onFiltersChange={setFilters} />

      {/* Photo Grid */}
      <PhotoGrid
        filters={serviceFilters}
        onPhotoClick={(id) => router.push(`/photos/${id}`)}
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
