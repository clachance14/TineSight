'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DetectionCardWithFeedback } from '@/components/photos/detection-card-with-feedback'
import type { PhotoViewDTO } from '@/lib/services/photo-view'

function formatDate(s: string | null) {
  if (!s) return 'Unknown'
  return new Date(s).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatShortDate(s: string | null) {
  if (!s) return 'Unknown'
  return new Date(s).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return null
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function statusBadge(status: string) {
  const badges: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-slate text-cream-dark' },
    processing: { label: 'Processing', className: 'bg-blue-500/20 text-blue-300' },
    completed: { label: 'Completed', className: 'bg-green-500/20 text-green-300' },
    failed: { label: 'Failed', className: 'bg-red-500/20 text-red-300' },
  }
  const b = badges[status] ?? { label: 'Pending', className: 'bg-slate text-cream-dark' }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${b.className}`}>
      {b.label}
    </span>
  )
}

function classificationBadge(c: string | null) {
  if (!c) return <span className="text-cream-dark text-sm">No classification</span>
  const badges: Record<string, { label: string; className: string }> = {
    deer: { label: 'Deer', className: 'bg-copper/20 text-copper-light' },
    empty: { label: 'Empty', className: 'bg-slate text-cream-dark' },
    other: { label: 'Other Animal', className: 'bg-blue-500/20 text-blue-300' },
    person: { label: 'Person', className: 'bg-red-500/20 text-red-300' },
    vehicle: { label: 'Vehicle', className: 'bg-blue-500/20 text-blue-300' },
  }
  const b = badges[c] ?? { label: 'Other Animal', className: 'bg-blue-500/20 text-blue-300' }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium ${b.className}`}>
      {b.label}
    </span>
  )
}

export function PhotoInfo({ photo }: { photo: PhotoViewDTO }) {
  const fileSizeStr = formatFileSize(photo.fileSizeBytes)

  return (
    <>
      {/* Photo metadata — a light inline strip, not its own card. The photo
          is the focus; these details sit quietly beneath it. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 text-sm text-cream-dark">
        <span>
          <span className="text-cream-dark">Captured</span>{' '}
          <span className="font-medium text-cream">{formatDate(photo.capturedAt)}</span>
        </span>
        <span className="text-cream-dark/40">·</span>
        {statusBadge(photo.detectionStatus)}
        {classificationBadge(photo.classification)}
        {photo.confidence !== null && (
          <>
            <span className="text-cream-dark/40">·</span>
            <span className="text-cream">{Math.round(photo.confidence * 100)}%</span>
          </>
        )}
        {fileSizeStr && (
          <>
            <span className="text-cream-dark/40">·</span>
            <span>{fileSizeStr}</span>
          </>
        )}
        <span className="hidden text-cream-dark/40 md:inline">·</span>
        <span className="hidden md:inline">
          Imported {formatShortDate(photo.importedAt)}
        </span>
      </div>

      {/* Detections panel */}
      <Card>
        <CardHeader className="pb-2 md:pb-4 px-3 md:px-6 pt-3 md:pt-6">
          <CardTitle className="text-base md:text-lg">Detections ({photo.detections.length})</CardTitle>
          <CardDescription className="hidden md:block">
            Tap to locate on the photo · tap again to adjust
          </CardDescription>
        </CardHeader>
        <CardContent className="px-3 md:px-6 pb-3 md:pb-6 pt-0">
          {photo.detections.length === 0 ? (
            <p className="text-sm text-cream-dark text-center py-2 md:py-4">No detections found</p>
          ) : (
            <div className="space-y-1.5 md:space-y-2">
              {photo.detections.map((detection, index) => (
                <DetectionCardWithFeedback key={detection.id} detection={detection} index={index} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
