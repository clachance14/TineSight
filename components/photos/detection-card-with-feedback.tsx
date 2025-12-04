"use client"

import Link from 'next/link'
import { useFeedback } from '@/lib/hooks/use-roi'
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
  }
  index: number
}

export function DetectionCardWithFeedback({ detection, index }: DetectionCardProps) {
  // Fetch feedback for this detection
  const { data: feedbackData } = useFeedback(detection.id)
  const feedback = feedbackData?.feedback || []

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-deep p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-cream">
          Detection {index + 1}
        </span>
        <span className="text-xs text-cream-dark">
          {Math.round(detection.confidence * 100)}% confidence
        </span>
      </div>

      {detection.class && (
        <div>
          <p className="text-xs text-cream-dark">Class</p>
          <p className="text-sm text-cream capitalize">{detection.class}</p>
        </div>
      )}

      {/* Quality status */}
      {detection.qualityStatus && detection.qualityStatus !== 'pending' && (
        <div>
          <p className="text-xs text-cream-dark">Quality</p>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              detection.qualityStatus === 'high_quality'
                ? 'bg-green-500/20 text-green-300'
                : detection.qualityStatus === 'low_quality'
                ? 'bg-red-500/20 text-red-300'
                : 'bg-amber-500/20 text-amber-300'
            }`}>
              {detection.qualityStatus === 'high_quality' ? 'High' :
               detection.qualityStatus === 'low_quality' ? 'Low' : 'Review'}
            </span>
            {detection.qualityScore !== null && detection.qualityScore !== undefined && (
              <span className="text-xs text-cream-dark">
                {Math.round(detection.qualityScore * 100)}%
              </span>
            )}
          </div>
        </div>
      )}

      {/* Feedback history */}
      {feedback.length > 0 && (
        <div>
          <p className="text-xs text-cream-dark mb-1">Feedback ({feedback.length})</p>
          <div className="space-y-1">
            {feedback.map((fb) => (
              <div
                key={fb.id}
                className="text-xs bg-slate/50 rounded px-2 py-1 border border-slate-700"
              >
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-300">
                    {FEEDBACK_TYPE_LABELS[fb.feedback_type]}
                  </span>
                  <span className="text-cream-dark text-[10px]">
                    {new Date(fb.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
                {fb.notes && (
                  <p className="text-cream-dark mt-1 text-[11px] leading-tight">
                    {fb.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-xs text-cream-dark">
        Bounding Box: {Math.round(detection.bboxX)}, {Math.round(detection.bboxY)}, {Math.round(detection.bboxWidth)}x{Math.round(detection.bboxHeight)}
      </div>

      {detection.deerId && (
        <div className="pt-2 border-t border-slate-700">
          <Link
            href={`/deer/${detection.deerId}`}
            className="text-sm text-copper hover:text-copper-light transition-colors"
          >
            View Deer Profile
          </Link>
        </div>
      )}
    </div>
  )
}
