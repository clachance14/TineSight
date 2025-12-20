'use client'

import { useCallback, useRef } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { PhotoUploader } from '@/components/photos/photo-uploader'
import { UploadProgressPanel } from '@/components/photos/upload-progress-panel'
import { LocationPickerModal, type LocationData } from '@/components/photos/location-picker-modal'
import { useUploadStore, batchedUpdateProgress } from '@/lib/stores/upload'
import { useLocations } from '@/lib/hooks/use-locations'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Image } from 'lucide-react'

const CHUNK_SIZE = 25
const PARALLEL_CHUNKS = 4
const PROGRESS_THROTTLE_MS = 500 // Max 2 updates per second per file
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

function chunkArray<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface FailedUpload {
  fileId: string
  filename: string
  file: File
  uploadUrl: string
  attempt: number
}

export default function UploadPage() {
  const queryClient = useQueryClient()
  const progressThrottles = useRef<Map<string, number>>(new Map())
  const failedUploadsRef = useRef<FailedUpload[]>([])

  // Reusable XHR upload function
  const uploadFile = useCallback((
    fileId: string,
    filename: string,
    file: File,
    uploadUrl: string
  ): Promise<{ success: true } | { success: false; error: string }> => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const now = Date.now()
          const lastUpdate = progressThrottles.current.get(fileId) || 0
          const progress = Math.round((event.loaded / event.total) * 100)
          if (progress === 100 || now - lastUpdate > PROGRESS_THROTTLE_MS) {
            progressThrottles.current.set(fileId, now)
            batchedUpdateProgress(fileId, progress)
          }
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ success: true })
        } else {
          console.error(`[Upload Failed] ${filename}`, {
            status: xhr.status,
            statusText: xhr.statusText,
            response: xhr.responseText?.slice(0, 500),
          })
          resolve({ success: false, error: `Upload failed: ${xhr.status} ${xhr.statusText}` })
        }
      }

      xhr.onerror = () => {
        console.error(`[Network Error] ${filename}`, { readyState: xhr.readyState })
        resolve({ success: false, error: 'Network error - browser connection failed' })
      }

      xhr.ontimeout = () => {
        console.error(`[Timeout] ${filename}`)
        resolve({ success: false, error: 'Upload timeout' })
      }

      xhr.timeout = 120000
      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', file.type)
      xhr.send(file)
    })
  }, [])

  const {
    uploadQueue,
    setIsPreparing,
    startUpload,
    markFileCompleted,
    markFileFailed,
    pendingLocation,
    showLocationPicker,
    setPendingLocation,
    setShowLocationPicker,
  } = useUploadStore()

  // Fetch existing locations for dropdown in location picker
  const { data: locationsData } = useLocations()
  const existingLocations = locationsData?.locations ?? []

  // Handle files ready - show location picker
  const handleFilesReady = useCallback(() => {
    setShowLocationPicker(true)
  }, [setShowLocationPicker])

  // Handle location confirmed - convert modal LocationData to store LocationData
  const handleLocationConfirm = useCallback((location: LocationData) => {
    // Map modal LocationData to store LocationData (handling optional properties)
    setPendingLocation({
      lat: location.lat,
      lng: location.lng,
      areaName: location.areaName,
      ...(location.directionCompass !== undefined && { directionCompass: location.directionCompass }),
      ...(location.directionNotes !== undefined && { directionNotes: location.directionNotes }),
    })
    setShowLocationPicker(false)
  }, [setPendingLocation, setShowLocationPicker])

  // Handle location skipped
  const handleLocationSkip = useCallback(() => {
    setPendingLocation(null)
    setShowLocationPicker(false)
  }, [setPendingLocation, setShowLocationPicker])

  const handleStartUpload = useCallback(async () => {
    const pendingFiles = uploadQueue.filter((f) => f.status === 'pending')
    if (pendingFiles.length === 0) return

    // Clear failed uploads from previous runs
    failedUploadsRef.current = []

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

    // Initialize a batch: get signed URLs from API
    const initializeBatch = async (chunk: typeof pendingFiles) => {
      const response = await fetch('/api/photos/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadSessionId: sessionId,
          ...(pendingLocation && {
            locationLat: pendingLocation.lat,
            locationLng: pendingLocation.lng,
            areaName: pendingLocation.areaName,
            directionCompass: pendingLocation.directionCompass,
            directionNotes: pendingLocation.directionNotes,
          }),
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
      return { chunk, batchId, uploads }
    }

    // Upload files using pre-fetched signed URLs
    const uploadBatch = async (batchData: { chunk: typeof pendingFiles; batchId: string; uploads: Array<{ fileId: string; uploadUrl: string; imageId: string }> }) => {
      const { chunk, batchId, uploads } = batchData

      // Update store with upload URLs and mark as uploading
      startUpload(batchId, uploads)

      // Upload each file to its signed URL
      const uploadPromises = chunk.map(async (file) => {
        const uploadInfo = uploads.find((u) => u.fileId === file.id)
        if (!uploadInfo) {
          markFileFailed(file.id, 'No upload URL received')
          return
        }

        if (!file.file) {
          markFileFailed(file.id, 'File data not available')
          return
        }

        const result = await uploadFile(file.id, file.filename, file.file, uploadInfo.uploadUrl)

        if (result.success) {
          markFileCompleted(file.id)
        } else {
          failedUploadsRef.current.push({
            fileId: file.id,
            filename: file.filename,
            file: file.file,
            uploadUrl: uploadInfo.uploadUrl,
            attempt: 1,
          })
        }
      })

      await Promise.all(uploadPromises)

      // Trigger processing for this chunk
      await fetch('/api/photos/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, uploadedImageIds: uploads.map((u) => u.imageId) }),
      })
    }

    setIsPreparing(true)

    // Pipeline: fetch signed URLs for next round while current round uploads
    // This overlaps API latency with upload time
    const rounds = chunkArray(chunks, PARALLEL_CHUNKS)

    // Pre-fetch first round's signed URLs
    let currentRoundPromises = rounds[0]?.map((chunk) =>
      initializeBatch(chunk).catch((err) => {
        console.error('Batch init failed:', err)
        return null
      })
    ) ?? []

    for (let i = 0; i < rounds.length; i++) {
      // Wait for current round's init to complete
      const batchDataList = await Promise.all(currentRoundPromises)

      // Start pre-fetching NEXT round's signed URLs (overlaps with uploads below)
      if (i + 1 < rounds.length) {
        currentRoundPromises = rounds[i + 1]!.map((chunk) =>
          initializeBatch(chunk).catch((err) => {
            console.error('Batch init failed:', err)
            return null
          })
        )
      }

      // Upload all chunks in current round (parallel uploads)
      // While this runs, next round's API calls are in flight
      await Promise.all(
        batchDataList
          .filter((data): data is NonNullable<typeof data> => data !== null)
          .map((batchData) => uploadBatch(batchData))
      )
    }

    // Step 5: Retry failed uploads at the end
    while (failedUploadsRef.current.length > 0) {
      const toRetry = [...failedUploadsRef.current]
      failedUploadsRef.current = []

      console.log(`[Retry] Retrying ${toRetry.length} failed uploads...`)

      // Add delay before retry batch
      await delay(RETRY_DELAY_MS)

      for (const failed of toRetry) {
        if (failed.attempt >= MAX_RETRIES) {
          // Exhausted retries, mark as failed
          console.error(`[Upload Failed] ${failed.filename} after ${MAX_RETRIES} attempts`)
          markFileFailed(failed.fileId, `Upload failed after ${MAX_RETRIES} attempts`)
          continue
        }

        // Reset progress for retry
        batchedUpdateProgress(failed.fileId, 0)

        const result = await uploadFile(failed.fileId, failed.filename, failed.file, failed.uploadUrl)

        if (result.success) {
          console.log(`[Retry Success] ${failed.filename} succeeded on attempt ${failed.attempt + 1}`)
          markFileCompleted(failed.fileId)
        } else {
          // Queue for another retry
          failedUploadsRef.current.push({
            ...failed,
            attempt: failed.attempt + 1,
          })
        }
      }
    }

    // Step 6: Refresh photo list after all chunks and retries
    await queryClient.invalidateQueries({ queryKey: ['photos'] })
    await queryClient.invalidateQueries({ queryKey: ['upload-sessions'] })
    // Invalidate areas query if location was set (new area may have been added)
    if (pendingLocation) {
      await queryClient.invalidateQueries({ queryKey: ['areas'] })
      // Clear the pending location after successful upload
      setPendingLocation(null)
    }
    setIsPreparing(false)
  }, [uploadQueue, setIsPreparing, startUpload, markFileCompleted, markFileFailed, queryClient, pendingLocation, setPendingLocation, uploadFile])

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
          <PhotoUploader
            onStartUpload={handleStartUpload}
            onFilesReady={handleFilesReady}
          />
        </CardContent>
      </Card>

      {/* Progress Panel */}
      <UploadProgressPanel />

      {/* Location Picker Modal */}
      <LocationPickerModal
        isOpen={showLocationPicker}
        onConfirm={handleLocationConfirm}
        onSkip={handleLocationSkip}
        existingLocations={existingLocations}
      />
    </div>
  )
}
