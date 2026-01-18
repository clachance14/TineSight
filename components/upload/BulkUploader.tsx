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

import { useCallback, useRef, useState, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FolderOpen, Upload, X, FileImage, HardDrive, Loader2, CheckCircle2, AlertTriangle, AlertCircle, FolderUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useUploadStore, batchedUpdateProgress } from '@/lib/stores/upload'
import { setActiveUploadSessionId } from '@/lib/hooks/use-active-batch'
import { useCurrentUser } from '@/lib/hooks/use-current-user'
import { useRealtimePhotos } from '@/lib/hooks/use-realtime-photos'
import { useAdaptiveThrottle } from '@/lib/hooks/use-adaptive-throttle'
import { classifyXHRError } from '@/lib/throttle'
import { ExifWorkerPool } from '@/lib/upload/ExifWorkerPool'
import { DuplicateChecker } from '@/lib/upload/dedup'
import { UPLOAD_CONFIG, SUPPORTED_MIME_TYPES, isSupportedMimeType } from '@/lib/upload/config'
import { chunkArray } from '@/lib/upload/chunker'
import { cn } from '@/lib/utils'
import type { ExifData } from '@/lib/upload/ExifWorkerPool'

// Constants
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000
const PROGRESS_THROTTLE_MS = 100

interface BulkUploaderProps {
  onUploadComplete?: (sessionId: string) => void
  className?: string
}

interface FailedUpload {
  fileId: string
  filename: string
  file: File
  uploadUrl: string
  imageId: string
  attempt: number
}

interface ProcessedFile {
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

type UploadStage = 'idle' | 'selecting' | 'extracting' | 'checking-duplicates' | 'uploading' | 'complete' | 'error'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function BulkUploader({ onUploadComplete, className }: BulkUploaderProps) {
  const queryClient = useQueryClient()
  const { userId } = useCurrentUser()

  // Realtime subscription for live status updates
  const { isConnected: realtimeConnected, lastUpdate: realtimeLastUpdate } = useRealtimePhotos({
    userId,
    enabled: userId.length > 0,
  })

  // Refs for upload management
  const progressThrottles = useRef<Map<string, number>>(new Map())
  const failedUploadsRef = useRef<FailedUpload[]>([])
  const uploadStartTimes = useRef<Map<string, number>>(new Map())
  const exifPoolRef = useRef<ExifWorkerPool | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
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
  const [, setSessionId] = useState<string | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const [failedFilesList, setFailedFilesList] = useState<Array<{ filename: string; error: string }>>([])

  // Throttle for uploads
  const throttle = useAdaptiveThrottle('upload')

  // Upload store
  const {
    addFiles,
    clearQueue,
    setIsPreparing,
    startUpload,
    markFileCompleted,
    markFileFailed,
    isUploading,
    completedCount,
    failedCount,
    totalCount,
  } = useUploadStore()

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (exifPoolRef.current) {
        exifPoolRef.current.terminate()
        exifPoolRef.current = null
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [])

  // Calculate total size of selected files
  const totalSize = useMemo(() => {
    return selectedFiles.reduce((sum, f) => sum + f.size, 0)
  }, [selectedFiles])

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  // Filter files to only include supported types
  const filterSupportedFiles = useCallback((files: FileList | File[]): File[] => {
    const fileArray = Array.from(files)
    return fileArray.filter((file) => {
      // Check MIME type
      if (file.type && isSupportedMimeType(file.type)) {
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

    if (supportedFiles.length === 0) {
      setErrorMessage('No supported image files found in the selected folder. Supported formats: JPEG, PNG, HEIC, WebP.')
      setStage('idle')
      return
    }

    setSelectedFiles(supportedFiles)
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

    if (supportedFiles.length === 0) {
      setErrorMessage('No supported image files found. Supported formats: JPEG, PNG, HEIC, WebP.')
      setStage('idle')
      return
    }

    setSelectedFiles(supportedFiles)
    setStage('idle')

    // Clear the input so the same files can be selected again
    event.target.value = ''
  }, [filterSupportedFiles])

  // Clear selected files
  const handleClear = useCallback(() => {
    setSelectedFiles([])
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

    if (e.dataTransfer === null) return

    setErrorMessage(null)
    setStage('selecting')

    try {
      const droppedFiles = await getFilesFromDataTransfer(e.dataTransfer)
      const supportedFiles = filterSupportedFiles(droppedFiles)

      if (supportedFiles.length === 0) {
        setErrorMessage('No supported image files found. Supported formats: JPEG, PNG, HEIC, WebP.')
        setStage('idle')
        return
      }

      setSelectedFiles(supportedFiles)
      setStage('idle')
    } catch (error) {
      console.error('Error processing dropped files:', error)
      setErrorMessage('Failed to process dropped files. Please try again.')
      setStage('idle')
    }
  }, [getFilesFromDataTransfer, filterSupportedFiles])

  // XHR upload function
  const uploadFile = useCallback((
    fileId: string,
    filename: string,
    file: File,
    uploadUrl: string
  ): Promise<{ success: true } | { success: false; error: string }> => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()
      const startTime = Date.now()
      uploadStartTimes.current.set(fileId, startTime)

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
          throttle.recordSuccess(duration)
          resolve({ success: true })
        } else {
          console.error(`[Upload Failed] ${filename}`, {
            status: xhr.status,
            statusText: xhr.statusText,
            response: xhr.responseText?.slice(0, 500),
          })
          throttle.recordFailure(classifyXHRError(xhr))
          resolve({ success: false, error: `Upload failed: ${xhr.status} ${xhr.statusText}` })
        }
      }

      xhr.onerror = () => {
        uploadStartTimes.current.delete(fileId)
        console.error(`[Network Error] ${filename}`, { readyState: xhr.readyState })
        throttle.recordFailure('network')
        resolve({ success: false, error: 'Network error - browser connection failed' })
      }

      xhr.ontimeout = () => {
        uploadStartTimes.current.delete(fileId)
        console.error(`[Timeout] ${filename}`)
        throttle.recordFailure('network')
        resolve({ success: false, error: 'Upload timeout' })
      }

      xhr.timeout = 120000
      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
      xhr.send(file)
    })
  }, [throttle])

  // Main upload handler
  const handleStartUpload = useCallback(async () => {
    if (selectedFiles.length === 0) return

    setErrorMessage(null)
    abortControllerRef.current = new AbortController()

    try {
      // Step 1: Initialize EXIF worker pool
      setStage('extracting')
      if (!exifPoolRef.current) {
        exifPoolRef.current = new ExifWorkerPool()
      }
      const pool = exifPoolRef.current

      // Step 2: Extract EXIF metadata from all files
      setExtractionProgress({ current: 0, total: selectedFiles.length })
      const processed: ProcessedFile[] = []

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]!
        const fileId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

        try {
          // Slice file for EXIF extraction (first 128KB)
          const slice = await file.slice(0, UPLOAD_CONFIG.EXIF_SLICE_SIZE).arrayBuffer()
          const exifData = await pool.extractExif(fileId, slice)

          // Parse captured date from EXIF
          let capturedAt: Date | null = null
          if (exifData?.dateTimeOriginal) {
            capturedAt = exifData.dateTimeOriginal instanceof Date
              ? exifData.dateTimeOriginal
              : new Date(exifData.dateTimeOriginal)
          }

          // Create device identifier
          const deviceIdentifier = exifData?.make && exifData?.model
            ? `${exifData.make}-${exifData.model}`
            : null

          processed.push({
            id: fileId,
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

        setExtractionProgress({ current: i + 1, total: selectedFiles.length })
      }

      setProcessedFiles(processed)

      // Step 3: Check for duplicates
      setStage('checking-duplicates')
      const checker = new DuplicateChecker()
      const duplicateCheck = await checker.checkDuplicates(
        processed.map((f) => ({ filename: f.filename, size: f.file.size }))
      )

      setDuplicateCount(duplicateCheck.duplicateCount)

      // Filter out duplicates
      const existingSet = new Set(duplicateCheck.existing)
      const filesToUpload = processed.filter((f) => !existingSet.has(f.filename))
      setSkippedCount(duplicateCheck.duplicateCount)

      if (filesToUpload.length === 0) {
        setStage('complete')
        return
      }

      // Step 4: Create upload session
      setStage('uploading')
      let uploadSessionId: string | null = null
      try {
        const sessionRes = await fetch('/api/upload-sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        if (sessionRes.ok) {
          const sessionData = await sessionRes.json()
          uploadSessionId = sessionData.sessionId
          setSessionId(uploadSessionId)
          if (uploadSessionId) {
            setActiveUploadSessionId(uploadSessionId)
          }
        }
      } catch (err) {
        console.error('Failed to create upload session:', err)
      }

      // Add files to upload store
      addFiles(filesToUpload.map((f) => ({
        file: f.file,
        capturedAt: f.capturedAt,
        make: f.make,
        model: f.model,
        deviceIdentifier: f.deviceIdentifier,
        exifSignature: f.exifSignature,
        ...(f.exifData !== null && { exifData: f.exifData as Record<string, unknown> }),
      })))

      // Clear failed uploads from previous runs
      failedUploadsRef.current = []
      setFailedFilesList([])

      // Get dynamic values from throttler
      const chunkSize = throttle.getChunkSize()
      const parallelChunks = throttle.getConcurrency()

      console.log(`[BulkUploader] Using chunk size: ${chunkSize}, concurrency: ${parallelChunks}`)

      // Get files from the store (they now have IDs)
      const pendingFiles = useUploadStore.getState().uploadQueue.filter((f) => f.status === 'pending')
      const chunks = chunkArray(pendingFiles, chunkSize)

      // Initialize a batch: get signed URLs from API
      const initializeBatch = async (chunk: typeof pendingFiles) => {
        const response = await fetch('/api/photos/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadSessionId,
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
              imageId: uploadInfo.imageId,
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
      throttle.startSession()

      // Pipeline: fetch signed URLs for next round while current round uploads
      const rounds = chunkArray(chunks, parallelChunks)

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

        await delay(RETRY_DELAY_MS)

        for (const failed of toRetry) {
          if (failed.attempt >= MAX_RETRIES) {
            const errorMsg = `Upload failed after ${MAX_RETRIES} attempts`
            console.warn(`[Upload] ${failed.filename} - ${errorMsg}`)
            markFileFailed(failed.fileId, errorMsg)
            setFailedFilesList((prev) => [...prev, { filename: failed.filename, error: errorMsg }])
            continue
          }

          batchedUpdateProgress(failed.fileId, 0)

          // Refresh the signed URL before retry attempt
          let freshUploadUrl = failed.uploadUrl
          try {
            const refreshRes = await fetch(`/api/photos/${failed.imageId}/refresh-url`, {
              method: 'POST',
            })

            if (!refreshRes.ok) {
              failedUploadsRef.current.push({
                ...failed,
                attempt: failed.attempt + 1,
              })
              continue
            }

            const { uploadUrl } = await refreshRes.json()
            freshUploadUrl = uploadUrl
          } catch {
            failedUploadsRef.current.push({
              ...failed,
              attempt: failed.attempt + 1,
            })
            continue
          }

          const result = await uploadFile(failed.fileId, failed.filename, failed.file, freshUploadUrl)

          if (result.success) {
            markFileCompleted(failed.fileId)
          } else {
            failedUploadsRef.current.push({
              ...failed,
              uploadUrl: freshUploadUrl,
              attempt: failed.attempt + 1,
            })
          }
        }
      }

      throttle.stopSession()

      // Step 6: Refresh queries and complete
      await queryClient.invalidateQueries({ queryKey: ['photos'] })
      await queryClient.invalidateQueries({ queryKey: ['upload-sessions'] })
      setIsPreparing(false)
      setStage('complete')

      // Notify parent
      if (uploadSessionId && onUploadComplete) {
        onUploadComplete(uploadSessionId)
      }
    } catch (error) {
      console.error('Bulk upload failed:', error)
      setStage('error')
      setErrorMessage(error instanceof Error ? error.message : 'Upload failed')
      setIsPreparing(false)
    }
  }, [
    selectedFiles,
    addFiles,
    clearQueue,
    setIsPreparing,
    startUpload,
    markFileCompleted,
    markFileFailed,
    queryClient,
    throttle,
    uploadFile,
    onUploadComplete,
  ])

  // Render stage-specific content
  const renderContent = () => {
    if (stage === 'extracting') {
      return (
        <div className="text-center py-8">
          <Loader2 className="mb-4 h-10 w-10 animate-spin text-copper mx-auto" />
          <p className="text-lg font-medium text-cream mb-2">
            Extracting metadata...
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
        <div className="text-center py-8">
          <Loader2 className="mb-4 h-10 w-10 animate-spin text-copper mx-auto" />
          <p className="text-lg font-medium text-cream">
            Checking for duplicates...
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
        <div className="text-center py-8">
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
        <div className="text-center py-6">
          {hasFailures ? (
            <AlertTriangle className="mb-3 h-10 w-10 text-yellow-500 mx-auto" />
          ) : (
            <CheckCircle2 className="mb-3 h-10 w-10 text-green-500 mx-auto" />
          )}
          <p className="text-lg font-medium text-cream mb-1">
            {hasFailures ? 'Upload completed with errors' : 'Upload complete!'}
          </p>
          <p className="text-sm text-cream-dark mb-4">
            {completedCount} photos uploaded successfully
            {skippedCount > 0 && `, ${skippedCount} duplicates skipped`}
          </p>

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
        <div className="text-center py-8">
          <AlertCircle className="mb-4 h-10 w-10 text-destructive mx-auto" />
          <p className="text-lg font-medium text-cream mb-2">
            Upload failed
          </p>
          <p className="text-sm text-destructive mb-4">
            {errorMessage}
          </p>
          <Button
            onClick={handleClear}
            variant="outline"
          >
            Try Again
          </Button>
        </div>
      )
    }

    // Default: file/folder selection UI
    return (
      <div className="flex flex-col items-center justify-center min-h-[180px] p-6">
        {/* Hidden inputs */}
        <input
          ref={folderInputRef}
          type="file"
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
            Bulk Upload Photos
          </p>
          <p className="text-sm text-cream-dark">
            Drag & drop folders or files, or use buttons below
          </p>
          <p className="text-xs text-cream-dark/70">
            JPEG, PNG, HEIC, WebP
          </p>
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => folderInputRef.current?.click()}
            className="gap-1.5"
          >
            <FolderOpen className="h-4 w-4" />
            Select Folder
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="gap-1.5"
          >
            <FileImage className="h-4 w-4" />
            Select Files
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('w-full', className)}>
      <Card
        className={cn(
          'border-dashed border-2 transition-all relative',
          isDragActive
            ? 'border-copper bg-copper/5 scale-[1.01]'
            : 'border-slate hover:border-copper/50'
        )}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
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
      {errorMessage && stage === 'idle' && (
        <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <X className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">{errorMessage}</p>
        </div>
      )}

      {/* File summary card */}
      {selectedFiles.length > 0 && stage === 'idle' && (
        <Card className="mt-4 border-copper/30 bg-slate/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              {/* Summary Info */}
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-copper/20 p-2">
                    <FileImage className="h-5 w-5 text-copper" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-cream">
                      {selectedFiles.length} {selectedFiles.length === 1 ? 'photo' : 'photos'} selected
                    </p>
                    <p className="text-xs text-cream-dark">
                      Ready for upload
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
                  onClick={handleClear}
                  className="text-cream-dark hover:text-cream hover:bg-slate"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
                <Button
                  onClick={handleStartUpload}
                  className="bg-copper hover:bg-copper-light text-slate-deep font-medium"
                >
                  <Upload className="h-4 w-4 mr-1" />
                  Start Upload
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
