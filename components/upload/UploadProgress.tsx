'use client'

import React, { useMemo } from 'react'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { Upload, Cpu, AlertCircle, SkipForward, Clock } from 'lucide-react'

interface UploadProgressProps {
  /** Total number of files in the upload session */
  totalFiles: number
  /** Number of files successfully uploaded to storage */
  uploadedCount: number
  /** Number of files processed by AI pipeline */
  processedCount: number
  /** Number of files that failed to upload or process */
  failedCount: number
  /** Number of duplicate files skipped */
  skippedCount: number
  /** Whether upload is currently in progress */
  isUploading: boolean
  /** Upload start time for ETA calculation (optional) */
  startTime?: Date
  /** Current upload speed in bytes/second (optional) */
  bytesPerSecond?: number
  /** Total bytes to upload (optional) */
  totalBytes?: number
  /** Bytes uploaded so far (optional) */
  uploadedBytes?: number
}

/**
 * Formats a number with thousands separators
 */
function formatNumber(num: number): string {
  return num.toLocaleString()
}

/**
 * Formats seconds into human-readable time remaining
 */
function formatTimeRemaining(seconds: number | null): string {
  if (seconds === null || !isFinite(seconds) || seconds <= 0) {
    return 'Calculating...'
  }

  if (seconds < 60) {
    return `${Math.ceil(seconds)}s remaining`
  }

  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    const secs = Math.ceil(seconds % 60)
    return `${minutes}m ${secs}s remaining`
  }

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.ceil((seconds % 3600) / 60)
  return `${hours}h ${minutes}m remaining`
}

/**
 * Shows real-time upload and processing progress with dual progress bars.
 * - Upload progress: files uploaded / total files
 * - Processing progress: files processed by AI / files uploaded
 */
export function UploadProgress({
  totalFiles,
  uploadedCount,
  processedCount,
  failedCount,
  skippedCount,
  isUploading,
  startTime,
  bytesPerSecond,
  totalBytes,
  uploadedBytes,
}: UploadProgressProps): React.JSX.Element {
  // Calculate percentages
  const uploadPercentage = useMemo(() => {
    if (totalFiles === 0) return 0
    // Include skipped in the count since they're "done"
    return Math.round(((uploadedCount + skippedCount) / totalFiles) * 100)
  }, [totalFiles, uploadedCount, skippedCount])

  const processingPercentage = useMemo(() => {
    // Processing is based on uploaded files (not skipped ones)
    if (uploadedCount === 0) return 0
    return Math.round((processedCount / uploadedCount) * 100)
  }, [uploadedCount, processedCount])

  // Calculate estimated time remaining based on throughput
  const estimatedTimeRemaining = useMemo(() => {
    if (!isUploading || !startTime) return null

    const elapsedMs = Date.now() - startTime.getTime()
    const completedFiles = uploadedCount + skippedCount

    if (completedFiles === 0 || elapsedMs < 1000) return null

    const filesPerSecond = completedFiles / (elapsedMs / 1000)
    const remainingFiles = totalFiles - completedFiles - failedCount

    if (filesPerSecond === 0) return null

    return remainingFiles / filesPerSecond
  }, [isUploading, startTime, uploadedCount, skippedCount, totalFiles, failedCount])

  // Alternative ETA based on bytes if available
  const byteBasedEta = useMemo(() => {
    if (!bytesPerSecond || !totalBytes || !uploadedBytes || bytesPerSecond === 0) {
      return null
    }
    const remainingBytes = totalBytes - uploadedBytes
    return remainingBytes / bytesPerSecond
  }, [bytesPerSecond, totalBytes, uploadedBytes])

  // Use byte-based ETA if available, otherwise file-based
  const displayEta = byteBasedEta ?? estimatedTimeRemaining

  // Determine upload status
  const uploadComplete = uploadedCount + skippedCount >= totalFiles - failedCount && !isUploading
  const processingComplete = processedCount >= uploadedCount && uploadedCount > 0

  return (
    <div className="space-y-6">
      {/* Upload Progress Bar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className={cn(
              "h-4 w-4",
              isUploading ? "text-primary animate-pulse" : uploadComplete ? "text-primary" : "text-muted-foreground"
            )} />
            <span className="text-sm font-medium text-foreground">Upload Progress</span>
          </div>
          <span className="text-sm font-semibold text-foreground">
            {uploadPercentage}%
          </span>
        </div>

        <Progress
          value={uploadPercentage}
          className="h-2.5"
        />

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {formatNumber(uploadedCount + skippedCount)} / {formatNumber(totalFiles)} uploaded
          </span>
          {isUploading && displayEta !== null && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {formatTimeRemaining(displayEta)}
            </span>
          )}
          {uploadComplete && (
            <span className="text-primary font-medium">Complete</span>
          )}
        </div>
      </div>

      {/* Processing Progress Bar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className={cn(
              "h-4 w-4",
              uploadedCount > 0 && !processingComplete
                ? "text-primary animate-pulse"
                : processingComplete
                  ? "text-primary"
                  : "text-muted-foreground"
            )} />
            <span className="text-sm font-medium text-foreground">AI Processing</span>
          </div>
          <span className="text-sm font-semibold text-foreground">
            {processingPercentage}%
          </span>
        </div>

        <Progress
          value={processingPercentage}
          className={cn(
            "h-2.5",
            uploadedCount === 0 && "opacity-50"
          )}
        />

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {formatNumber(processedCount)} / {formatNumber(uploadedCount)} processed
          </span>
          {processingComplete && uploadedCount > 0 && (
            <span className="text-primary font-medium">Complete</span>
          )}
          {uploadedCount === 0 && (
            <span className="italic">Waiting for uploads...</span>
          )}
        </div>
      </div>

      {/* Status Counters */}
      {(failedCount > 0 || skippedCount > 0) && (
        <div className="flex items-center gap-4 pt-2 border-t border-border/50">
          {failedCount > 0 && (
            <div className="flex items-center gap-1.5 text-sm">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-destructive font-medium">
                {formatNumber(failedCount)} failed
              </span>
            </div>
          )}
          {skippedCount > 0 && (
            <div className="flex items-center gap-1.5 text-sm">
              <SkipForward className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                {formatNumber(skippedCount)} skipped (duplicates)
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
