'use client'

import { cn } from '@/lib/utils'
import Image from 'next/image'

interface MatchReviewPanelProps {
  detections: Array<{
    id: string
    imageId: string
    pendingMatchCount: number
    thumbnailUrl?: string | null
  }>
  currentDetectionId?: string | null
  onSelectDetection: (detectionId: string) => void
}

export function MatchReviewPanel({
  detections,
  currentDetectionId,
  onSelectDetection,
}: MatchReviewPanelProps) {
  const totalPendingMatches = detections.reduce(
    (sum, detection) => sum + detection.pendingMatchCount,
    0
  )

  return (
    <div className="flex h-full flex-col bg-slate border-r border-slate-light">
      {/* Header */}
      <div className="flex-none border-b border-slate-light p-4">
        <h2 className="text-lg font-semibold text-cream">Pending Matches</h2>
        <p className="mt-1 text-sm text-cream-dark">
          {totalPendingMatches} {totalPendingMatches === 1 ? 'match' : 'matches'} across{' '}
          {detections.length} {detections.length === 1 ? 'detection' : 'detections'}
        </p>
      </div>

      {/* Detection List */}
      <div className="flex-1 overflow-y-auto">
        {detections.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <p className="text-sm text-cream-dark">
              No detections with pending matches
            </p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {detections.map((detection) => {
              const isActive = detection.id === currentDetectionId

              return (
                <button
                  key={detection.id}
                  onClick={() => onSelectDetection(detection.id)}
                  className={cn(
                    'group relative w-full rounded-lg border transition-all',
                    'flex items-center gap-3 p-3 text-left',
                    isActive
                      ? 'border-copper bg-copper/10'
                      : 'border-slate-light bg-slate-deep hover:border-copper/50 hover:bg-slate',
                  )}
                >
                  {/* Thumbnail */}
                  <div
                    className={cn(
                      'relative h-16 w-16 flex-none overflow-hidden rounded border transition-colors',
                      isActive
                        ? 'border-copper'
                        : 'border-slate-light group-hover:border-copper/50',
                    )}
                  >
                    {detection.thumbnailUrl ? (
                      <Image
                        src={detection.thumbnailUrl}
                        alt="Detection thumbnail"
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-slate-deep">
                        <svg
                          className="h-6 w-6 text-cream-dark"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Detection Info */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        'truncate text-sm font-medium transition-colors',
                        isActive ? 'text-cream' : 'text-cream-dark group-hover:text-cream',
                      )}
                    >
                      Detection {detection.id.slice(0, 8)}
                    </p>
                    <p className="mt-0.5 text-xs text-cream-dark">
                      Image {detection.imageId.slice(0, 8)}
                    </p>
                  </div>

                  {/* Match Count Badge */}
                  <div
                    className={cn(
                      'flex-none rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                      isActive
                        ? 'bg-copper text-slate-deep'
                        : 'bg-copper/20 text-copper group-hover:bg-copper/30',
                    )}
                  >
                    {detection.pendingMatchCount}
                  </div>

                  {/* Active Indicator */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r bg-copper" />
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {detections.length > 0 && (
        <div className="flex-none border-t border-slate-light p-4">
          <div className="flex flex-col gap-2">
            <button
              className={cn(
                'w-full rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                'bg-copper text-slate-deep hover:bg-copper-light',
              )}
              onClick={() => {
                // Batch review action placeholder
                console.log('Review all matches')
              }}
            >
              Review All
            </button>
            <button
              className={cn(
                'w-full rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                'border-slate-light text-cream-dark hover:bg-slate hover:text-cream',
              )}
              onClick={() => {
                // Skip all action placeholder
                console.log('Skip all matches')
              }}
            >
              Skip All
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
