'use client'

import { PageHeading } from '@/components/layout/page-heading'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createUploadPhotoNavigator } from '@/lib/upload/photo-navigation'
import { useQueryClient } from '@tanstack/react-query'
import { UploadReviewDialog } from '@/components/upload/upload-review-dialog'
import { PhotoUploader } from '@/components/photos/photo-uploader'
import { BulkUploader } from '@/components/upload/BulkUploader'
import { UploadProgressPanel } from '@/components/photos/upload-progress-panel'
import { LocationPickerModal, type LocationData } from '@/components/photos/location-picker-modal'
import { useUploadStore } from '@/lib/stores/upload'
import { setActiveUploadSessionId } from '@/lib/hooks/use-active-batch'
import { useLocations } from '@/lib/hooks/use-locations'
import { useAdaptiveThrottle } from '@/lib/hooks/use-adaptive-throttle'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Image as ImageIcon, FolderUp, Upload } from 'lucide-react'
import {
  createUploadLogger,
  createUploadMetrics,
  getUploadLogger,
  getUploadMetrics,
  removeUploadLogger,
  removeUploadMetrics,
} from '@/lib/upload'

import { retryFailedUploads } from '@/lib/upload/retry-failed'
import { runUploadSession } from '@/lib/upload/run'
import { createXhrTransfer } from '@/lib/upload/xhr-transfer'

export default function UploadPage(): React.JSX.Element {
  const router = useRouter()
  const [showUploadedPhotos] = useState(() => createUploadPhotoNavigator(href => router.push(href)))
  const [showReview, setShowReview] = useState(false)
  const queryClient = useQueryClient()

  // Debug logging state
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)

  // Upload mode state - default to bulk for 10K upload feature
  const [hasSimpleRun, setHasSimpleRun] = useState(false)
  const [uploadMode, setUploadMode] = useState<'bulk' | 'simple'>('bulk')

  // Initialize adaptive throttler for upload operations
  const throttle = useAdaptiveThrottle('upload')

  // Storage transfer shared with the folder uploader. The debug logger and metrics
  // of the current session observe every attempt through the transfer hooks.
  const [debugSession] = useState<{ id: string | null }>(() => ({ id: null }))
  const transfer = useMemo(() => createXhrTransfer({
    throttle,
    hooks: {
      onStart: (file, bytes) => { if (debugSession.id != null) getUploadLogger(debugSession.id)?.fileStart(file.id, file.filename, bytes) },
      onComplete: (file, durationMs, bytes) => {
        if (debugSession.id == null) return
        getUploadLogger(debugSession.id)?.fileComplete(file.id, durationMs, bytes)
        getUploadMetrics(debugSession.id)?.recordUpload(file.id, bytes, durationMs)
      },
      onFailed: (file, error, failure) => {
        if (debugSession.id == null) return
        const logger = getUploadLogger(debugSession.id)
        if (failure.event === 'http') logger?.fileFailed(file.id, error)
        else logger?.error(failure.event === 'timeout' ? 'Upload timeout' : 'Network error', undefined, { fileId: file.id, filename: file.filename, duration: failure.durationMs })
        getUploadMetrics(debugSession.id)?.recordError(file.id, failure.event === 'http' ? failure.kind : failure.event)
      },
    },
  }), [throttle, debugSession])

  const {
    isPreparing,
    isUploading,
    uploadQueue,
    pendingLocation,
    showLocationPicker,
    setPendingLocation,
    setShowLocationPicker,
  } = useUploadStore()

  // Fetch existing locations for dropdown in location picker
  const { data: locationsData, isPending: locationsLoading, isError: locationsError, refetch: reloadLocations } = useLocations()
  const existingLocations = locationsData?.locations ?? []

  // Handle files ready - show location picker
  const handleFilesReady = useCallback(() => {
    setShowLocationPicker(true)
  }, [setShowLocationPicker])

  // Handle location confirmed - convert modal LocationData to store LocationData
  const handleLocationConfirm = useCallback((location: LocationData) => {
    // Map modal LocationData to store LocationData (handling optional properties)
    setPendingLocation({
      ...(location.locationId !== undefined && { locationId: location.locationId }),
      lat: location.lat,
      lng: location.lng,
      areaName: location.areaName,
      ...(location.directionCompass !== undefined && { directionCompass: location.directionCompass }),
      ...(location.directionNotes !== undefined && { directionNotes: location.directionNotes }),
    })
    setShowLocationPicker(false)
    setShowReview(true)
  }, [setPendingLocation, setShowLocationPicker])

  // Handle location skipped
  const handleLocationSkip = useCallback(() => {
    setPendingLocation(null)
    setShowLocationPicker(false)
    setShowReview(true)
  }, [setPendingLocation, setShowLocationPicker])

  // Handle bulk upload complete
  const handleBulkUploadComplete = useCallback((sessionId: string) => {
    console.log(`[BulkUploader] Upload complete for session: ${sessionId}`)
    setCurrentSessionId(sessionId)
  }, [])

  const handleStartUpload = useCallback(async () => {
    const pendingFiles = useUploadStore.getState().uploadQueue.filter((f) => f.status === 'pending')
    if (pendingFiles.length === 0 || useUploadStore.getState().isPreparing || useUploadStore.getState().isUploading) return
    setHasSimpleRun(true)

    // Clean up any existing logger/metrics from previous session
    if (currentSessionId != null) {
      removeUploadLogger(currentSessionId)
      removeUploadMetrics(currentSessionId)
    }

    const location = pendingLocation
    // The debug logger and metrics are registry entries keyed by session id.
    const logger = (): ReturnType<typeof getUploadLogger> => debugSession.id == null ? undefined : getUploadLogger(debugSession.id)
    const metrics = (): ReturnType<typeof getUploadMetrics> => debugSession.id == null ? undefined : getUploadMetrics(debugSession.id)

    // The run itself (session, batches, transfer, handoff, close) is shared with
    // the folder uploader; this page only wires its debug instrumentation.
    const result = await runUploadSession({
      files: pendingFiles,
      transfer,
      throttle,
      location: () => location,
      onSession: (sessionId) => {
        debugSession.id = sessionId
        // Track this session for processing status bar (set once, not per-batch)
        setActiveUploadSessionId(sessionId)
        setCurrentSessionId(sessionId)
        createUploadLogger(sessionId).phase('init', { totalFiles: pendingFiles.length })
        createUploadMetrics(sessionId).startSession()
        showUploadedPhotos(sessionId)
      },
      onChunkStart: (index, chunk) => {
        if (index === 0) logger()?.phase('upload', { totalFiles: pendingFiles.length, chunkSize: chunk.length })
        logger()?.chunkStart(index, chunk.length)
      },
      onChunkComplete: (index, chunk, durationMs) => logger()?.chunkComplete(index, chunk.length, 0, durationMs),
      onBatchInitFailed: (_chunk, message) => logger()?.error('Batch init failed', new Error(message)),
    })

    if (result.status === 'cancelled') {
      if (result.byUser) setCurrentSessionId(null)
      return
    }
    if (result.status === 'failed') {
      // Files already carry their reasons; a run that could not start or finish
      // has something extra to record, and one that handed nothing off has no
      // gallery to refresh.
      if (result.reason === 'initialization') logger()?.error(result.message)
      if (result.reason === 'finalization') console.error('Could not close upload session', result.message)
      if (!result.handedOff) return
    }

    // Get final metrics summary
    const runMetrics = metrics()
    if (runMetrics) {
      runMetrics.endSession()
      const summary = runMetrics.getSummary()
      logger()?.phase('complete', {
        totalFiles: summary.totalFiles,
        successfulFiles: summary.successfulFiles,
        failedFiles: summary.failedFiles,
        totalBytes: summary.totalBytes,
        averageThroughputBps: summary.averageThroughputBps,
        peakThroughputBps: summary.peakThroughputBps,
        filesPerSecond: summary.filesPerSecond,
        peakMemoryMB: summary.peakMemoryMB,
      })
      logger()?.metric('average_throughput', summary.averageThroughputBps / (1024 * 1024), 'MB/s')
      logger()?.metric('peak_throughput', summary.peakThroughputBps / (1024 * 1024), 'MB/s')
      logger()?.metric('files_per_second', summary.filesPerSecond)
    } else {
      logger()?.phase('complete')
    }

    // Refresh photo list after all chunks and retries
    await queryClient.invalidateQueries({ queryKey: ['photos'] })
    await queryClient.invalidateQueries({ queryKey: ['upload-sessions'] })
    // Invalidate areas query if location was set (new area may have been added)
    if (location) {
      await queryClient.invalidateQueries({ queryKey: ['areas'] })
      await queryClient.invalidateQueries({ queryKey: ['locations'] })
      // Clear the pending location after successful upload
      setPendingLocation(null)
    }
  }, [queryClient, pendingLocation, setPendingLocation, transfer, throttle, currentSessionId, showUploadedPhotos, debugSession])

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <PageHeading eyebrow="Your next camera pull" title="Upload photos" description="Bring in your trail-camera photos and give each camera pull a place in your collection." actions={<Button variant="outline" asChild><Link href="/photos"><ImageIcon className="size-4" aria-hidden="true" />View photos</Link></Button>} />

      {/* Upload Section with Tabs */}
      <Card>
        <CardContent>
          <Tabs value={uploadMode} onValueChange={(v: string) => setUploadMode(v as 'bulk' | 'simple')}>
            <TabsList className="mb-6 grid h-auto w-full grid-cols-2">
              <TabsTrigger value="bulk" disabled={isPreparing || isUploading} className="min-h-11 gap-2">
                <FolderUp className="h-4 w-4" />
                Upload a folder
              </TabsTrigger>
              <TabsTrigger value="simple" disabled={isPreparing || isUploading} className="min-h-11 gap-2">
                <Upload className="h-4 w-4" />
                Choose photos
              </TabsTrigger>
            </TabsList>

            <TabsContent value="bulk" className="mt-0">
              <BulkUploader onUploadComplete={handleBulkUploadComplete} onUploadStarted={showUploadedPhotos} />
            </TabsContent>

            <TabsContent value="simple" className="mt-0">
              {!showReview && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate p-4"><div><p className="text-sm text-cream-dark">Photo group location</p><p className="text-cream">{pendingLocation?.areaName ?? 'No location assigned'}</p></div><Button variant="outline" onClick={() => setShowLocationPicker(true)}>Change location</Button></div>}
              <PhotoUploader
                onStartUpload={() => setShowReview(true)}
                onFilesReady={handleFilesReady}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Progress Panel - shown for simple upload mode */}
      {uploadMode === 'simple' && hasSimpleRun && <UploadProgressPanel onRetry={() => { void retryFailedUploads(transfer, currentSessionId ?? undefined, throttle).then(pending => { if (pending.length > 0) void handleStartUpload() }).catch(() => { /* Cancellation is already reflected in the upload store. */ }) }} />}

      <UploadReviewDialog
        open={showReview && !showLocationPicker && !isPreparing && !isUploading}
        count={uploadQueue.filter(file => file.status === 'pending').length}
        totalBytes={uploadQueue.filter(file => file.status === 'pending').reduce((sum, file) => sum + (file.file?.size ?? 0), 0)}
        locationName={pendingLocation?.areaName ?? null}
        onClose={() => setShowReview(false)}
        onChangeLocation={() => setShowLocationPicker(true)}
        onClear={() => { useUploadStore.getState().clearQueue(); setPendingLocation(null); setShowReview(false) }}
        onUpload={() => { setShowReview(false); void handleStartUpload() }}
      />

      {/* Location Picker Modal - used by simple upload */}
      <LocationPickerModal
        isOpen={showLocationPicker}
        photoCount={uploadQueue.filter(file => file.status === 'pending').length}
        onClose={() => setShowLocationPicker(false)}
        isLoading={locationsLoading}
        loadError={locationsError}
        onRetry={() => void reloadLocations()}
        onConfirm={handleLocationConfirm}
        onSkip={handleLocationSkip}
        existingLocations={existingLocations}
      />

    </div>
  )
}
