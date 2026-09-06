'use client'

import { useRef, memo, type JSX } from 'react'
import Link from 'next/link'
import { useVirtualizer } from '@tanstack/react-virtual'
import { X, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { useUploadStore } from '@/lib/stores/upload'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function UploadProgressPanel({ onRetry }: { onRetry?: () => void } = {}): JSX.Element | null {
  const {
    uploadQueue,
    isPreparing,
    isCancelled,
    isUploading,
    overallProgress,
    completedCount,
    failedCount,
    totalCount,
    reset,
  } = useUploadStore()

  // Use simplified view for bulk uploads to avoid React performance issues
  const isBulkUpload = totalCount > 20

  // Virtualized list for bulk uploads
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: uploadQueue.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24, // ~24px per row
    overscan: 5, // Render 5 extra items above/below viewport
  })

  // Completed rows hold metadata only. Keep the result visible until the
  // operator chooses to browse or dismiss it; mounting this panel is not a navigation action.

  // Only show when preparing, uploading, or recently completed
  // Don't show for pending files - that's handled by PhotoUploader summary
  const hasActiveUploads = uploadQueue.some(
    (f) => f.status === 'uploading' || f.status === 'completed' || f.status === 'failed'
  )

  if (isCancelled) return (
    <div className="fixed bottom-6 right-6 z-50 w-96">
      <Card><CardHeader><CardTitle>Upload cancelled</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>No more files will be uploaded. View Photos to see the photos you kept.</p>
          <div className="flex gap-4"><Link href="/photos">View photos</Link><button type="button" onClick={reset}>Dismiss</button></div>
        </CardContent>
      </Card>
    </div>
  )

  if (!isPreparing && (uploadQueue.length === 0 || !hasActiveUploads)) {
    return null
  }

  const allComplete = !isUploading && !isPreparing && overallProgress === 100

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 animate-in slide-in-from-bottom-4">
      <Card className="shadow-lg border-border/50 backdrop-blur-sm bg-card/95">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              {allComplete
                ? failedCount > 0
                  ? completedCount > 0
                    ? 'Upload Finished With Errors'
                    : 'Upload Failed'
                  : 'Upload Complete'
                : isPreparing
                  ? 'Preparing Upload...'
                  : 'Uploading Photos'}
            </CardTitle>
            {!isUploading && !isPreparing && failedCount > 0 && onRetry && <button onClick={onRetry} className="min-h-11 text-sm text-copper">Retry failed photos</button>}
            {!isUploading && !isPreparing && completedCount > 0 && <Link href="/photos" className="text-sm text-copper">View photos</Link>}
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
          {isPreparing && !isUploading ? (
            /* Preparing State */
            <div className="flex items-center gap-3 py-2">
              <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
              <span className="text-sm text-muted-foreground">
                Initializing upload for {uploadQueue.filter(f => f.status === 'pending').length} photos...
              </span>
            </div>
          ) : (
            <>
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
              {isBulkUpload ? (
                // Virtualized bulk view - only renders visible items
                <div ref={parentRef} className="max-h-60 overflow-y-auto">
                  <div
                    style={{
                      height: `${virtualizer.getTotalSize()}px`,
                      width: '100%',
                      position: 'relative',
                    }}
                  >
                    {virtualizer.getVirtualItems().map((virtualRow) => {
                      const file = uploadQueue[virtualRow.index]
                      if (!file) return null
                      return (
                        <div
                          key={file.id}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: `${virtualRow.size}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          <BulkFileItem file={file} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                // Full progress view for small uploads
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {uploadQueue.map((file) => (
                    <FileProgressItem key={file.id} file={file} />
                  ))}
                </div>
              )}

              {/* Outcome Message */}
              {allComplete && failedCount === 0 && (
                <div className="flex items-center gap-2 text-sm text-primary">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>All photos uploaded successfully</span>
                </div>
              )}
              {allComplete && failedCount > 0 && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <XCircle className="h-4 w-4" />
                  <span>
                    {failedCount} photo{failedCount === 1 ? '' : 's'} did not upload. Each one lists the reason above.
                  </span>
                </div>
              )}
            </>
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

function FileStatusIcon({ status }: { status: FileProgressItemProps['file']['status'] }): JSX.Element {
  switch (status) {
    case 'completed': return <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
    case 'failed': return <XCircle className="h-4 w-4 text-destructive shrink-0" />
    case 'uploading': return <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />
    default: return <div className="h-4 w-4 shrink-0" />
  }
}

// Simplified item for bulk uploads - no progress bar, just status icon and filename
// Memoized to prevent unnecessary re-renders during bulk uploads
const BulkFileItem = memo(function BulkFileItem({ file }: FileProgressItemProps): JSX.Element {

  return (
    <div className="flex items-center gap-2 text-xs">
      <FileStatusIcon status={file.status} />
      <span
        className={cn(
          'truncate',
          file.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'
        )}
      >
        {file.filename}
      </span>
    </div>
  )
})

// Memoized to prevent unnecessary re-renders
const FileProgressItem = memo(function FileProgressItem({ file }: FileProgressItemProps): JSX.Element {
  const truncateFilename = (name: string, maxLength = 35): string => {
    if (name.length <= maxLength) return name
    const ext = name.split('.').pop() ?? ''
    const nameWithoutExt = name.slice(0, name.lastIndexOf('.'))
    const truncated = nameWithoutExt.slice(0, maxLength - ext.length - 4)
    return `${truncated}...${ext}`
  }


  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <FileStatusIcon status={file.status} />
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
      {(file.error != null) && (
        <p className="text-xs text-destructive pl-6">{file.error}</p>
      )}
    </div>
  )
})

interface ProgressBarProps {
  progress: number
  size?: 'default' | 'sm'
}

function ProgressBar({ progress, size = 'default' }: ProgressBarProps): JSX.Element {
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
