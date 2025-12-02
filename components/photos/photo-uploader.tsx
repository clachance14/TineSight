'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Image as ImageIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUploadStore } from '@/lib/stores/upload'
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
  className?: string
}

export function PhotoUploader({ onStartUpload, className }: PhotoUploaderProps) {
  const { uploadQueue, addFiles, isUploading } = useUploadStore()
  const [rejectionWarning, setRejectionWarning] = useState<string | null>(null)

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
        // Generate thumbnails for all files
        await Promise.all(
          acceptedFiles.map((file) =>
            generateThumbnail(file).catch((error) => {
              console.error(`Failed to generate thumbnail for ${file.name}:`, error)
            })
          )
        )

        // Add files to upload queue
        addFiles(acceptedFiles)
      }
    },
    [addFiles, generateThumbnail]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_IMAGE_TYPES,
    disabled: isUploading,
    multiple: true,
  })

  const handleStartUpload = () => {
    if (onStartUpload) {
      onStartUpload()
    }
  }

  const pendingFiles = uploadQueue.filter((f) => f.status === 'pending')
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
          isUploading && 'opacity-50 cursor-not-allowed pointer-events-none'
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

        {/* Uploading state */}
        {isUploading && (
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

      {/* Start upload button */}
      {queueCount > 0 && !isUploading && (
        <div className="mt-4 flex justify-end">
          <Button
            onClick={handleStartUpload}
            className="bg-copper hover:bg-copper-light text-slate-deep font-medium"
            disabled={isUploading}
          >
            <Upload className="h-4 w-4" />
            Start Upload ({queueCount})
          </Button>
        </div>
      )}
    </div>
  )
}
