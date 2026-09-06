'use client'

import { useCallback, useState, useMemo, useRef, useEffect } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { Upload, Image as ImageIcon, X, FileImage, Trash2, HardDrive, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useUploadStore } from '@/lib/stores/upload'
import { useAdaptiveThrottle } from '@/lib/hooks/use-adaptive-throttle'
import { registerUploadRun, releaseUploadRun } from '@/lib/upload/active-run'
import { DuplicateChecker } from '@/lib/upload/dedup'
import { hashPhotoContent } from '@/lib/upload/content-hash'
import { extractMetadata } from '@/lib/image/exif'
import { cn } from '@/lib/utils'

const ACCEPTED_IMAGE_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/heic': ['.heic'],
  'image/webp': ['.webp'],
}

interface PhotoUploaderProps {
  onStartUpload?: () => void
  onFilesReady?: () => void
  className?: string
}

export function PhotoUploader({ onStartUpload, onFilesReady, className }: PhotoUploaderProps): React.JSX.Element {
  const { uploadQueue, addFiles, clearQueue, isUploading } = useUploadStore()
  const [rejectionWarning, setRejectionWarning] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 })

  // Progress tracking refs
  const progressCounterRef = useRef(0)
  const progressTotalRef = useRef(0)
  const rafIdRef = useRef<number | null>(null)
  const lastProgressTimeRef = useRef(0)

  // Lifecycle refs for async safety
  const isMountedRef = useRef(true)
  const isProcessingRef = useRef(false)

  const MIN_PROGRESS_INTERVAL_MS = 50 // Max 20 updates/sec - human-perceivable

  const scheduleProgressUpdate = useCallback(() => {
    // Bail if unmounted
    if (!isMountedRef.current) return

    const now = Date.now()
    const elapsed = now - lastProgressTimeRef.current

    // Skip if too soon and update already pending
    if (elapsed < MIN_PROGRESS_INTERVAL_MS && rafIdRef.current !== null) {
      return
    }

    // Cancel stale RAF if scheduling a new one
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
    }

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null
      lastProgressTimeRef.current = Date.now()

      // Double-check mount status before setState
      if (!isMountedRef.current) return

      setProcessingProgress({
        current: progressCounterRef.current,
        total: progressTotalRef.current,
      })
    })
  }, [])

  // Initialize adaptive throttler for EXIF processing
  const throttle = useAdaptiveThrottle('exif')

  // Calculate summary stats for pending files
  const pendingFiles = useMemo(
    () => uploadQueue.filter((f) => f.status === 'pending'),
    [uploadQueue]
  )

  const totalSize = useMemo(() => {
    return pendingFiles.reduce((sum, f) => sum + (f.file?.size ?? 0), 0)
  }, [pendingFiles])

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [])

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      // Clear any previous warnings
      setRejectionWarning(null)

      // Handle rejected files
      if (rejectedFiles.length > 0) {
        const rejectedCount = rejectedFiles.length
        setRejectionWarning(
          `${rejectedCount} file${rejectedCount > 1 ? 's' : ''} rejected. Only JPEG, PNG, HEIC, and WebP images up to 50 MB are accepted.`
        )

        // Auto-clear warning after 5 seconds
        setTimeout(() => setRejectionWarning(null), 5000)
      }

      // Process accepted files
      if (acceptedFiles.length > 0) {
        const runId = crypto.randomUUID()
        const controller = registerUploadRun(runId)
        setIsProcessing(true)
        isProcessingRef.current = true
        progressCounterRef.current = 0
        progressTotalRef.current = acceptedFiles.length
        lastProgressTimeRef.current = 0
        setProcessingProgress({ current: 0, total: acceptedFiles.length })

        try {
        // Start the session timer
        throttle.startSession()

        const processedFiles: Array<{
          file: File
          contentSha256: string
          capturedAt: Date | null
          make: string | null
          model: string | null
          deviceIdentifier: string | null
          exifSignature: string | null
          exifData: Record<string, unknown>
        }> = []

        // Process in adaptive batches - re-fetch batch size after each iteration
        let processedCount = 0

        // Per-file progress update (throttled via RAF)
        const incrementProgress = (): void => {
          if (!isProcessingRef.current) return
          progressCounterRef.current += 1
          scheduleProgressUpdate()
        }

        while (processedCount < acceptedFiles.length) {
          controller.signal.throwIfAborted()
          // Re-fetch batch size each iteration (adapts based on previous success/failure)
          const batchSize = 2
          const batch = acceptedFiles.slice(processedCount, processedCount + batchSize)

          console.log(`[Throttle] Processing batch of ${batch.length} (chunk size: ${batchSize}, processed: ${processedCount}/${acceptedFiles.length})`)

          const batchStartTime = Date.now()

          try {
            const batchResults = await Promise.allSettled(
              batch.map(async (file) => {
                const contentSha256 = await hashPhotoContent(file)
                // Extract EXIF metadata
                const metadata = await extractMetadata(file).catch((error) => {
                  console.error(`Failed to extract EXIF from ${file.name}:`, error)
                  return {
                    capturedAt: null,
                    make: null,
                    model: null,
                    deviceIdentifier: null,
                    exifSignature: null,
                    rawExif: {},
                  }
                })

                // Update progress after each file completes
                incrementProgress()

                return {
                  file,
                  contentSha256,
                  capturedAt: metadata.capturedAt,
                  make: metadata.make,
                  model: metadata.model,
                  deviceIdentifier: metadata.deviceIdentifier,
                  exifSignature: metadata.exifSignature,
                  exifData: metadata.rawExif,
                }
              })
            )

            const successful = batchResults.filter((result): result is PromiseFulfilledResult<(typeof processedFiles)[number]> => result.status === 'fulfilled')
            processedFiles.push(...successful.map(result => result.value))
            const unreadable = batchResults.length - successful.length
            if (unreadable !== 0) setRejectionWarning(`${unreadable} photo${unreadable === 1 ? '' : 's'} could not be read. Please select those files again.`)
            processedCount += batch.length

            // Record successful batch processing - this triggers AIMD to increase batch size
            const batchDuration = Date.now() - batchStartTime
            throttle.recordSuccess(batchDuration, batch.length)
          } catch (error) {
            console.error('Batch processing failed:', error)
            // Record failure - this triggers AIMD to decrease batch size
            throttle.recordFailure('unknown')
            // Still advance to avoid infinite loop
            processedCount += batch.length
          }
        }

        // Stop the session timer
        throttle.stopSession()

        controller.signal.throwIfAborted()
        // A repeat import compares original bytes, never camera filenames.
        const duplicates = await new DuplicateChecker().checkDuplicates(processedFiles.map(item => ({ filename: item.file.name, size: item.file.size, contentSha256: item.contentSha256 })))
        controller.signal.throwIfAborted()
        const seenHashes = new Set(duplicates.existingHashes ?? [])
        const uniqueFiles = processedFiles.filter(item => { if (seenHashes.has(item.contentSha256)) return false; seenHashes.add(item.contentSha256); return true })
        const existingQueue = useUploadStore.getState().uploadQueue
        if (existingQueue.length > 0 && existingQueue.every(file => file.status === 'completed' || file.status === 'failed')) clearQueue()
        addFiles(uniqueFiles)
        if (uniqueFiles.length < processedFiles.length) setRejectionWarning(`${processedFiles.length - uniqueFiles.length} duplicate photo${processedFiles.length - uniqueFiles.length === 1 ? '' : 's'} skipped.`)

        // Cleanup and ensure final state shows 100%
        isProcessingRef.current = false
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current)
          rafIdRef.current = null
        }
        if (isMountedRef.current) {
          setProcessingProgress({ current: acceptedFiles.length, total: acceptedFiles.length })
        }
        setIsProcessing(false)

        // Notify parent that files are ready (for location picker flow)
        if (onFilesReady && uniqueFiles.length > 0) {
          onFilesReady()
        }
        } catch (error) {
          setRejectionWarning(error instanceof Error ? error.message : 'Photo preparation failed. Please try again.')
        } finally {
          releaseUploadRun(runId)
          throttle.stopSession()
          isProcessingRef.current = false
          setIsProcessing(false)
        }
      }
    },
    [addFiles, clearQueue, onFilesReady, throttle, scheduleProgressUpdate]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted, rejected) => { void onDrop(accepted, rejected) },
    accept: ACCEPTED_IMAGE_TYPES,
    disabled: isUploading || isProcessing,
    multiple: true,
    maxSize: 50 * 1024 * 1024,
  })

  const handleStartUpload = (): void => {
    if (onStartUpload) {
      onStartUpload()
    }
  }

  const queueCount = pendingFiles.length

  return (
    <div className={cn('w-full', className)}>
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          'relative rounded-lg border-2 border-dashed transition-all duration-200',
          'flex flex-col items-center justify-center',
          'min-h-[280px] p-8 cursor-pointer',
          isDragActive
            ? 'border-copper bg-copper/5 scale-[1.02]'
            : 'border-slate hover:border-copper/50 bg-slate-deep/50',
          (isUploading || isProcessing) && 'cursor-not-allowed pointer-events-none'
        )}
      >
        <input {...getInputProps()} />

        {/* Icon */}
        <div
          className={cn(
            'mb-4 rounded-full p-4 transition-all duration-200',
            isDragActive ? 'bg-copper/20' : 'bg-slate'
          )}
        >
          {isDragActive ? (
            <Upload className="h-8 w-8 text-copper" />
          ) : (
            <ImageIcon className="h-8 w-8 text-cream-dark" />
          )}
        </div>

        {/* Text */}
        <div className="text-center">
          <p className="text-lg font-medium text-cream mb-2">
            {isDragActive ? 'Drop photos here' : 'Drag & drop photos here'}
          </p>
          <p className="text-sm text-cream-dark mb-4">
            or click to browse your files
          </p>
          <p className="text-xs text-cream-dark/70">
            JPEG, PNG, HEIC, and WebP · Up to 50 MB per photo
          </p>
        </div>

        {/* Queue count badge */}
        {queueCount > 0 && !isUploading && (
          <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-copper/20 border border-copper/30">
            <ImageIcon className="h-4 w-4 text-copper" />
            <span className="text-sm font-medium text-copper">
              {queueCount} {queueCount === 1 ? 'photo' : 'photos'} queued
            </span>
          </div>
        )}

        {/* Processing state - shown while extracting EXIF and generating thumbnails */}
        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-deep/90 rounded-lg">
            <div className="text-center w-64">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-copper mx-auto" />
              <p className="text-sm font-medium text-cream mb-2">
                Preparing your photo group…
              </p>
              <p className="text-xs text-cream-dark mb-3">
                {processingProgress.current} of {processingProgress.total} files
              </p>
              <Progress
                value={(processingProgress.current / processingProgress.total) * 100}
                className="h-2"
              />
            </div>
          </div>
        )}

        {/* Uploading state */}
        {isUploading && !isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-deep/80 rounded-lg">
            <div className="text-center">
              <div className="mb-3 inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-copper" />
              <p className="text-sm font-medium text-cream">Uploading photos...</p>
            </div>
          </div>
        )}
      </div>

      {/* Rejection warning */}
      {(rejectionWarning != null) && (
        <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <X className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">{rejectionWarning}</p>
        </div>
      )}

      {/* Upload Summary Card */}
      {queueCount > 0 && !isUploading && (
        <Card className="mt-4 border-copper/30 bg-slate/50">
          <CardContent className="pt-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              {/* Summary Info */}
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-copper/20 p-2">
                    <FileImage className="h-5 w-5 text-copper" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-cream">
                      {queueCount} {queueCount === 1 ? 'photo' : 'photos'} ready
                    </p>
                    <p className="text-xs text-cream-dark">
                      Selected for upload
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-slate p-2">
                    <HardDrive className="h-5 w-5 text-cream-dark" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-cream">
                      {formatFileSize(totalSize)}
                    </p>
                    <p className="text-xs text-cream-dark">
                      Total size
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => clearQueue()}
                  className="text-cream-dark hover:text-cream hover:bg-slate"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Clear
                </Button>
                <Button
                  onClick={handleStartUpload}
                  className="bg-copper hover:bg-copper-light text-slate-deep font-medium"
                >
                  <Upload className="h-4 w-4 mr-1" />
                  Review & upload
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
