'use client'

import { useState, useEffect } from 'react'
import { PhotoUploader } from '@/components/photos/photo-uploader'
import { UploadProgressPanel } from '@/components/photos/upload-progress-panel'
import { PhotoGrid } from '@/components/photos/photo-grid'
import { PhotoFilters, type PhotoFilters as PhotoFiltersType } from '@/components/photos/photo-filters'
import { PhotoViewer } from '@/components/photos/photo-viewer'
import { usePhotos } from '@/lib/hooks/use-photos'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Camera, CheckCircle, Clock, XCircle } from 'lucide-react'
import type { PhotoFilters as ServicePhotoFilters } from '@/lib/services/photos'

export default function PhotosPage() {
  // Filter state
  const [filters, setFilters] = useState<PhotoFiltersType>({
    status: 'all',
    hasDeer: null,
    batchId: undefined,
  })

  // Photo viewer state
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null)
  const [photoIds, setPhotoIds] = useState<string[]>([])

  // Convert component filters to service filters
  const serviceFilters: ServicePhotoFilters = {
    ...(filters.status !== 'all' && filters.status !== undefined ? { status: filters.status } : {}),
    ...(filters.hasDeer !== null && filters.hasDeer !== undefined ? { hasDeer: filters.hasDeer } : {}),
    ...(filters.batchId !== undefined ? { batchId: filters.batchId } : {}),
    limit: 50,
  }

  // Fetch photos with filters
  const { data } = usePhotos(serviceFilters)

  // Track photo IDs for navigation
  const photos = data?.photos ?? []

  useEffect(() => {
    if (photos.length > 0) {
      setPhotoIds(photos.map(p => p.id))
    }
  }, [photos])

  // Photo viewer navigation
  const handleNavigate = (direction: 'prev' | 'next') => {
    if (!selectedPhotoId || photoIds.length === 0) return

    const currentIndex = photoIds.indexOf(selectedPhotoId)
    if (currentIndex === -1) return

    let newIndex: number
    if (direction === 'prev') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : photoIds.length - 1
    } else {
      newIndex = currentIndex < photoIds.length - 1 ? currentIndex + 1 : 0
    }

    const newPhotoId = photoIds[newIndex]
    if (newPhotoId !== undefined) {
      setSelectedPhotoId(newPhotoId)
    }
  }

  // Calculate stats
  const stats = {
    total: data?.total ?? 0,
    processing: photos.filter(p => p.detection_status === 'processing').length,
    completed: photos.filter(p => p.detection_status === 'completed').length,
    failed: photos.filter(p => p.detection_status === 'failed').length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-cream">
          Photos
        </h1>
        <p className="mt-2 text-cream-dark">
          Upload and manage your game camera photos
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-cream-dark">
              Total Photos
            </CardTitle>
            <Camera className="h-4 w-4 text-cream-dark" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cream">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-cream-dark">
              Processing
            </CardTitle>
            <Clock className="h-4 w-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-400">{stats.processing}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-cream-dark">
              Completed
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-400">{stats.completed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-cream-dark">
              Failed
            </CardTitle>
            <XCircle className="h-4 w-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">{stats.failed}</div>
          </CardContent>
        </Card>
      </div>

      {/* Upload Section */}
      <PhotoUploader />
      <UploadProgressPanel />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <PhotoFilters filters={filters} onFiltersChange={setFilters} />
        </CardContent>
      </Card>

      {/* Photo Grid - Uses its own data fetching */}
      <PhotoGrid
        filters={serviceFilters}
        onPhotoClick={(id) => setSelectedPhotoId(id)}
      />

      {/* Photo Viewer Modal */}
      <PhotoViewer
        photoId={selectedPhotoId}
        onClose={() => setSelectedPhotoId(null)}
        onNavigate={handleNavigate}
      />
    </div>
  )
}
