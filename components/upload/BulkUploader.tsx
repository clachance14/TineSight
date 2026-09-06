'use client'

/**
 * BulkUploader Component
 *
 * Main bulk upload component that orchestrates:
 * - File/folder selection with webkitdirectory
 * - EXIF extraction via ExifWorkerPool
 * - Chunked batch uploading with pipelining
 * - Realtime status updates
 *
 * Features per research.md:
 * - Pipelining: Fetch URLs for chunk N+1 while uploading chunk N
 * - Memory efficient: EXIF extraction uses 128KB slices
 * - Duplicate detection: Skip files that already exist
 */

import Link from 'next/link'
import { useCallback, useRef, useState, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FolderOpen, Upload, X, FileImage, Loader2, CheckCircle2, AlertTriangle, AlertCircle, FolderUp } from 'lucide-react'
import { UploadReviewDialog } from '@/components/upload/upload-review-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ProcessingStatusBar } from '@/components/photos/processing-status-bar'
import { Progress } from '@/components/ui/progress'
import { useUploadStore, type UploadFile } from '@/lib/stores/upload'
import { setActiveUploadSessionId } from '@/lib/hooks/use-active-batch'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { useRealtimePhotos } from '@/lib/hooks/use-realtime-photos'
import { useAdaptiveThrottle } from '@/lib/hooks/use-adaptive-throttle'
import { requireUploadFile } from '@/lib/upload/transfer'
import { retryFailedUploads } from '@/lib/upload/retry-failed'
import { readOriginalHash, recordPreparationFailures, type PreparationFailure } from '@/lib/upload/preparation'
import { ExifWorkerPool } from '@/lib/upload/ExifWorkerPool'
import { DuplicateChecker } from '@/lib/upload/dedup'
import { UPLOAD_CONFIG, SUPPORTED_MIME_TYPES, isSupportedMimeType } from '@/lib/upload/config'
import { cn } from '@/lib/utils'
import { registerUploadRun, releaseUploadRun, isUserUploadCancellation, USER_UPLOAD_CANCELLED } from '@/lib/upload/active-run'
import { runUploadSession, type UploadRunLocation } from '@/lib/upload/run'
import { createXhrTransfer } from '@/lib/upload/xhr-transfer'
import { useCameras } from '@/lib/hooks/use-cameras'
import { useLocations } from '@/lib/hooks/use-locations'
import { LocationPickerModal, type LocationData } from '@/components/photos/location-picker-modal'
import type { ExifData } from '@/lib/upload/ExifWorkerPool'

interface BulkUploaderProps {
  onUploadComplete?: (sessionId: string) => void
  onUploadStarted?: (sessionId: string) => void
  className?: string
}

interface ProcessedFile {
  contentSha256: string
  id: string
  file: File
  filename: string
  exifData: ExifData | null
  capturedAt: Date | null
  make: string | null
  model: string | null
  deviceIdentifier: string | null
  exifSignature: string | null
}

type UploadStage = 'idle' | 'selecting' | 'extracting' | 'checking-duplicates' | 'uploading' | 'complete' | 'cancelled' | 'error'


export function BulkUploader({ onUploadComplete, onUploadStarted, className }: BulkUploaderProps): React.JSX.Element {
  const queryClient = useQueryClient()
  const { data: locationsData, isPending: locationsLoading, isError: locationsError, refetch: reloadLocations } = useLocations()
  const { data: camerasData } = useCameras()
  const folderPaths = useRef(new WeakMap<File, string>())
  const [sourceAssignments, setSourceAssignments] = useState<Record<string, { cameraId?: string; locationId?: string }>>({})
  const sourceFor = useCallback((file: File) => {
    const path = folderPaths.current.get(file) ?? file.webkitRelativePath
    return path?.includes('/') ? path.slice(0, path.lastIndexOf('/')) : 'Selected files'
  }, [])
  const [reviewDismissed, setReviewDismissed] = useState(false)
  const [locationReviewed, setLocationReviewed] = useState(false)
  const [showLocationPicker, setShowLocationPicker] = useState(false)
  const uploadLocationRef = useRef<LocationData | null>(null)
  const { userId } = useCurrentUser()

  // Realtime subscription for live status updates
  const { isConnected: realtimeConnected, lastUpdate: realtimeLastUpdate } = useRealtimePhotos({
    userId,
    enabled: userId.length > 0,
  })

  // Refs for upload management
  const exifPoolRef = useRef<ExifWorkerPool | null>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Local state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [, setProcessedFiles] = useState<ProcessedFile[]>([])
  const [stage, setStage] = useState<UploadStage>('idle')
  const [extractionProgress, setExtractionProgress] = useState({ current: 0, total: 0 })
  const [, setDuplicateCount] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const [failedFilesList, setFailedFilesList] = useState<Array<{ filename: string; error: string }>>([])

  // Throttle for uploads
  const throttle = useAdaptiveThrottle('upload')

  // Upload store
  const {
    addFiles,
    clearQueue,
    setIsPreparing,
    isUploading,
    completedCount,
    failedCount,
    totalCount,
  } = useUploadStore()

  useEffect(() => {
    const resetAccount = (): void => {
      setSelectedFiles([])
      setLocationReviewed(false)
      uploadLocationRef.current = null
      setSourceAssignments({})
      setShowLocationPicker(false)
      setStage('idle')
      setSessionId(null)
    }
    window.addEventListener('tinesight:account-changed', resetAccount)
    return () => window.removeEventListener('tinesight:account-changed', resetAccount)
  }, [])

  // Calculate total size of selected files
  const totalSize = useMemo(() => {
    return selectedFiles.reduce((sum, f) => sum + f.size, 0)
  }, [selectedFiles])

  const sourceFolders = useMemo(() => [...new Set(selectedFiles.map(sourceFor))], [selectedFiles, sourceFor])

  // Filter files to only include supported types
  const filterSupportedFiles = useCallback((files: FileList | File[]): File[] => {
    const fileArray = Array.from(files)
    return fileArray.filter((file) => {
      if (file.size <= 0 || file.size > 50 * 1024 * 1024) return false
      // Check MIME type
      if ((file.type !== "") && isSupportedMimeType(file.type)) {
        return true
      }
      // Fallback: check extension for files without MIME type
      const ext = file.name.toLowerCase().split('.').pop()
      return ext !== undefined && ['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(ext)
    })
  }, [])

  // Extract files from DataTransfer (handles both files and folders)
  const getFilesFromDataTransfer = useCallback(async (dataTransfer: DataTransfer): Promise<File[]> => {
    // Helper to recursively read files from a directory entry (defined inside to avoid hook issues)
    const readDirectoryEntries = async (dirEntry: FileSystemDirectoryEntry): Promise<File[]> => {
      const files: File[] = []
      const reader = dirEntry.createReader()

      // readEntries may not return all entries at once, so we need to call it repeatedly
      const readAllEntries = (): Promise<FileSystemEntry[]> => {
        return new Promise((resolve, reject) => {
          const allEntries: FileSystemEntry[] = []

          const readBatch = (): void => {
            reader.readEntries(
              (entries) => {
                if (entries.length === 0) {
                  resolve(allEntries)
                } else {
                  allEntries.push(...entries)
                  readBatch()
                }
              },
              reject
            )
          }

          readBatch()
        })
      }

      const entries = await readAllEntries()

      for (const entry of entries) {
        if (entry.isFile) {
          const fileEntry = entry as FileSystemFileEntry
          const file = await new Promise<File>((resolve, reject) => {
            fileEntry.file(resolve, reject)
          })
          folderPaths.current.set(file, entry.fullPath)
          files.push(file)
        } else if (entry.isDirectory) {
          const subFiles = await readDirectoryEntries(entry as FileSystemDirectoryEntry)
          files.push(...subFiles)
        }
      }

      return files
    }

    const files: File[] = []
    const items = Array.from(dataTransfer.items)

    for (const item of items) {
      if (item.kind !== 'file') continue

      // Try to get as entry for folder support
      const entry = item.webkitGetAsEntry?.()

      if (entry !== null && entry !== undefined) {
        if (entry.isDirectory) {
          const dirFiles = await readDirectoryEntries(entry as FileSystemDirectoryEntry)
          files.push(...dirFiles)
        } else if (entry.isFile) {
          const file = item.getAsFile()
          if (file !== null) files.push(file)
        }
      } else {
        // Fallback for browsers without webkitGetAsEntry
        const file = item.getAsFile()
        if (file !== null) files.push(file)
      }
    }

    return files
  }, [])

  // Handle folder selection
  const handleFolderSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setErrorMessage(null)
    setStage('selecting')

    const supportedFiles = filterSupportedFiles(files)
    event.target.value = ''
    if (supportedFiles.length < files.length) setErrorMessage(`${files.length - supportedFiles.length} files skipped. Choose JPEG, PNG, HEIC or WebP photos between 1 byte and 50 MB.`)

    if (supportedFiles.length === 0) {
      setErrorMessage('No supported image files found in the selected folder. Supported formats: JPEG, PNG, HEIC, WebP.')
      setStage('idle')
      return
    }

    setSelectedFiles(supportedFiles)
    setSourceAssignments({})
    uploadLocationRef.current = null
    setLocationReviewed(false)
    setShowLocationPicker(true)
    setStage('idle')

    // Clear the input so the same folder can be selected again
    event.target.value = ''
  }, [filterSupportedFiles])

  // Handle file selection (multiple files)
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setErrorMessage(null)
    setStage('selecting')

    const supportedFiles = filterSupportedFiles(files)
    event.target.value = ''
    if (supportedFiles.length < files.length) setErrorMessage(`${files.length - supportedFiles.length} files skipped. Choose JPEG, PNG, HEIC or WebP photos between 1 byte and 50 MB.`)

    if (supportedFiles.length === 0) {
      setErrorMessage('No supported image files found. Supported formats: JPEG, PNG, HEIC, WebP.')
      setStage('idle')
      return
    }

    setSelectedFiles(supportedFiles)
    setSourceAssignments({})
    uploadLocationRef.current = null
    setLocationReviewed(false)
    setShowLocationPicker(true)
    setStage('idle')

    // Clear the input so the same files can be selected again
    event.target.value = ''
  }, [filterSupportedFiles])

  // Clear selected files
  const handleClear = useCallback(() => {
    setSelectedFiles([])
    setLocationReviewed(false)
    uploadLocationRef.current = null
    setSourceAssignments({})
    setProcessedFiles([])
    setDuplicateCount(0)
    setSkippedCount(0)
    setStage('idle')
    setErrorMessage(null)
    setFailedFilesList([])
    clearQueue()
  }, [clearQueue])

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set inactive if leaving the container (not entering a child)
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragActive(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)

    if (e.dataTransfer === null || stage !== 'idle' || isUploading) return

    setErrorMessage(null)
    setStage('selecting')

    try {
      const droppedFiles = await getFilesFromDataTransfer(e.dataTransfer)
      const supportedFiles = filterSupportedFiles(droppedFiles)
      if (supportedFiles.length < droppedFiles.length) setErrorMessage(`${droppedFiles.length - supportedFiles.length} files skipped. Choose JPEG, PNG, HEIC or WebP photos between 1 byte and 50 MB.`)

      if (supportedFiles.length === 0) {
        setErrorMessage('No supported image files found. Supported formats: JPEG, PNG, HEIC, WebP.')
        setStage('idle')
        return
      }

      setSelectedFiles(supportedFiles)
      setSourceAssignments({})
      uploadLocationRef.current = null
      setLocationReviewed(false)
      setShowLocationPicker(true)
      setStage('idle')
    } catch (error) {
      console.error('Error processing dropped files:', error)
      setErrorMessage('Failed to process dropped files. Please try again.')
      setStage('idle')
    }
  }, [getFilesFromDataTransfer, filterSupportedFiles, stage, isUploading])

  // Storage transfer shared with the simple uploader; progress and throttle
  // accounting live inside it.
  const transfer = useMemo(() => createXhrTransfer({ throttle }), [throttle])

  const showCancelled = useCallback((): void => {
    setFailedFilesList([])
    setErrorMessage(null)
    setStage('cancelled')
    setSessionId(null)
  }, [])

  // Main upload handler
  const handleStartUpload = useCallback(async (files = selectedFiles) => {
    if (files.length === 0) return

    setErrorMessage(null)
    const runId = crypto.randomUUID()
    const controller = registerUploadRun(runId)
    let runStarted = false

    try {
      setIsPreparing(true)
      // Step 1: Initialize EXIF worker pool
      setStage('extracting')
      exifPoolRef.current ??= new ExifWorkerPool();
      const pool = exifPoolRef.current

      // Step 2: Extract EXIF metadata from all files
      setExtractionProgress({ current: 0, total: files.length })
      const processed: ProcessedFile[] = []
      const preparationFailures: PreparationFailure[] = []

      for (let i = 0; i < files.length; i++) {
        controller.signal.throwIfAborted()
        const file = files[i]
        if (file === undefined) continue
        const hashResult = await readOriginalHash(file)
        controller.signal.throwIfAborted()
        if (hashResult.failure !== undefined) {
          preparationFailures.push(hashResult.failure)
          setExtractionProgress({ current: i + 1, total: files.length })
          continue
        }
        const contentSha256 = hashResult.hash
        const fileId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

        try {
          // Slice file for EXIF extraction (first 128KB)
          const slice = await file.slice(0, UPLOAD_CONFIG.EXIF_SLICE_SIZE).arrayBuffer()
          const exifData = await pool.extractExif(fileId, slice)

          // Parse captured date from EXIF
          let capturedAt: Date | null = null
          if (exifData?.dateTimeOriginal !== undefined) {
            capturedAt = exifData.dateTimeOriginal instanceof Date
              ? exifData.dateTimeOriginal
              : new Date(exifData.dateTimeOriginal)
          }

          if (capturedAt && Number.isNaN(capturedAt.getTime())) capturedAt = null

          // Create device identifier
          const deviceIdentifier = exifData?.serialNumber ?? null

          processed.push({
            id: fileId,
            contentSha256,
            file,
            filename: file.name,
            exifData,
            capturedAt,
            make: exifData?.make ?? null,
            model: exifData?.model ?? null,
            deviceIdentifier,
            exifSignature: null, // Could compute hash if needed
          })
        } catch (error) {
          console.warn(`Failed to extract EXIF from ${file.name}:`, error)
          // Still include the file, just without EXIF
          processed.push({
            id: fileId,
            contentSha256,
            file,
            filename: file.name,
            exifData: null,
            capturedAt: null,
            make: null,
            model: null,
            deviceIdentifier: null,
            exifSignature: null,
          })
        }

        setExtractionProgress({ current: i + 1, total: files.length })
      }

      setProcessedFiles(processed)

      // Step 3: Check for duplicates
      setStage('checking-duplicates')
      const checker = new DuplicateChecker()
      const duplicateCheck = await checker.checkDuplicates(
        processed.map((f) => ({ filename: f.filename, size: f.file.size, contentSha256: f.contentSha256 }))
      )

      setDuplicateCount(duplicateCheck.duplicateCount)

      // Preserve same-name files from different camera folders.
      const existingSet = new Set(duplicateCheck.existingHashes ?? [])
      const filesToUpload = processed.filter((f) => {
        if (existingSet.has(f.contentSha256)) return false
        existingSet.add(f.contentSha256)
        return true
      })
      setSkippedCount(processed.length - filesToUpload.length)

      if (filesToUpload.length === 0) {
        controller.signal.throwIfAborted()
        clearQueue()
        recordPreparationFailures(preparationFailures)
        setFailedFilesList(preparationFailures.map(({file,error}) => ({ filename: file.name, error })))
        setStage('complete')
        return
      }

      controller.signal.throwIfAborted()
      // Step 4: Create upload session
      setStage('uploading')
      // A new run has its own progress totals.
      const previousQueue = useUploadStore.getState().uploadQueue
      if (previousQueue.length > 0 && previousQueue.every(file => file.status === 'completed' || file.status === 'failed')) clearQueue()
      // Add files to upload store
      addFiles(filesToUpload.map((f) => ({
        file: f.file,
        contentSha256: f.contentSha256,
        cameraId: sourceAssignments[sourceFor(f.file)]?.cameraId ?? null,
        locationId: sourceAssignments[sourceFor(f.file)]?.locationId ?? null,
        sourceFolder: sourceFor(f.file),
        capturedAt: f.capturedAt,
        make: f.make,
        model: f.model,
        deviceIdentifier: f.deviceIdentifier,
        exifSignature: f.exifSignature,
        ...(f.exifData !== null && { exifData: f.exifData as Record<string, unknown> }),
      })))

      recordPreparationFailures(preparationFailures)
      setFailedFilesList(preparationFailures.map(({file,error}) => ({ filename: file.name, error })))

      // Get files from the store (they now have IDs)
      const pendingFiles = useUploadStore.getState().uploadQueue.filter((f) => f.status === 'pending')

      // Keep one historical location per batch; transport chunk boundaries must
      // never mix assigned camera deployments (see groupKey below).
      const locationFor = (chunk: UploadFile[]): UploadRunLocation | null => {
        const groupLocationId = chunk[0]?.locationId
        const groupLocation = locationsData?.locations.find(location => location.id === groupLocationId)
        if (groupLocation) {
          return { locationId: groupLocation.id, lat: groupLocation.lat, lng: groupLocation.lng, areaName: groupLocation.name, ...(groupLocation.direction_compass != null && { directionCompass: groupLocation.direction_compass }), ...(groupLocation.direction_notes != null && { directionNotes: groupLocation.direction_notes }) }
        }
        const chosen = uploadLocationRef.current
        if (groupLocationId === '__none__' || chosen === null) return null
        // The picker's shape allows explicit undefined; the run's (the store's) does not.
        return {
          lat: chosen.lat,
          lng: chosen.lng,
          areaName: chosen.areaName,
          ...(chosen.locationId !== undefined && { locationId: chosen.locationId }),
          ...(chosen.directionCompass !== undefined && { directionCompass: chosen.directionCompass }),
          ...(chosen.directionNotes !== undefined && { directionNotes: chosen.directionNotes }),
        }
      }

      // Step 4-6: the run itself (session, batches, transfer, handoff, close) is
      // shared with the simple uploader; this component only presents its outcome.
      runStarted = true
      const result = await runUploadSession({
        files: pendingFiles,
        transfer,
        throttle,
        runId,
        controller,
        groupKey: file => file.locationId ?? '',
        location: locationFor,
        onSession: id => { setSessionId(id); setActiveUploadSessionId(id); onUploadStarted?.(id) },
        onBatchInitFailed: (chunk, message) => setFailedFilesList(prev => [...prev, ...chunk.map(file => ({ filename: file.filename, error: message }))]),
        onFileFailed: (file, error) => setFailedFilesList(prev => [...prev, { filename: file.filename, error }]),
      })

      if (result.status === 'cancelled') {
        if (result.byUser) showCancelled()
        return
      }
      // Photos that reached processing are in the gallery whatever the outcome.
      if (result.handedOff) {
        await queryClient.invalidateQueries({ queryKey: ['photos'] })
        await queryClient.invalidateQueries({ queryKey: ['upload-sessions'] })
      }
      if (result.status === 'failed') {
        setStage('error')
        setErrorMessage(result.message)
        return
      }
      setStage('complete')
      if (result.sessionId !== null && onUploadComplete) onUploadComplete(result.sessionId)
    } catch (error) {
      // Only preparation throws here; the run settles its own outcome.
      if (controller.signal.aborted) {
        if (isUserUploadCancellation(controller.signal)) showCancelled()
        return
      }
      console.error('Bulk upload failed:', error)
      setStage('error')
      setErrorMessage(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      // The run releases its own registration and clears the preparing flag; a
      // preparation-only exit (its files never entered the store) does both here.
      if (!runStarted) {
        releaseUploadRun(runId)
        setIsPreparing(false)
      }
      exifPoolRef.current?.terminate()
      exifPoolRef.current = null
    }
  }, [
    selectedFiles,
    sourceAssignments,
    sourceFor,
    locationsData,
    addFiles,
    clearQueue,
    setIsPreparing,
    queryClient,
    throttle,
    transfer,
    onUploadComplete,
    onUploadStarted,
    showCancelled,
  ])

  const handleRetryFailed = async (): Promise<void> => {
    setFailedFilesList([])
    setStage('uploading')
    if (sessionId != null) setActiveUploadSessionId(sessionId)
    try {
    const pending = await retryFailedUploads(transfer, sessionId ?? undefined, throttle)
    if (pending.length > 0) {
      clearQueue()
      await handleStartUpload(pending.map(requireUploadFile))
    } else {
      const remaining = useUploadStore.getState().uploadQueue.filter(file => file.status === 'failed')
      setFailedFilesList(remaining.map(file => ({filename:file.filename,error:file.error ?? 'Upload failed'})))
      setStage('complete')
    }
    } catch (error) {
      if (error === USER_UPLOAD_CANCELLED) showCancelled()
      else if (error instanceof DOMException && error.name === 'AbortError') return
      else { setErrorMessage(error instanceof Error ? error.message : 'Retry failed'); setStage('error') }
    }
  }

  // Render stage-specific content
  const renderContent = (): React.JSX.Element | null => {
    if (stage === 'cancelled') return (
      <div className="py-8 text-center">
        <p className="text-lg font-medium text-cream">Upload cancelled</p>
        <p className="mt-2 text-sm text-cream-dark">No more files will be uploaded. View Photos to see the photos you kept.</p>
        <Button className="mt-4" onClick={handleClear}>Choose new photos</Button>
      </div>
    )
    if (stage === 'selecting') return <p role="status" className="py-8 text-center">Reading your photo group…</p>
    if (stage === 'extracting') {
      return (
        <div role="status" className="text-center py-8">
          <Loader2 className="mb-4 h-10 w-10 animate-spin text-copper mx-auto" />
          <p className="text-lg font-medium text-cream mb-2">
            Preparing your photos…
          </p>
          <p className="text-sm text-cream-dark mb-4">
            {extractionProgress.current} of {extractionProgress.total} files
          </p>
          <Progress
            value={(extractionProgress.current / extractionProgress.total) * 100}
            className="h-2 max-w-xs mx-auto"
          />
        </div>
      )
    }

    if (stage === 'checking-duplicates') {
      return (
        <div role="status" className="text-center py-8">
          <Loader2 className="mb-4 h-10 w-10 animate-spin text-copper mx-auto" />
          <p className="text-lg font-medium text-cream">
            Checking for photos already in your collection…
          </p>
        </div>
      )
    }

    if (stage === 'uploading' || isUploading) {
      // Calculate completion progress to match the text (completed/total)
      const completionProgress = totalCount > 0
        ? Math.round(((completedCount + failedCount) / totalCount) * 100)
        : 0

      return (
        <div role="status" className="text-center py-8">
          <Loader2 className="mb-4 h-10 w-10 animate-spin text-copper mx-auto" />
          <p className="text-lg font-medium text-cream mb-2">
            Uploading photos...
          </p>
          <p className="text-sm text-cream-dark mb-4">
            {completedCount} of {totalCount} complete
            {failedCount > 0 && ` (${failedCount} failed)`}
          </p>
          <Progress
            value={completionProgress}
            className="h-2 max-w-xs mx-auto"
          />
          {realtimeConnected && (
            <p className="mt-4 text-xs text-cream-dark/70 flex items-center justify-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
              Live updates enabled
              {realtimeLastUpdate && ` - Last update: ${realtimeLastUpdate.toLocaleTimeString()}`}
            </p>
          )}
        </div>
      )
    }

    if (stage === 'complete') {
      const hasFailures = failedCount > 0

      return (
        <div role="status" className="text-center py-6">
          {hasFailures ? (
            <AlertTriangle className="mb-3 h-10 w-10 text-yellow-500 mx-auto" />
          ) : (
            <CheckCircle2 className="mb-3 h-10 w-10 text-green-500 mx-auto" />
          )}
          <p className="text-lg font-medium text-cream mb-1">
            {skippedCount > 0 && skippedCount === selectedFiles.length ? 'Already uploaded' : hasFailures ? 'Upload completed with errors' : 'Upload complete!'}
          </p>
          <p className="text-sm text-cream-dark mb-4">
            {skippedCount > 0 && skippedCount === selectedFiles.length
              ? `All ${skippedCount} photos already exist.`
              : `${completedCount} photos uploaded successfully${skippedCount > 0 ? `, ${skippedCount} duplicates skipped` : ''}`}
          </p>

          {completedCount > 0 && <p className="mb-4 text-sm text-cream-dark">Your photos are saved. Analysis continues in the background.</p>}
          <Button asChild className="mb-4"><Link href="/photos">View photos</Link></Button>
          {/* Failed files list */}
          {hasFailures && failedFilesList.length > 0 && (
            <div className="mb-4 text-left max-w-md mx-auto">
              <details className="group">
                <summary className="flex items-center gap-2 text-sm text-yellow-500 cursor-pointer hover:text-yellow-400">
                  <AlertCircle className="h-4 w-4" />
                  <span>{failedCount} file{failedCount > 1 ? 's' : ''} failed to upload</span>
                </summary>
                <div className="mt-2 max-h-32 overflow-y-auto rounded-md bg-slate/50 p-2 text-xs">
                  {failedFilesList.slice(0, 10).map((f, i) => (
                    <div key={i} className="py-1 border-b border-slate last:border-0">
                      <span className="text-cream truncate block">{f.filename}</span>
                      <span className="text-cream-dark/70">{f.error}</span>
                    </div>
                  ))}
                  {failedFilesList.length > 10 && (
                    <div className="py-1 text-cream-dark/70">
                      ...and {failedFilesList.length - 10} more
                    </div>
                  )}
                </div>
              </details>
            </div>
          )}

          {hasFailures && <Button onClick={() => void handleRetryFailed()} className="mr-2">Retry failed photos</Button>}
          <Button
            onClick={handleClear}
            variant="outline"
          >
            Upload More
          </Button>
        </div>
      )
    }

    if (stage === 'error') {
      return (
        <div role="status" className="text-center py-8">
          <AlertCircle className="mb-4 h-10 w-10 text-destructive mx-auto" />
          <p className="text-lg font-medium text-cream mb-2">
            Upload failed
          </p>
          <p className="text-sm text-destructive mb-4">
            {errorMessage}
          </p>
          <Button
            onClick={failedCount > 0 ? () => void handleRetryFailed() : handleClear}
            variant="outline"
          >
            {failedCount > 0 ? 'Retry failed photos' : 'Try Again'}
          </Button>
        </div>
      )
    }

    // Default: file/folder selection UI
    return (
      <div className="flex flex-col items-center justify-center min-h-[180px] p-4 sm:p-6">
        {/* Hidden inputs */}
        <input
          ref={folderInputRef}
          type="file"
          aria-label="Choose photo folder"
          className="hidden"
          onChange={handleFolderSelect}
          accept={SUPPORTED_MIME_TYPES.join(',')}
          // @ts-expect-error - webkitdirectory is not in the type definitions
          webkitdirectory=""
          directory=""
          multiple
        />
        <input
          ref={fileInputRef}
          aria-label="Choose photo files"
          type="file"
          className="hidden"
          onChange={handleFileSelect}
          accept={SUPPORTED_MIME_TYPES.join(',')}
          multiple
        />

        {/* Icon */}
        <div className="mb-3 rounded-full p-3 bg-slate">
          <FolderUp className="h-6 w-6 text-cream-dark" />
        </div>

        {/* Text */}
        <div className="text-center mb-3">
          <p className="text-base font-medium text-cream mb-1">
            {selectedFiles.length > 0 ? 'Replace this photo group' : 'Add a camera pull'}
          </p>
          <p className="text-sm text-cream-dark">
            {selectedFiles.length > 0 ? 'Choosing again replaces the selected photos and resets their location choices.' : 'Choose files from your device, or drop a folder here.'}
          </p>
          <p className="text-xs text-cream-dark/70">
            JPEG, PNG, HEIC, WebP · Up to 50 MB per photo
          </p>
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => folderInputRef.current?.click()}
            className="min-h-11 gap-1.5"
          >
            <FolderOpen className="h-4 w-4" />
            Select Folder
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-11 gap-1.5"
          >
            <FileImage className="h-4 w-4" />
            Select Files
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <ProcessingStatusBar />
      <LocationPickerModal isOpen={showLocationPicker} photoCount={selectedFiles.length} isLoading={locationsLoading} loadError={locationsError} onRetry={() => void reloadLocations()} existingLocations={locationsData?.locations ?? []} onClose={() => setShowLocationPicker(false)} onConfirm={(location) => { uploadLocationRef.current = location; setLocationReviewed(true); setReviewDismissed(false); setShowLocationPicker(false) }} onSkip={() => { uploadLocationRef.current = null; setLocationReviewed(true); setReviewDismissed(false); setShowLocationPicker(false) }} />
    <div className={cn('w-full', className)}>
      <ol aria-label="Upload steps" className="mb-5 grid grid-cols-3 gap-2 text-sm">
        {['Choose photos', 'Set location', 'Review & upload'].map((label, index) => {
          const current = selectedFiles.length === 0 ? 0 : locationReviewed ? 2 : 1
          return <li key={label} aria-current={index === current ? 'step' : undefined} className={cn('rounded-lg border p-3', index === current ? 'border-copper/50 bg-copper/10 text-cream' : 'border-slate text-cream-dark')}><span className="block text-xs mb-1">Step {index + 1}</span>{label}</li>
        })}
      </ol>
      <Card
        className={cn(
          'border-dashed border-2 transition-all relative',
          selectedFiles.length > 0 && stage === 'idle' && 'hidden',
          isDragActive
            ? 'border-copper bg-copper/5 scale-[1.01]'
            : 'border-slate hover:border-copper/50'
        )}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(event) => { void handleDrop(event) }}
      >
        <CardContent className="pt-6">
          {renderContent()}
        </CardContent>

        {/* Drag overlay */}
        {isDragActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-deep/90 rounded-lg pointer-events-none z-10">
            <div className="text-center">
              <div className="mb-4 rounded-full p-4 bg-copper/20 mx-auto w-fit">
                <Upload className="h-8 w-8 text-copper" />
              </div>
              <p className="text-lg font-medium text-cream mb-2">
                Drop files or folders here
              </p>
              <p className="text-sm text-cream-dark">
                Release to add photos
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Error message */}
      {(errorMessage != null) && stage === 'idle' && (
        <div role="alert" className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <X className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">{errorMessage}</p>
        </div>
      )}

      {selectedFiles.length > 0 && stage === 'idle' && (!locationReviewed || reviewDismissed) && <div className="rounded-lg border border-copper/30 p-4">
        <p className="mb-3 font-medium text-cream">{selectedFiles.length} {selectedFiles.length === 1 ? 'photo' : 'photos'} selected</p>
        <div className="flex gap-2"><Button className="flex-1" onClick={() => locationReviewed ? setReviewDismissed(false) : setShowLocationPicker(true)}>{locationReviewed ? 'Review & upload' : 'Continue to location'}</Button><Button variant="ghost" onClick={handleClear}>Clear</Button></div>
        {!locationReviewed && <details className="py-3">
          <summary className="cursor-pointer text-sm text-cream">Different locations in this group? Assign by folder</summary>
          <p className="mt-2 text-sm text-cream-dark">Choose where each camera was placed for this upload. Photos keep that location when cameras move.</p>
          <div className="mt-3 space-y-3">
            {sourceFolders.map(source => (
              <div key={source} className="grid gap-2 sm:grid-cols-3">
                <span className="self-center break-all text-sm text-cream">{source}</span>
                <select aria-label={`Camera for ${source}`} className="min-h-11 rounded border border-slate bg-slate-deep px-3 text-sm text-cream"
                  value={sourceAssignments[source]?.cameraId ?? ''}
                  onChange={event => setSourceAssignments(previous => ({ ...previous, [source]: { ...previous[source], cameraId: event.target.value } }))}>
                  <option value="">Read camera from metadata</option>
                  {camerasData?.cameras.map(camera => <option key={camera.id} value={camera.id}>{camera.name}</option>)}
                </select>
                <select aria-label={`Location for ${source}`} className="min-h-11 rounded border border-slate bg-slate-deep px-3 text-sm text-cream"
                  value={sourceAssignments[source]?.locationId ?? ''}
                  onChange={event => setSourceAssignments(previous => ({ ...previous, [source]: { ...previous[source], locationId: event.target.value } }))}>
                  <option value="">Use upload location</option>
                  <option value="__none__">No location</option>
                  {locationsData?.locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </details>}
      </div>}
      <UploadReviewDialog
        open={selectedFiles.length > 0 && stage === 'idle' && locationReviewed && !showLocationPicker && !reviewDismissed}
        count={selectedFiles.length}
        totalBytes={totalSize}
        locationName={uploadLocationRef.current?.areaName ?? null}
        onClose={() => setReviewDismissed(true)}
        onChangeLocation={() => setShowLocationPicker(true)}
        onClear={handleClear}
        onUpload={() => { void handleStartUpload() }}
      >
        <details className="py-3">
          <summary className="cursor-pointer text-sm text-cream">Different locations in this group? Assign by folder</summary>
          <p className="mt-2 text-sm text-cream-dark">Choose where each camera was placed for this upload. Photos keep that location when cameras move.</p>
          <div className="mt-3 space-y-3">
            {sourceFolders.map(source => (
              <div key={source} className="grid gap-2 sm:grid-cols-3">
                <span className="self-center break-all text-sm text-cream">{source}</span>
                <select aria-label={`Camera for ${source}`} className="min-h-11 rounded border border-slate bg-slate-deep px-3 text-sm text-cream"
                  value={sourceAssignments[source]?.cameraId ?? ''}
                  onChange={event => setSourceAssignments(previous => ({ ...previous, [source]: { ...previous[source], cameraId: event.target.value } }))}>
                  <option value="">Read camera from metadata</option>
                  {camerasData?.cameras.map(camera => <option key={camera.id} value={camera.id}>{camera.name}</option>)}
                </select>
                <select aria-label={`Location for ${source}`} className="min-h-11 rounded border border-slate bg-slate-deep px-3 text-sm text-cream"
                  value={sourceAssignments[source]?.locationId ?? ''}
                  onChange={event => setSourceAssignments(previous => ({ ...previous, [source]: { ...previous[source], locationId: event.target.value } }))}>
                  <option value="">Use upload location</option>
                  <option value="__none__">No location</option>
                  {locationsData?.locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </details>
        <details className="border-t border-slate py-3"><summary className="cursor-pointer text-sm text-cream">Selected photos</summary><ul className="mt-2 space-y-1 text-sm text-cream-dark">{selectedFiles.slice(0, 20).map((file, index) => <li key={index} className="truncate">{file.name}</li>)}</ul>{selectedFiles.length > 20 && <p className="mt-2 text-xs text-cream-dark">Showing the first 20 of {selectedFiles.length.toLocaleString()} photos.</p>}</details>
      </UploadReviewDialog>
    </div>
    </>
  )
}
