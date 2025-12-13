'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { PhotoUploader } from '@/components/photos/photo-uploader'
import { UploadProgressPanel } from '@/components/photos/upload-progress-panel'
import { useUploadStore } from '@/lib/stores/upload'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Image } from 'lucide-react'

export default function UploadPage() {
  const queryClient = useQueryClient()

  const {
    uploadQueue,
    setIsPreparing,
    startUpload,
    updateFileProgress,
    markFileCompleted,
    markFileFailed,
  } = useUploadStore()

  const handleStartUpload = useCallback(async () => {
    const pendingFiles = uploadQueue.filter((f) => f.status === 'pending')
    if (pendingFiles.length === 0) return

    setIsPreparing(true)

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
            capturedAt: f.capturedAt?.toISOString(),
            make: f.make,
            model: f.model,
            deviceIdentifier: f.deviceIdentifier,
            exifSignature: f.exifSignature,
            exifData: f.exifData,
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

      // Step 4: Mark batch as complete with ONLY successfully uploaded image IDs
      const currentQueue = useUploadStore.getState().uploadQueue
      const successfulUploads = uploads.filter((u: { fileId: string; imageId: string }) => {
        const file = currentQueue.find(f => f.id === u.fileId)
        return file?.status === 'completed'
      })
      const uploadedImageIds = successfulUploads.map((u: { imageId: string }) => u.imageId)

      if (uploadedImageIds.length > 0) {
        await fetch('/api/photos/upload/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId, uploadedImageIds }),
        })
      }

      // Step 5: Refresh photo list
      await queryClient.invalidateQueries({ queryKey: ['photos'] })

    } catch (err) {
      console.error('Upload failed:', err)
      setIsPreparing(false)
    }
  }, [uploadQueue, setIsPreparing, startUpload, updateFileProgress, markFileCompleted, markFileFailed, queryClient])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-cream">
            Upload Photos
          </h1>
          <p className="mt-2 text-cream-dark">
            Upload game camera photos for AI processing
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/photos">
            <Image className="mr-2 h-4 w-4" />
            View Photos
          </Link>
        </Button>
      </div>

      {/* Upload Section */}
      <Card>
        <CardContent className="pt-6">
          <PhotoUploader onStartUpload={handleStartUpload} />
        </CardContent>
      </Card>

      {/* Progress Panel */}
      <UploadProgressPanel />
    </div>
  )
}
