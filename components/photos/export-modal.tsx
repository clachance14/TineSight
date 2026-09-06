'use client'

import { useState, useEffect, type JSX } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Download, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

interface ExportModalProps {
  isOpen: boolean
  photoCount: number
  photoIds: string[]
  onClose: () => void
}

interface ExportStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  current: number
  total: number
  downloadUrl?: string
  error?: string
}

const LARGE_EXPORT_THRESHOLD = 25
const POLL_INTERVAL_MS = 2000

export function ExportModal({
  isOpen,
  photoCount,
  photoIds,
  onClose,
}: ExportModalProps): JSX.Element {
  const [jobId, setJobId] = useState<string | null>(null)
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [downloadFilename, setDownloadFilename] = useState('tinesight-photos.zip')
  const [isPolling, setIsPolling] = useState(false)

  const isLargeExport = photoCount > LARGE_EXPORT_THRESHOLD

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setJobId(null)
      setExportStatus(null)
      setDownloadUrl(null)
      setIsPolling(false)
    }
  }, [isOpen])

  // Poll job status for large exports
  useEffect(() => {
    if (!isPolling || jobId === null) return

    const pollStatus = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/photos/export/${jobId}/status`)
        if (!res.ok) {
          throw new Error('Failed to fetch export status')
        }

        const status = await res.json() as ExportStatus
        setExportStatus(status)

        if (status.status === 'completed') {
          setIsPolling(false)
          if (status.downloadUrl !== undefined) {
            setDownloadUrl(status.downloadUrl)
          }
        } else if (status.status === 'failed') {
          setIsPolling(false)
        }
      } catch (error) {
        console.error('Error polling export status:', error)
        setIsPolling(false)
        setExportStatus({
          status: 'failed',
          current: 0,
          total: photoCount,
          error: 'Failed to fetch export status',
        })
      }
    }

    const intervalId = setInterval(() => { void pollStatus() }, POLL_INTERVAL_MS)
    void pollStatus() // Initial poll

    return () => clearInterval(intervalId)
  }, [isPolling, jobId, photoCount])

  // Mutation for initiating export
  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/photos/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoIds }),
      })

      if (!res.ok) {
        const error = await res.json() as { error?: string }
        throw new Error(error.error ?? 'Failed to export photos')
      }

      // Check if response contains a job ID (large export) or download URL/blob (small export)
      const contentType = res.headers.get('content-type')

      if (contentType?.includes('application/json') === true) {
        const data = await res.json() as { jobId?: string; downloadUrl?: string; filename?: string }

        // Large export: background job
        if (data.jobId !== undefined) {
          setJobId(data.jobId)
          setIsPolling(true)
          return { type: 'job' as const, jobId: data.jobId }
        }

        // Small export: direct download URL
        if (data.downloadUrl !== undefined) {
          setDownloadUrl(data.downloadUrl)
          const filename = data.filename ?? 'tinesight-photos.zip'
          setDownloadFilename(filename)
          triggerDownload(data.downloadUrl, filename)
          return { type: 'direct' as const, downloadUrl: data.downloadUrl }
        }
      }

      // Small export: blob response
      if (contentType?.includes('application/zip') === true) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        setDownloadUrl(url)
        triggerDownload(url, `tinesight-export-${Date.now()}.zip`)
        return { type: 'blob' as const, url }
      }

      throw new Error('Unexpected response format')
    },
  })

  const triggerDownload = (url: string, filename: string): void => {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleExport = (): void => {
    exportMutation.mutate()
  }

  const handleDownload = (): void => {
    if (downloadUrl !== null) {
      triggerDownload(downloadUrl, downloadFilename)
    }
  }

  const handleClose = (): void => {
    if (isPolling || exportMutation.isPending) {
      // Don't close while polling
      return
    }
    onClose()
  }

  // Determine current state
  const isProcessing = exportMutation.isPending || isPolling
  const isComplete = exportStatus?.status === 'completed' || (downloadUrl !== null && !isLargeExport)
  const hasFailed = exportMutation.error !== null || exportStatus?.status === 'failed'

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="bg-slate-deep border-slate">
        <DialogHeader>
          <DialogTitle className="text-cream flex items-center gap-2">
            <Download className="h-5 w-5 text-copper" />
            Download {photoCount} Photo{photoCount !== 1 ? 's' : ''}
          </DialogTitle>
          <DialogDescription className="text-cream-dark">
            {photoCount === 1 ? 'Download the original photo to your computer.' : isLargeExport
              ? 'Large export will be processed in the background. You can download when ready.'
              : 'Photos will be downloaded as a ZIP file.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Loading State */}
          {isProcessing && !exportStatus && (
            <div className="flex items-center gap-3 text-cream-dark">
              <Loader2 className="h-5 w-5 animate-spin text-copper" />
              <span>Preparing export...</span>
            </div>
          )}

          {/* Large Export Progress */}
          {isLargeExport && exportStatus?.status === 'processing' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-cream-dark">Processing photos</span>
                <span className="text-cream font-medium">
                  {exportStatus.current} / {exportStatus.total}
                </span>
              </div>
              <Progress
                value={(exportStatus.current / exportStatus.total) * 100}
                className="h-2"
              />
            </div>
          )}

          {/* Success State */}
          {isComplete && (
            <div className="flex items-center gap-3 text-green-400">
              <CheckCircle className="h-5 w-5" />
              <span>Export ready!</span>
            </div>
          )}

          {/* Error State */}
          {hasFailed && (
            <div className="flex items-start gap-3 text-red-400">
              <AlertCircle className="h-5 w-5 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Export failed</p>
                <p className="text-sm text-red-400/80 mt-1">
                  {exportMutation.error instanceof Error
                    ? exportMutation.error.message
                    : exportStatus?.error ?? 'An error occurred during export'}
                </p>
              </div>
            </div>
          )}

          {/* Export Type Info */}
          {!isProcessing && !isComplete && !hasFailed && (
            <div className="bg-slate/50 border border-slate-600 rounded-md p-3 text-sm">
              <p className="text-cream-dark">
                <span className="font-medium text-cream">{photoCount}</span> photo
                {photoCount !== 1 ? 's' : ''} will be exported
              </p>
              {isLargeExport && (
                <p className="text-cream-dark/70 mt-1">
                  This may take a few minutes. You can download when processing completes.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {/* Download Button (shown when complete) */}
          {isComplete && downloadUrl !== null && (
            <Button
              onClick={handleDownload}
              className="bg-copper hover:bg-copper-light text-slate-deep"
            >
              <Download className="mr-2 h-4 w-4" />
              {photoCount === 1 ? 'Download photo' : 'Download ZIP'}
            </Button>
          )}

          {/* Export Button (initial state) */}
          {!isProcessing && !isComplete && !hasFailed && (
            <>
              <Button
                variant="ghost"
                onClick={handleClose}
                className="text-cream-dark hover:text-cream hover:bg-slate"
              >
                Cancel
              </Button>
              <Button
                onClick={handleExport}
                className="bg-copper hover:bg-copper-light text-slate-deep"
              >
                <Download className="mr-2 h-4 w-4" />
                {photoCount === 1 ? 'Download photo' : 'Download ZIP'}
              </Button>
            </>
          )}

          {/* Close Button (when complete or failed) */}
          {(isComplete || hasFailed) && (
            <Button
              variant="ghost"
              onClick={handleClose}
              className="text-cream-dark hover:text-cream hover:bg-slate"
            >
              Close
            </Button>
          )}

          {/* Retry Button (when failed) */}
          {hasFailed && (
            <Button
              onClick={handleExport}
              className="bg-copper hover:bg-copper-light text-slate-deep"
            >
              Retry Export
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
