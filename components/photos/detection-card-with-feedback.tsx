"use client"

import { memo } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useFeedback } from '@/lib/hooks/use-roi'
import { useDetectionHover } from '@/lib/stores/detection-hover'
import { useDetectionEdit } from '@/lib/stores/detection-edit'
import type { FeedbackType } from '@/components/photos/quality-feedback-dialog'

// Feedback type labels mapping
const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  distant: 'Too Distant',
  partial_view: 'Partial View',
  no_antlers: 'No Antlers',
  obstructed: 'Obstructed',
  wrong_angle: 'Wrong Angle',
  blurry: 'Blurry',
  other: 'Other',
}

interface DetectionCardProps {
  detection: {
    id: string
    confidence: number
    class?: string | null
    qualityStatus?: string | null
    qualityScore?: number | null
    bboxX: number
    bboxY: number
    bboxWidth: number
    bboxHeight: number
    deerId?: string | null
    deerName?: string | null
    species?: string | null
    sex?: string | null
    sizeClass?: string | null
    estimatedPointRange?: string | null
    ageClass?: string | null
  }
  index: number
  isHovered?: boolean
  onHover?: (id: string | null) => void
}

export const DetectionCardWithFeedback = memo(function DetectionCardWithFeedback({ detection, index }: DetectionCardProps) {
  // Fetch feedback for this detection
  const { data: feedbackData } = useFeedback(detection.id)
  const feedback = feedbackData?.feedback || []

  // Shared hover + pinned (tap-to-locate) state with the detection overlay
  const { hoveredDetectionId, setHoveredDetectionId, pinnedDetectionId, setPinnedDetectionId } =
    useDetectionHover()
  const isHovered = hoveredDetectionId === detection.id
  // "Pinned" = located by a tap. The row expands and its box draws on the photo.
  const isActive = pinnedDetectionId === detection.id

  // Detection edit panel state
  const { selectedDetectionId, openPanel } = useDetectionEdit()
  const isSelected = selectedDetectionId === detection.id

  // Selecting a deer opens its details before any editing tools.
  const handleActivate = () => {
    setPinnedDetectionId(detection.id)
    openPanel(detection.id)
  }

  // Format deer info from Gemini analysis
  const formatDeerInfo = () => {
    const parts: string[] = []
    if (detection.species) {
      parts.push(detection.species.replace('_', ' '))
    }
    if (detection.sex && detection.sex !== 'unknown') {
      parts.push(detection.sex)
    }
    if (detection.ageClass && detection.ageClass !== 'unknown') {
      // Capitalize first letter (young -> Young, mature -> Mature)
      parts.push(detection.ageClass.charAt(0).toUpperCase() + detection.ageClass.slice(1))
    }
    return parts.length > 0 ? parts.join(' • ') : detection.class || 'Unknown'
  }

  // Format size class for display (capitalize)
  const formatSizeClass = (sizeClass: string) => {
    return sizeClass.charAt(0).toUpperCase() + sizeClass.slice(1)
  }

  const showSizeBadge =
    detection.sex === 'buck' && !!detection.sizeClass && detection.sizeClass !== 'unknown'
  const pointRange =
    detection.sex === 'buck' && detection.estimatedPointRange && detection.estimatedPointRange !== 'unknown'
      ? detection.estimatedPointRange
      : null

  return (
    <div
      role="button"
      tabIndex={0}
      data-detection-interactive
      aria-expanded={isActive}
      aria-label={`Detection ${index + 1}${detection.deerName ? `, ${detection.deerName}` : ''}`}
      className={cn(
        'rounded-lg border transition-all duration-200 cursor-pointer',
        isSelected
          ? 'border-copper bg-copper/20 ring-2 ring-copper'
          : isActive
          ? 'border-copper bg-copper/10 ring-1 ring-copper/60'
          : isHovered
          ? 'border-copper/70 bg-slate-deep ring-1 ring-copper/40'
          : 'border-slate-700 bg-slate-deep'
      )}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleActivate()
        }
      }}
      onMouseEnter={() => setHoveredDetectionId(detection.id)}
      onMouseLeave={() => setHoveredDetectionId(null)}
    >
      {/* Compact row: number · traits + size · confidence */}
      <div className="flex items-center gap-3 p-2.5 md:p-3">
        <span
          className={cn(
            'flex h-6 w-6 flex-none items-center justify-center rounded-full border text-xs font-bold tabular-nums',
            isActive || isSelected
              ? 'border-cream bg-copper text-slate-deep'
              : 'border-cream/40 bg-slate text-cream-dark'
          )}
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-medium capitalize text-cream">
              {detection.deerName || formatDeerInfo()}
            </span>
            {showSizeBadge && (
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                  detection.sizeClass === 'trophy'
                    ? 'bg-copper text-cream'
                    : detection.sizeClass === 'standard'
                    ? 'bg-green-500/20 text-green-300'
                    : detection.sizeClass === 'basket'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-slate text-cream-dark'
                )}
              >
                {formatSizeClass(detection.sizeClass as string)}
              </span>
            )}
          </div>
          {pointRange && (
            <p className="mt-0.5 text-xs text-cream-dark tabular-nums">{pointRange}</p>
          )}
        </div>
        <span className="flex-none text-xs text-cream-dark tabular-nums">
          {Math.round(detection.confidence * 100)}%
        </span>
      </div>

      {/* Expanded detail — only for the located (pinned) detection */}
      {isActive && (
        <div className="space-y-2 border-t border-slate-700 px-3 pb-3 pt-2">
          {/* Quality status */}
          {detection.qualityStatus && detection.qualityStatus !== 'pending' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-cream-dark">Quality</span>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                  detection.qualityStatus === 'high_quality'
                    ? 'bg-green-500/20 text-green-300'
                    : detection.qualityStatus === 'low_quality'
                    ? 'bg-red-500/20 text-red-300'
                    : 'bg-amber-500/20 text-amber-300'
                )}
              >
                {detection.qualityStatus === 'high_quality'
                  ? 'High'
                  : detection.qualityStatus === 'low_quality'
                  ? 'Low'
                  : 'Review'}
              </span>
              {detection.qualityScore !== null && detection.qualityScore !== undefined && (
                <span className="text-xs text-cream-dark tabular-nums">
                  {Math.round(detection.qualityScore * 100)}%
                </span>
              )}
            </div>
          )}

          {/* Feedback history */}
          {feedback.length > 0 && (
            <div>
              <p className="mb-1 text-xs text-cream-dark">Feedback ({feedback.length})</p>
              <div className="space-y-1">
                {feedback.map((fb) => (
                  <div
                    key={fb.id}
                    className="rounded border border-slate-700 bg-slate/50 px-2 py-1 text-xs"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                        {FEEDBACK_TYPE_LABELS[fb.feedback_type]}
                      </span>
                      <span className="text-[10px] text-cream-dark">
                        {new Date(fb.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    {fb.notes && (
                      <p className="mt-1 text-[11px] leading-tight text-cream-dark">{fb.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                openPanel(detection.id)
              }}
              className="inline-flex items-center rounded-md bg-copper px-3 py-1.5 text-sm font-medium text-cream transition-colors hover:bg-copper-light"
            >
              View details
            </button>
            {detection.deerId && (
              <Link
                href={`/deer/${detection.deerId}`}
                className="text-sm text-copper transition-colors hover:text-copper-light"
                onClick={(e) => e.stopPropagation()}
              >
                View Deer Profile
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
