'use client'

import { useCallback, useState, useMemo } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Image as ImageIcon, X, FileImage, Trash2, HardDrive, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useUploadStore } from '@/lib/stores/upload'
import { extractMetadata } from '@/lib/image/exif'
import { cn } from '@/lib/utils'

const ACCEPTED_IMAGE_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/heic': ['.heic'],
  'image/webp': ['.webp'],
}

const MAX_THUMBNAIL_SIZE = 300

interface PhotoUploaderProps {
  onStartUpload?: () => void
  onFilesReady?: () => void
  className?: string
}

export function PhotoUploader({ onStartUpload, onFilesReady, className }: PhotoUploaderProps) {
  const { uploadQueue, addFiles, clearQueue, isUploading } = useUploadStore()
  const [rejectionWarning, setRejectionWarning] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 })

  // Calculate summary stats for pending files
  const pendingFiles = useMemo(
    () => uploadQueue.filter((f) => f.status === 'pending'),
    [uploadQueue]
  )

  const totalSize = useMemo(() => {
    return pendingFiles.reduce((sum, f) => sum + (f.file?.size ?? 0), 0)
  }, [pendingFiles])

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  const generateThumbnail = useCallback(async (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = (e) => {
        const img = new Image()

        img.onload = () => {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')

          if (!ctx) {
            reject(new Error('Failed to get canvas context'))
            return
          }

          // Calculate dimensions maintaining aspect ratio
          let width = img.width
          let height = img.height

          if (width > height) {
            if (width > MAX_THUMBNAIL_SIZE) {
              height = (height * MAX_THUMBNAIL_SIZE) / width
              width = MAX_THUMBNAIL_SIZE
            }
          } else {
            if (height > MAX_THUMBNAIL_SIZE) {
              width = (width * MAX_THUMBNAIL_SIZE) / height
              height = MAX_THUMBNAIL_SIZE
            }
          }

          canvas.width = width
          canvas.height = height

          ctx.drawImage(img, 0, 0, width, height)
          resolve()
        }

        img.onerror = () => {
          reject(new Error('Failed to load image'))
        }

        if (e.target?.result) {
          img.src = e.target.result as string
        }
      }

      reader.onerror = () => {
        reject(new Error('Failed to read file'))
      }

      reader.readAsDataURL(file)
    })
  }, [])

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: any[]) => {
      // Clear any previous warnings
      setRejectionWarning(null)

      // Handle rejected files
      if (rejectedFiles.length > 0) {
        const rejectedCount = rejectedFiles.length
        setRejectionWarning(
          `${rejectedCount} file${rejectedCount > 1 ? 's' : ''} rejected. Only JPEG, PNG, HEIC, and WebP images are accepted.`
        )

        // Auto-clear warning after 5 seconds
        setTimeout(() => setRejectionWarning(null), 5000)
      }

      // Process accepted files
      if (acceptedFiles.length > 0) {
        setIsProcessing(true)
        setProcessingProgress({ current: 0, total: acceptedFiles.length })

        const processedFiles: Array<{
          file: File
          capturedAt: Date | null
          make: string | null
          model: string | null
          deviceIdentifier: string | null
          exifSignature: string | null
          exifData: Record<string, unknown>
        }> = []

        // Process files in batches of 10 for better performance while showing progress
        const BATCH_SIZE = 10
        for (let i = 0; i < acceptedFiles.length; i += BATCH_SIZE) {
          const batch = acceptedFiles.slice(i, i + BATCH_SIZE)

          const batchResults = await Promise.all(
            batch.map(async (file) => {
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

              // Generate thumbnail (don't block on failure)
              await generateThumbnail(file).catch((error) => {
                console.error(`Failed to generate thumbnail for ${file.name}:`, error)
              })

              return {
                file,
                capturedAt: metadata.capturedAt,
                make: metadata.make,
                model: metadata.model,
                deviceIdentifier: metadata.deviceIdentifier,
                exifSignature: metadata.exifSignature,
                exifData: metadata.rawExif,
              }
            })
          )

          processedFiles.push(...batchResults)
          setProcessingProgress({ current: Math.min(i + BATCH_SIZE, acceptedFiles.length), total: acceptedFiles.length })
        }

        // Add files with metadata to upload queue
        addFiles(processedFiles)
        setIsProcessing(false)
        setProcessingProgress({ current: 0, total: 0 })

        // Notify parent that files are ready (for location picker flow)
        if (onFilesReady) {
          onFilesReady()
        }
      }
    },
    [addFiles, generateThumbnail, onFilesReady]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_IMAGE_TYPES,
    disabled: isUploading || isProcessing,
    multiple: true,
  })

  const handleStartUpload = () => {
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
            Supports JPEG, PNG, HEIC, and WebP
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
                Processing photos...
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
      {rejectionWarning && (
        <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <X className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">{rejectionWarning}</p>
        </div>
      )}

      {/* Upload Summary Card */}
      {queueCount > 0 && !isUploading && (
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
