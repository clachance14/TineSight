'use client'

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { PhotoUploader } from '@/components/photos/photo-uploader'
import { BulkUploader } from '@/components/upload/BulkUploader'
import { UploadProgressPanel } from '@/components/photos/upload-progress-panel'
import { LocationPickerModal, type LocationData } from '@/components/photos/location-picker-modal'
import { useUploadStore, batchedUpdateProgress } from '@/lib/stores/upload'
import { setActiveUploadSessionId } from '@/lib/hooks/use-active-batch'
import { useLocations } from '@/lib/hooks/use-locations'
import { useAdaptiveThrottle } from '@/lib/hooks/use-adaptive-throttle'
import { classifyXHRError } from '@/lib/throttle'
import { ThrottleMetricsPanel } from '@/components/debug/throttle-metrics-panel'
import { UploadLogsPanel } from '@/components/debug/upload-logs-panel'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Image, FolderUp, Upload } from 'lucide-react'
import {
  createUploadLogger,
  createUploadMetrics,
  getUploadLogger,
  getUploadMetrics,
  removeUploadLogger,
  removeUploadMetrics,
} from '@/lib/upload'

const PROGRESS_THROTTLE_MS = 100 // Max 10 updates per second per file for smoother progress
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
  imageId: string
  attempt: number
}

export default function UploadPage() {
  const queryClient = useQueryClient()
  const progressThrottles = useRef<Map<string, number>>(new Map())
  const failedUploadsRef = useRef<FailedUpload[]>([])
  const uploadStartTimes = useRef<Map<string, number>>(new Map())

  // Debug logging state
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)

  // Upload mode state - default to bulk for 10K upload feature
  const [uploadMode, setUploadMode] = useState<'bulk' | 'simple'>('bulk')

  // Initialize adaptive throttler for upload operations
  const throttle = useAdaptiveThrottle('upload')

  // Reusable XHR upload function
  const uploadFile = useCallback((
    fileId: string,
    filename: string,
    file: File,
    uploadUrl: string,
    sessionId?: string
  ): Promise<{ success: true } | { success: false; error: string }> => {
    // Get logger and metrics for this session
    const logger = sessionId ? getUploadLogger(sessionId) : null
    const metrics = sessionId ? getUploadMetrics(sessionId) : null

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()
      const startTime = Date.now()
      uploadStartTimes.current.set(fileId, startTime)

      // Log file start
      logger?.fileStart(fileId, filename, file.size)

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const now = Date.now()
          const lastUpdate = progressThrottles.current.get(fileId) || 0
          const progress = Math.round((event.loaded / event.total) * 100)
          // Always report: first update (lastUpdate === 0), 100%, or if throttle interval passed
          if (lastUpdate === 0 || progress === 100 || now - lastUpdate > PROGRESS_THROTTLE_MS) {
            progressThrottles.current.set(fileId, now)
            batchedUpdateProgress(fileId, progress)
          }
        }
      }

      xhr.onload = () => {
        const duration = Date.now() - startTime
        uploadStartTimes.current.delete(fileId)

        if (xhr.status >= 200 && xhr.status < 300) {
          // Record success with duration
          throttle.recordSuccess(duration)
          // Log and record metrics
          logger?.fileComplete(fileId, duration, file.size)
          metrics?.recordUpload(fileId, file.size, duration)
          resolve({ success: true })
        } else {
          const errorMsg = `Upload failed: ${xhr.status} ${xhr.statusText}`
          console.error(`[Upload Failed] ${filename}`, {
            status: xhr.status,
            statusText: xhr.statusText,
            response: xhr.responseText?.slice(0, 500),
          })
          // Record failure with classified error type
          const errorType = classifyXHRError(xhr)
          throttle.recordFailure(errorType)
          logger?.fileFailed(fileId, errorMsg)
          metrics?.recordError(fileId, errorType)
          resolve({ success: false, error: errorMsg })
        }
      }

      xhr.onerror = () => {
        const duration = Date.now() - startTime
        uploadStartTimes.current.delete(fileId)
        const errorMsg = 'Network error - browser connection failed'
        console.error(`[Network Error] ${filename}`, { readyState: xhr.readyState })
        // Record network failure
        throttle.recordFailure('network')
        logger?.error('Network error', undefined, { fileId, filename, duration })
        metrics?.recordError(fileId, 'network')
        resolve({ success: false, error: errorMsg })
      }

      xhr.ontimeout = () => {
        const duration = Date.now() - startTime
        uploadStartTimes.current.delete(fileId)
        const errorMsg = 'Upload timeout'
        console.error(`[Timeout] ${filename}`)
        // Record network failure (timeout is a network issue)
        throttle.recordFailure('network')
        logger?.error('Upload timeout', undefined, { fileId, filename, duration })
        metrics?.recordError(fileId, 'timeout')
        resolve({ success: false, error: errorMsg })
      }

      xhr.timeout = 120000
      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', file.type)
      xhr.send(file)
    })
  }, [throttle])

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

  // Handle bulk upload complete
  const handleBulkUploadComplete = useCallback((sessionId: string) => {
    console.log(`[BulkUploader] Upload complete for session: ${sessionId}`)
    setCurrentSessionId(sessionId)
  }, [])

  const handleStartUpload = useCallback(async () => {
    const pendingFiles = uploadQueue.filter((f) => f.status === 'pending')
    if (pendingFiles.length === 0) return

    // Check if throttler allows proceeding
    const proceedResult = throttle.shouldProceed()
    if (!proceedResult.allowed) {
      console.warn(`[Throttle] Not allowed to proceed: ${proceedResult.reason}`)
      if (proceedResult.waitMs && proceedResult.waitMs > 0) {
        console.log(`[Throttle] Waiting ${proceedResult.waitMs}ms before proceeding...`)
        await throttle.waitForRecovery()
      }
    }

    // Clear failed uploads from previous runs
    failedUploadsRef.current = []

    // Clean up any existing logger/metrics from previous session
    if (currentSessionId) {
      removeUploadLogger(currentSessionId)
      removeUploadMetrics(currentSessionId)
    }

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
        // Track this session for processing status bar (set once, not per-batch)
        if (sessionId) {
          setActiveUploadSessionId(sessionId)
          setCurrentSessionId(sessionId)

          // Initialize debug logger and metrics
          const logger = createUploadLogger(sessionId)
          const metrics = createUploadMetrics(sessionId)

          logger.phase('init', { totalFiles: pendingFiles.length })
          metrics.startSession()
        }
      }
    } catch (err) {
      console.error('Failed to create upload session:', err)
      // Continue without session - backward compatible
    }

    // Get dynamic values from throttler
    const chunkSize = throttle.getChunkSize()
    const parallelChunks = throttle.getConcurrency()

    console.log(`[Throttle] Using chunk size: ${chunkSize}, concurrency: ${parallelChunks}`)

    const chunks = chunkArray(pendingFiles, chunkSize)

    // Initialize a batch: get signed URLs from API
    const initializeBatch = async (chunk: typeof pendingFiles) => {
      const response = await fetch('/api/photos/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadSessionId: sessionId,
          ...(pendingLocation && {
            locationId: pendingLocation.locationId,
            locationLat: pendingLocation.lat,
            locationLng: pendingLocation.lng,
            areaName: pendingLocation.areaName,
            ...(pendingLocation.directionCompass !== undefined && { directionCompass: pendingLocation.directionCompass }),
            ...(pendingLocation.directionNotes !== undefined && { directionNotes: pendingLocation.directionNotes }),
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
    const uploadBatch = async (batchData: { chunk: typeof pendingFiles; batchId: string; uploads: Array<{ fileId: string; uploadUrl: string; imageId: string }> }, chunkIndex: number) => {
      const { chunk, batchId, uploads } = batchData
      const logger = sessionId ? getUploadLogger(sessionId) : null
      const chunkStartTime = Date.now()

      // Log chunk start
      logger?.chunkStart(chunkIndex, chunk.length)

      // Update store with upload URLs and mark as uploading
      startUpload(batchId, uploads)

      // Track results for logging
      let successCount = 0
      let failCount = 0

      // Upload each file to its signed URL
      const uploadPromises = chunk.map(async (file) => {
        const uploadInfo = uploads.find((u) => u.fileId === file.id)
        if (!uploadInfo) {
          markFileFailed(file.id, 'No upload URL received')
          failCount++
          return
        }

        if (!file.file) {
          markFileFailed(file.id, 'File data not available')
          failCount++
          return
        }

        const result = await uploadFile(file.id, file.filename, file.file, uploadInfo.uploadUrl, sessionId ?? undefined)

        if (result.success) {
          markFileCompleted(file.id)
          successCount++
        } else {
          failedUploadsRef.current.push({
            fileId: file.id,
            filename: file.filename,
            file: file.file,
            uploadUrl: uploadInfo.uploadUrl,
            imageId: uploadInfo.imageId,
            attempt: 1,
          })
          failCount++
        }
      })

      await Promise.all(uploadPromises)

      // Log chunk completion
      const chunkDuration = Date.now() - chunkStartTime
      logger?.chunkComplete(chunkIndex, successCount, failCount, chunkDuration)

      // Trigger processing for this chunk
      await fetch('/api/photos/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, uploadedImageIds: uploads.map((u) => u.imageId) }),
      })
    }

    setIsPreparing(true)

    // Get logger for phase tracking
    const logger = sessionId ? getUploadLogger(sessionId) : null

    // Log upload phase start
    logger?.phase('upload', { totalChunks: chunks.length, chunkSize, parallelChunks })

    // Start session timer for metrics tracking
    throttle.startSession()

    // Pipeline: fetch signed URLs for next round while current round uploads
    // This overlaps API latency with upload time
    const rounds = chunkArray(chunks, parallelChunks)

    // Pre-fetch first round's signed URLs
    let currentRoundPromises = rounds[0]?.map((chunk) =>
      initializeBatch(chunk).catch((err) => {
        console.error('Batch init failed:', err)
        logger?.error('Batch init failed', err instanceof Error ? err : undefined)
        return null
      })
    ) ?? []

    let chunkIndex = 0
    for (let i = 0; i < rounds.length; i++) {
      // Wait for current round's init to complete
      const batchDataList = await Promise.all(currentRoundPromises)

      // Start pre-fetching NEXT round's signed URLs (overlaps with uploads below)
      if (i + 1 < rounds.length) {
        currentRoundPromises = rounds[i + 1]!.map((chunk) =>
          initializeBatch(chunk).catch((err) => {
            console.error('Batch init failed:', err)
            logger?.error('Batch init failed', err instanceof Error ? err : undefined)
            return null
          })
        )
      }

      // Upload all chunks in current round (parallel uploads)
      // While this runs, next round's API calls are in flight
      await Promise.all(
        batchDataList
          .filter((data): data is NonNullable<typeof data> => data !== null)
          .map((batchData) => {
            const idx = chunkIndex++
            return uploadBatch(batchData, idx)
          })
      )
    }

    // Step 5: Retry failed uploads at the end
    if (failedUploadsRef.current.length > 0) {
      logger?.event('retry_phase_start', { failedCount: failedUploadsRef.current.length })
    }

    while (failedUploadsRef.current.length > 0) {
      const toRetry = [...failedUploadsRef.current]
      failedUploadsRef.current = []

      console.log(`[Retry] Retrying ${toRetry.length} failed uploads...`)
      logger?.event('retry_batch', { count: toRetry.length })

      // Add delay before retry batch
      await delay(RETRY_DELAY_MS)

      for (const failed of toRetry) {
        if (failed.attempt >= MAX_RETRIES) {
          // Exhausted retries, mark as failed
          console.error(`[Upload Failed] ${failed.filename} after ${MAX_RETRIES} attempts`)
          logger?.error(`Max retries exceeded for ${failed.filename}`, undefined, {
            fileId: failed.fileId,
            attempts: MAX_RETRIES,
          })
          markFileFailed(failed.fileId, `Upload failed after ${MAX_RETRIES} attempts`)
          continue
        }

        // Reset progress for retry
        batchedUpdateProgress(failed.fileId, 0)

        // Refresh the signed URL before retry attempt
        let freshUploadUrl = failed.uploadUrl
        try {
          console.log(`[Retry] Refreshing signed URL for ${failed.filename}`)
          logger?.event('url_refresh', { fileId: failed.fileId, attempt: failed.attempt + 1 })
          const refreshRes = await fetch(`/api/photos/${failed.imageId}/refresh-url`, {
            method: 'POST',
          })

          if (!refreshRes.ok) {
            const errorData = await refreshRes.json().catch(() => ({ error: 'Unknown error' }))
            console.error(`[Retry] Failed to refresh URL for ${failed.filename}:`, errorData.error)
            logger?.error('URL refresh failed', undefined, { fileId: failed.fileId, error: errorData.error })
            // Count this as a failed attempt and continue to next file
            failedUploadsRef.current.push({
              ...failed,
              attempt: failed.attempt + 1,
            })
            continue
          }

          const { uploadUrl } = await refreshRes.json()
          freshUploadUrl = uploadUrl
          console.log(`[Retry] Successfully refreshed URL for ${failed.filename}`)
        } catch (err) {
          console.error(`[Retry] Error refreshing URL for ${failed.filename}:`, err)
          logger?.error('URL refresh error', err instanceof Error ? err : undefined, { fileId: failed.fileId })
          // Count this as a failed attempt and continue to next file
          failedUploadsRef.current.push({
            ...failed,
            attempt: failed.attempt + 1,
          })
          continue
        }

        const result = await uploadFile(failed.fileId, failed.filename, failed.file, freshUploadUrl, sessionId ?? undefined)

        if (result.success) {
          console.log(`[Retry Success] ${failed.filename} succeeded on attempt ${failed.attempt + 1}`)
          logger?.event('retry_success', { fileId: failed.fileId, attempt: failed.attempt + 1 })
          markFileCompleted(failed.fileId)
        } else {
          // Queue for another retry with the fresh URL
          failedUploadsRef.current.push({
            ...failed,
            uploadUrl: freshUploadUrl, // Use the refreshed URL for next attempt
            attempt: failed.attempt + 1,
          })
        }
      }
    }

    // Stop session timer for metrics tracking
    throttle.stopSession()

    // Get final metrics summary
    const metrics = sessionId ? getUploadMetrics(sessionId) : null
    if (metrics) {
      metrics.endSession()
      const summary = metrics.getSummary()
      logger?.phase('complete', {
        totalFiles: summary.totalFiles,
        successfulFiles: summary.successfulFiles,
        failedFiles: summary.failedFiles,
        totalBytes: summary.totalBytes,
        averageThroughputBps: summary.averageThroughputBps,
        peakThroughputBps: summary.peakThroughputBps,
        filesPerSecond: summary.filesPerSecond,
        peakMemoryMB: summary.peakMemoryMB,
      })
      logger?.metric('average_throughput', summary.averageThroughputBps / (1024 * 1024), 'MB/s')
      logger?.metric('peak_throughput', summary.peakThroughputBps / (1024 * 1024), 'MB/s')
      logger?.metric('files_per_second', summary.filesPerSecond)
    } else {
      logger?.phase('complete')
    }

    // Step 6: Refresh photo list after all chunks and retries
    await queryClient.invalidateQueries({ queryKey: ['photos'] })
    await queryClient.invalidateQueries({ queryKey: ['upload-sessions'] })
    // Invalidate areas query if location was set (new area may have been added)
    if (pendingLocation) {
      await queryClient.invalidateQueries({ queryKey: ['areas'] })
      await queryClient.invalidateQueries({ queryKey: ['locations'] })
      // Clear the pending location after successful upload
      setPendingLocation(null)
    }
    setIsPreparing(false)
  }, [uploadQueue, setIsPreparing, startUpload, markFileCompleted, markFileFailed, queryClient, pendingLocation, setPendingLocation, uploadFile, throttle, currentSessionId])

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

      {/* Upload Section with Tabs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg text-cream">Choose Upload Method</CardTitle>
          <CardDescription className="text-cream-dark">
            Use Bulk Upload for folders with many photos, or Simple Upload for drag-and-drop
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={uploadMode} onValueChange={(v: string) => setUploadMode(v as 'bulk' | 'simple')}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="bulk" className="gap-2">
                <FolderUp className="h-4 w-4" />
                Bulk Upload
              </TabsTrigger>
              <TabsTrigger value="simple" className="gap-2">
                <Upload className="h-4 w-4" />
                Simple Upload
              </TabsTrigger>
            </TabsList>

            <TabsContent value="bulk" className="mt-0">
              <BulkUploader onUploadComplete={handleBulkUploadComplete} />
            </TabsContent>

            <TabsContent value="simple" className="mt-0">
              <PhotoUploader
                onStartUpload={handleStartUpload}
                onFilesReady={handleFilesReady}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Progress Panel - shown for simple upload mode */}
      {uploadMode === 'simple' && <UploadProgressPanel />}

      {/* Location Picker Modal - used by simple upload */}
      <LocationPickerModal
        isOpen={showLocationPicker}
        onConfirm={handleLocationConfirm}
        onSkip={handleLocationSkip}
        existingLocations={existingLocations}
      />

      {/* Debug Panels - Only visible in development */}
      <ThrottleMetricsPanel />
      <UploadLogsPanel sessionId={currentSessionId} />
    </div>
  )
}
