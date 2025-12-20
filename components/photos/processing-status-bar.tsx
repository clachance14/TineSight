'use client'

import { Loader2, CheckCircle2 } from 'lucide-react'
import { useActiveProcessingBatch } from '@/lib/hooks/use-active-batch'

/**
 * Displays real-time processing status for the current batch.
 * Shows counts for pending, processing, and completed photos.
 * Auto-hides when processing completes.
 */
export function ProcessingStatusBar(): React.JSX.Element | null {
  const { batchId, stats, isLoading, isProcessing } = useActiveProcessingBatch()

  // Don't render if no active batch or still loading initial data
  if (!batchId || isLoading || !stats) {
    return null
  }

  // Don't render if nothing is processing (all done)
  if (!isProcessing && stats.total_photos > 0) {
    return null
  }

  const { total_photos, pending_photos, processing_photos, analyzed_photos, failed_photos } = stats
  const completed = analyzed_photos + failed_photos

  return (
    <div className="flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2.5">
      <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
      <span className="text-sm text-cream">
        Analyzing{' '}
        <span className="font-semibold tabular-nums">{total_photos}</span>
        {' '}photos:
      </span>
      <div className="flex items-center gap-3 text-sm">
        {pending_photos > 0 && (
          <span className="text-cream-dark">
            <span className="font-semibold tabular-nums text-cream">{pending_photos}</span>
            {' '}pending
          </span>
        )}
        {processing_photos > 0 && (
          <span className="text-blue-400">
            <span className="font-semibold tabular-nums">{processing_photos}</span>
            {' '}processing
          </span>
        )}
        {completed > 0 && (
          <span className="flex items-center gap-1 text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="font-semibold tabular-nums">{completed}</span>
          </span>
        )}
        {failed_photos > 0 && (
          <span className="text-red-400">
            <span className="font-semibold tabular-nums">{failed_photos}</span>
            {' '}failed
          </span>
        )}
      </div>
    </div>
  )
}
