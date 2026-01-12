'use client'

import { useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, Calendar, Camera, FileImage } from 'lucide-react'
import { usePhotoDetail } from '@/lib/hooks/use-photos'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DetectionOverlay } from './detection-overlay'

interface PhotoViewerProps {
  photoId: string | null
  onClose: () => void
  onNavigate?: (direction: 'prev' | 'next') => void
}

export function PhotoViewer({ photoId, onClose, onNavigate }: PhotoViewerProps) {
  const { data, isLoading, error } = usePhotoDetail(photoId || '')

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      } else if (event.key === 'ArrowLeft' && onNavigate) {
        onNavigate('prev')
      } else if (event.key === 'ArrowRight' && onNavigate) {
        onNavigate('next')
      }
    },
    [onClose, onNavigate]
  )

  // Set up keyboard event listener
  useEffect(() => {
    if (!photoId) {
      return
    }
    window.addEventListener('keydown', handleKeyDown)
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'unset'
    }
  }, [photoId, handleKeyDown])

  // Don't render if no photoId
  if (!photoId) {
    return null
  }

  const photo = data?.photo

  // Format date helper
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Unknown'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Format file size helper
  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown'
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(2)} MB`
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-deep/95 backdrop-blur-md"
      onClick={onClose}
    >
      {/* Main Content Container */}
      <div
        className="relative w-full h-full flex"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image Container */}
        <div className="flex-1 flex items-center justify-center p-4 md:p-8 relative">
          {/* Navigation Arrows */}
          {onNavigate && (
            <>
              <Button
                variant="ghost"
                size="icon-lg"
                className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 bg-slate/80 hover:bg-slate text-cream hover:text-copper-light backdrop-blur-sm z-10 h-10 w-10 md:h-12 md:w-12 min-h-[40px] min-w-[40px]"
                onClick={() => onNavigate('prev')}
                aria-label="Previous photo"
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>
              <Button
                variant="ghost"
                size="icon-lg"
                className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 bg-slate/80 hover:bg-slate text-cream hover:text-copper-light backdrop-blur-sm z-10 h-10 w-10 md:h-12 md:w-12 min-h-[40px] min-w-[40px]"
                onClick={() => onNavigate('next')}
                aria-label="Next photo"
              >
                <ChevronRight className="h-6 w-6" />
              </Button>
            </>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-copper" />
              <p className="text-sm text-cream-dark">Loading photo...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="flex flex-col items-center gap-4 p-8 rounded-lg bg-slate/50">
              <X className="h-12 w-12 text-destructive" />
              <p className="text-sm text-cream-dark">
                Failed to load photo: {error.message}
              </p>
            </div>
          )}

          {/* Photo Display */}
          {photo && !isLoading && !error && (
            <div className="relative flex items-center justify-center max-w-full max-h-full">
              {/* Image wrapper - shrinks to fit the image exactly */}
              <div className="relative">
                <img
                  src={`/api/photos/${photo.id}/view`}
                  alt="Full size photo"
                  className="max-w-full max-h-[calc(100vh-4rem)] rounded-lg shadow-2xl block"
                />

                {/* Detection Overlay - uses percentage positioning */}
                {photo.detections && photo.detections.length > 0 && (
                  <DetectionOverlay
                    detections={photo.detections.map(d => ({
                      id: d.id,
                      bboxX: d.bbox_x ?? 0,
                      bboxY: d.bbox_y ?? 0,
                      bboxWidth: d.bbox_width ?? 0,
                      bboxHeight: d.bbox_height ?? 0,
                      confidence: d.confidence ?? 0,
                      class: d.class_name ?? null,
                      deerId: null,
                    }))}
                    imageWidth={10000}
                    imageHeight={10000}
                    visible={true}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar - Detection Details Panel */}
        <div className="hidden md:block w-80 bg-slate border-l border-slate-light overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-slate border-b border-slate-light p-4 flex items-center justify-between z-10">
            <h2 className="text-lg font-semibold text-cream">Photo Details</h2>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-cream-dark hover:text-cream hover:bg-slate-light"
              onClick={onClose}
              aria-label="Close viewer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          {photo && !isLoading && (
            <div className="p-4 space-y-6">
              {/* Metadata Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-copper uppercase tracking-wide">
                  Metadata
                </h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <Calendar className="h-4 w-4 text-cream-dark mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-cream-dark">Captured</p>
                      <p className="text-sm text-cream">
                        {formatDate(photo.captured_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Camera className="h-4 w-4 text-cream-dark mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-cream-dark">Camera</p>
                      <p className="text-sm text-cream">
                        {photo.camera_id || 'Unknown'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <FileImage className="h-4 w-4 text-cream-dark mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-cream-dark">File Size</p>
                      <p className="text-sm text-cream">
                        {formatFileSize(photo.file_size_bytes)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Detection Status Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-copper uppercase tracking-wide">
                  Detection Status
                </h3>
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'px-2 py-1 rounded text-xs font-medium',
                      photo.detection_status === 'completed' &&
                        'bg-green-500/20 text-green-400 border border-green-500/30',
                      photo.detection_status === 'processing' &&
                        'bg-copper/20 text-copper border border-copper/30',
                      photo.detection_status === 'pending' &&
                        'bg-cream/10 text-cream-dark border border-cream/20',
                      photo.detection_status === 'failed' &&
                        'bg-destructive/20 text-destructive border border-destructive/30'
                    )}
                  >
                    {photo.detection_status}
                  </div>
                </div>
              </div>

              {/* Detections Section */}
              {photo.detections && photo.detections.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-copper uppercase tracking-wide">
                    Detections ({photo.detections.length})
                  </h3>
                  <div className="space-y-2">
                    {photo.detections.map((detection, index) => (
                      <div
                        key={detection.id}
                        className="p-3 rounded-lg bg-slate-deep border border-slate-light"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-cream">
                            Detection {index + 1}
                          </span>
                          <span className="text-xs text-cream-dark">
                            {(detection.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-cream-dark">Class:</span>
                            <span className="text-cream">
                              {detection.class_name || 'Unknown'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-cream-dark">Position:</span>
                            <span className="text-cream">
                              ({detection.bbox_x}, {detection.bbox_y})
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-cream-dark">Size:</span>
                            <span className="text-cream">
                              {detection.bbox_width} × {detection.bbox_height}
                            </span>
                          </div>
                        </div>
                        {/* Embedding Status Badge */}
                        <div className="mt-2 pt-2 border-t border-slate-light">
                          <div
                            className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                              detection.has_embedding
                                ? 'bg-copper/20 text-copper border border-copper/30'
                                : 'bg-slate text-cream-dark border border-slate-light'
                            )}
                          >
                            {detection.has_embedding ? 'Ready for matching' : 'Awaiting embedding'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No Detections Message */}
              {photo.detections && photo.detections.length === 0 && (
                <div className="p-4 rounded-lg bg-slate-deep border border-slate-light text-center">
                  <p className="text-sm text-cream-dark">
                    No detections found in this photo
                  </p>
                </div>
              )}

              {/* Classification Section (if available) */}
              {photo.classification && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-copper uppercase tracking-wide">
                    Classification
                  </h3>
                  <div className="p-3 rounded-lg bg-slate-deep border border-slate-light">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-cream">
                        {photo.classification}
                      </span>
                      {photo.confidence && (
                        <span className="text-xs text-cream-dark">
                          {(photo.confidence * 100).toFixed(1)}% confidence
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Close Button (Top Right) */}
      <Button
        variant="ghost"
        size="icon-lg"
        className="absolute top-4 right-4 md:right-[21rem] bg-slate/80 hover:bg-slate text-cream hover:text-copper-light backdrop-blur-sm z-10 h-10 w-10 min-h-[40px] min-w-[40px]"
        onClick={onClose}
        aria-label="Close viewer"
      >
        <X className="h-6 w-6" />
      </Button>
    </div>
  )
}
