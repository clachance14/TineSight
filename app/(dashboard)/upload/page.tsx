'use client'

import { useCallback, useRef } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { PhotoUploader } from '@/components/photos/photo-uploader'
import { UploadProgressPanel } from '@/components/photos/upload-progress-panel'
import { useUploadStore, batchedUpdateProgress } from '@/lib/stores/upload'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Image } from 'lucide-react'

const CHUNK_SIZE = 20
const PARALLEL_CHUNKS = 1
const PROGRESS_THROTTLE_MS = 500 // Max 2 updates per second per file

function chunkArray<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  )
}

export default function UploadPage() {
  const queryClient = useQueryClient()
  const progressThrottles = useRef<Map<string, number>>(new Map())

  const {
    uploadQueue,
    setIsPreparing,
    startUpload,
    markFileCompleted,
    markFileFailed,
  } = useUploadStore()

  const handleStartUpload = useCallback(async () => {
    const pendingFiles = uploadQueue.filter((f) => f.status === 'pending')
    if (pendingFiles.length === 0) return

    // Create upload session before chunking
    let sessionId: string | null = null
    try {
      const sessionRes = await fetch('/api/upload-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (sessionRes.ok) {
        const sessionData = await sessionRes.json()
        sessionId = sessionData.sessionId
      }
    } catch (err) {
      console.error('Failed to create upload session:', err)
      // Continue without session - backward compatible
    }

    const chunks = chunkArray(pendingFiles, CHUNK_SIZE)

    // Process a single chunk
    const processChunk = async (chunk: typeof pendingFiles) => {
      try {
        // Step 1: Initialize batch and get signed URLs for this chunk
        const response = await fetch('/api/photos/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadSessionId: sessionId,
            files: chunk.map((f) => ({
              id: f.id,
              filename: f.filename,
              contentType: f.file?.type ?? 'image/jpeg',
              size: f.file?.size ?? 0,
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
        const uploadPromises = chunk.map(async (file) => {
          const uploadInfo = uploads.find((u: { fileId: string }) => u.fileId === file.id)
          if (!uploadInfo) {
            markFileFailed(file.id, 'No upload URL received')
            return
          }

          try {
            // File must exist for pending uploads
            if (!file.file) {
              markFileFailed(file.id, 'File data not available')
              return
            }
            const fileData = file.file

            const xhr = new XMLHttpRequest()
            xhr.upload.onprogress = (event) => {
              if (event.lengthComputable) {
                const now = Date.now()
                const lastUpdate = progressThrottles.current.get(file.id) || 0
                // Throttle updates to max 2 per second, but always send 100%
                const progress = Math.round((event.loaded / event.total) * 100)
                if (progress === 100 || now - lastUpdate > PROGRESS_THROTTLE_MS) {
                  progressThrottles.current.set(file.id, now)
                  batchedUpdateProgress(file.id, progress)
                }
              }
            }

            await new Promise<void>((resolve, reject) => {
              xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  resolve()
                } else {
                  // Log Supabase error details
                  console.error(`[Upload Failed] ${file.filename}`, {
                    status: xhr.status,
                    statusText: xhr.statusText,
                    response: xhr.responseText?.slice(0, 500),
                  })
                  reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`))
                }
              }
              xhr.onerror = () => {
                // Log browser/network error
                console.error(`[Network Error] ${file.filename}`, {
                  readyState: xhr.readyState,
                })
                reject(new Error('Network error - browser connection failed'))
              }
              xhr.ontimeout = () => {
                console.error(`[Timeout] ${file.filename}`)
                reject(new Error('Upload timeout'))
              }
              xhr.timeout = 120000 // 120 second timeout
              xhr.open('PUT', uploadInfo.uploadUrl)
              xhr.setRequestHeader('Content-Type', fileData.type)
              xhr.send(fileData)
            })

            markFileCompleted(file.id)
          } catch (err) {
            markFileFailed(file.id, err instanceof Error ? err.message : 'Upload failed')
          }
        })

        await Promise.all(uploadPromises)

        // Step 4: Trigger processing for this chunk immediately
        await fetch('/api/photos/upload/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchId, uploadedImageIds: uploads.map((u: { imageId: string }) => u.imageId) }),
        })

      } catch (err) {
        console.error('Chunk upload failed:', err)
      }
    }

    setIsPreparing(true)

    // Process chunks in parallel batches of PARALLEL_CHUNKS
    for (let i = 0; i < chunks.length; i += PARALLEL_CHUNKS) {
      const batch = chunks.slice(i, i + PARALLEL_CHUNKS)
      await Promise.all(batch.map(processChunk))
    }

    // Step 5: Refresh photo list after all chunks
    await queryClient.invalidateQueries({ queryKey: ['photos'] })
    await queryClient.invalidateQueries({ queryKey: ['upload-sessions'] })
    setIsPreparing(false)
  }, [uploadQueue, setIsPreparing, startUpload, markFileCompleted, markFileFailed, queryClient])

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
