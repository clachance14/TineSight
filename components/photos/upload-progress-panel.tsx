'use client'

import { useEffect } from 'react'
import { X, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { useUploadStore } from '@/lib/stores/upload'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function UploadProgressPanel() {
  const {
    uploadQueue,
    isUploading,
    overallProgress,
    completedCount,
    failedCount,
    totalCount,
    reset,
  } = useUploadStore()

  // Auto-dismiss after 3 seconds when upload is complete
  useEffect(() => {
    if (!isUploading && uploadQueue.length > 0 && overallProgress === 100) {
      const timer = setTimeout(() => {
        reset()
      }, 3000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [isUploading, uploadQueue.length, overallProgress, reset])

  // Only show when uploading has started or recently completed
  // Don't show for pending files - that's handled by PhotoUploader summary
  const hasActiveUploads = uploadQueue.some(
    (f) => f.status === 'uploading' || f.status === 'completed' || f.status === 'failed'
  )

  if (uploadQueue.length === 0 || !hasActiveUploads) {
    return null
  }

  const allComplete = !isUploading && overallProgress === 100

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 animate-in slide-in-from-bottom-4">
      <Card className="shadow-lg border-border/50 backdrop-blur-sm bg-card/95">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              {allComplete ? 'Upload Complete' : 'Uploading Photos'}
            </CardTitle>
            <button
              onClick={() => reset()}
              className="rounded-sm opacity-70 hover:opacity-100 transition-opacity outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Overall Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {completedCount} of {totalCount} complete
                {failedCount > 0 && (
                  <span className="text-destructive ml-2">
                    ({failedCount} failed)
                  </span>
                )}
              </span>
              <span className="font-medium text-foreground">
                {overallProgress}%
              </span>
            </div>
            <ProgressBar progress={overallProgress} />
          </div>

          {/* Individual File Progress */}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {uploadQueue.map((file) => (
              <FileProgressItem key={file.id} file={file} />
            ))}
          </div>

          {/* Success Message */}
          {allComplete && (
            <div className="flex items-center gap-2 text-sm text-primary">
              <CheckCircle2 className="h-4 w-4" />
              <span>All photos uploaded successfully</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface FileProgressItemProps {
  file: {
    id: string
    filename: string
    status: 'pending' | 'uploading' | 'completed' | 'failed'
    progress: number
    error?: string
  }
}

function FileProgressItem({ file }: FileProgressItemProps) {
  const truncateFilename = (name: string, maxLength = 35) => {
    if (name.length <= maxLength) return name
    const ext = name.split('.').pop()
    const nameWithoutExt = name.slice(0, name.lastIndexOf('.'))
    const truncated = nameWithoutExt.slice(0, maxLength - ext!.length - 4)
    return `${truncated}...${ext}`
  }

  const StatusIcon = () => {
    switch (file.status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-destructive shrink-0" />
      case 'uploading':
        return <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />
      default:
        return <div className="h-4 w-4 shrink-0" />
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <StatusIcon />
        <span
          className={cn(
            'text-sm truncate flex-1',
            file.status === 'failed'
              ? 'text-destructive'
              : file.status === 'completed'
              ? 'text-muted-foreground'
              : 'text-foreground'
          )}
          title={file.filename}
        >
          {truncateFilename(file.filename)}
        </span>
        {file.status === 'uploading' && (
          <span className="text-xs text-muted-foreground shrink-0">
            {file.progress}%
          </span>
        )}
      </div>
      {file.status === 'uploading' && (
        <ProgressBar progress={file.progress} size="sm" />
      )}
      {file.error && (
        <p className="text-xs text-destructive pl-6">{file.error}</p>
      )}
    </div>
  )
}

interface ProgressBarProps {
  progress: number
  size?: 'default' | 'sm'
}

function ProgressBar({ progress, size = 'default' }: ProgressBarProps) {
  return (
    <div
      className={cn(
        'w-full bg-secondary rounded-full overflow-hidden',
        size === 'sm' ? 'h-1' : 'h-2'
      )}
    >
      <div
        className="h-full bg-primary transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  )
}
