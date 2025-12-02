'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PhotoUploader } from '@/components/photos/photo-uploader'
import { UploadProgressPanel } from '@/components/photos/upload-progress-panel'
import { PhotoGrid } from '@/components/photos/photo-grid'
import { PhotoFilters, type PhotoFilters as PhotoFiltersType } from '@/components/photos/photo-filters'
import { PhotoViewer } from '@/components/photos/photo-viewer'
import { usePhotos } from '@/lib/hooks/use-photos'
import { useUploadStore } from '@/lib/stores/upload'
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

  // Query client for cache invalidation
  const queryClient = useQueryClient()

  // Upload store
  const {
    uploadQueue,
    startUpload,
    updateFileProgress,
    markFileCompleted,
    markFileFailed,
  } = useUploadStore()

  // Handle starting the upload
  const handleStartUpload = useCallback(async () => {
    const pendingFiles = uploadQueue.filter((f) => f.status === 'pending')
    if (pendingFiles.length === 0) return

    try {
      // Step 1: Initialize batch and get signed URLs
      const response = await fetch('/api/photos/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: pendingFiles.map((f) => ({
            id: f.id,
            filename: f.filename,
            contentType: f.file.type,
            size: f.file.size,
          })),
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to initialize upload')
      }

      const { batchId, uploads } = await response.json()

      // Step 2: Update store with upload URLs and mark as uploading
      startUpload(batchId, uploads)

      // Step 3: Upload each file to its signed URL
      const uploadPromises = pendingFiles.map(async (file) => {
        const uploadInfo = uploads.find((u: { fileId: string }) => u.fileId === file.id)
        if (!uploadInfo) {
          markFileFailed(file.id, 'No upload URL received')
          return
        }

        try {
          const xhr = new XMLHttpRequest()

          // Track progress
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const progress = Math.round((event.loaded / event.total) * 100)
              updateFileProgress(file.id, progress)
            }
          }

          await new Promise<void>((resolve, reject) => {
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve()
              } else {
                reject(new Error(`Upload failed: ${xhr.status}`))
              }
            }
            xhr.onerror = () => reject(new Error('Network error'))

            xhr.open('PUT', uploadInfo.uploadUrl)
            xhr.setRequestHeader('Content-Type', file.file.type)
            xhr.send(file.file)
          })

          markFileCompleted(file.id)
        } catch (err) {
          markFileFailed(file.id, err instanceof Error ? err.message : 'Upload failed')
        }
      })

      await Promise.all(uploadPromises)

      // Step 4: Mark batch as complete with uploaded image IDs
      const uploadedImageIds = uploads.map((u: { imageId: string }) => u.imageId)
      await fetch('/api/photos/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, uploadedImageIds }),
      })

      // Step 5: Refresh photo list to show newly uploaded photos
      await queryClient.invalidateQueries({ queryKey: ['photos'] })

    } catch (err) {
      console.error('Upload failed:', err)
    }
  }, [uploadQueue, startUpload, updateFileProgress, markFileCompleted, markFileFailed, queryClient])

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
      <PhotoUploader onStartUpload={handleStartUpload} />
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
