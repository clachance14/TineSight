'use client'

import React, { useRef, useEffect, useMemo, memo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { ChunkStatus, ChunkStatusState } from '@/lib/upload/types'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface UploadQueueProps {
  /** Array of chunk statuses */
  chunks: ChunkStatus[]
  /** Index of the currently processing chunk (0-based) */
  currentChunkIndex: number
}

/**
 * Maps chunk state to visual styling
 */
function getChunkStyles(state: ChunkStatusState, isCurrent: boolean): {
  bg: string
  border: string
  text: string
  animate: boolean
} {
  const baseStyles = {
    pending: {
      bg: 'bg-muted/50',
      border: 'border-border/30',
      text: 'text-muted-foreground',
      animate: false,
    },
    uploading: {
      bg: 'bg-primary/20',
      border: 'border-primary',
      text: 'text-primary',
      animate: true,
    },
    completed: {
      bg: 'bg-primary/10',
      border: 'border-primary/50',
      text: 'text-primary',
      animate: false,
    },
    failed: {
      bg: 'bg-destructive/20',
      border: 'border-destructive',
      text: 'text-destructive',
      animate: false,
    },
    partial: {
      bg: 'bg-amber-500/20',
      border: 'border-amber-500',
      text: 'text-amber-500',
      animate: false,
    },
  }

  const styles = baseStyles[state]

  // Highlight current chunk more prominently
  if (isCurrent && state === 'uploading') {
    return {
      ...styles,
      bg: 'bg-primary/30',
      border: 'border-primary ring-2 ring-primary/30',
    }
  }

  return styles
}

/**
 * Single chunk indicator component
 */
const ChunkIndicator = memo(function ChunkIndicator({
  chunk,
  isCurrent,
  isCompact,
}: {
  chunk: ChunkStatus
  isCurrent: boolean
  isCompact: boolean
}) {
  const styles = getChunkStyles(chunk.state, isCurrent)
  const progress = chunk.totalFiles > 0
    ? Math.round(((chunk.completedFiles + chunk.skippedFiles) / chunk.totalFiles) * 100)
    : 0

  return (
    <div
      className={cn(
        'relative flex-shrink-0 rounded-md border transition-all duration-300',
        styles.bg,
        styles.border,
        styles.animate && 'animate-pulse',
        isCompact ? 'w-6 h-6' : 'w-14 h-10',
        isCurrent && 'ring-offset-1 ring-offset-background'
      )}
      title={`Chunk ${chunk.index + 1}: ${chunk.completedFiles}/${chunk.totalFiles} files (${chunk.state})`}
    >
      {!isCompact ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-xs font-semibold', styles.text)}>
            {chunk.index + 1}
          </span>
          <span className={cn('text-[10px]', styles.text)}>
            {chunk.completedFiles}/{chunk.totalFiles}
          </span>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn('text-[10px] font-medium', styles.text)}>
            {chunk.index + 1}
          </span>
        </div>
      )}

      {/* Progress bar at bottom of chunk */}
      {chunk.state === 'uploading' && !isCompact && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted/30 rounded-b-md overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Failed indicator dot */}
      {chunk.failedFiles > 0 && (
        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-destructive border border-background" />
      )}
    </div>
  )
})

/**
 * Visual queue showing chunk processing status.
 * Each chunk is represented as an indicator showing its state:
 * - pending (gray)
 * - uploading (primary color, animated)
 * - complete (green)
 * - failed (red)
 */
export function UploadQueue({
  chunks,
  currentChunkIndex,
}: UploadQueueProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const currentChunkRef = useRef<HTMLDivElement>(null)
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Use compact mode for large number of chunks
  const isCompact = chunks.length > 100

  // Collapse by default if many chunks
  useEffect(() => {
    if (chunks.length > 50 && !isCollapsed) {
      setIsCollapsed(true)
    }
  }, [chunks.length, isCollapsed])

  // Auto-scroll to keep current chunk visible
  useEffect(() => {
    if (currentChunkRef.current && containerRef.current && !isCollapsed) {
      const container = containerRef.current
      const element = currentChunkRef.current

      const containerRect = container.getBoundingClientRect()
      const elementRect = element.getBoundingClientRect()

      // Check if element is outside visible area
      if (elementRect.left < containerRect.left || elementRect.right > containerRect.right) {
        element.scrollIntoView({
          behavior: 'smooth',
          inline: 'center',
          block: 'nearest',
        })
      }
    }
  }, [currentChunkIndex, isCollapsed])

  // Summary statistics
  const stats = useMemo(() => {
    const completed = chunks.filter(c => c.state === 'completed').length
    const failed = chunks.filter(c => c.state === 'failed' || c.failedFiles > 0).length
    const uploading = chunks.filter(c => c.state === 'uploading').length
    const pending = chunks.filter(c => c.state === 'pending').length

    return { completed, failed, uploading, pending }
  }, [chunks])

  if (chunks.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic py-2">
        No chunks to display
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header with toggle for large uploads */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium text-foreground">
            Upload Queue
          </span>
          <span className="text-muted-foreground">
            Chunk {Math.min(currentChunkIndex + 1, chunks.length)} of {chunks.length}
          </span>
        </div>

        {/* Stats summary */}
        <div className="flex items-center gap-3 text-xs">
          {stats.completed > 0 && (
            <span className="text-primary">{stats.completed} complete</span>
          )}
          {stats.uploading > 0 && (
            <span className="text-primary animate-pulse">{stats.uploading} uploading</span>
          )}
          {stats.pending > 0 && (
            <span className="text-muted-foreground">{stats.pending} pending</span>
          )}
          {stats.failed > 0 && (
            <span className="text-destructive">{stats.failed} with errors</span>
          )}
        </div>
      </div>

      {/* Collapsible toggle for many chunks */}
      {chunks.length > 50 && (
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {isCollapsed ? (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              Show chunk details
            </>
          ) : (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              Hide chunk details
            </>
          )}
        </button>
      )}

      {/* Collapsed summary view */}
      {isCollapsed ? (
        <div className="flex items-center gap-2 py-2">
          {/* Mini progress bar showing overall chunk progress */}
          <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden flex">
            {/* Completed */}
            <div
              className="h-full bg-primary/60"
              style={{ width: `${(stats.completed / chunks.length) * 100}%` }}
            />
            {/* Currently uploading */}
            <div
              className="h-full bg-primary animate-pulse"
              style={{ width: `${(stats.uploading / chunks.length) * 100}%` }}
            />
            {/* Failed */}
            <div
              className="h-full bg-destructive"
              style={{ width: `${(stats.failed / chunks.length) * 100}%` }}
            />
          </div>
        </div>
      ) : (
        /* Chunk strip container */
        <div
          ref={containerRef}
          className={cn(
            'flex gap-1.5 overflow-x-auto py-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent',
            isCompact ? 'gap-1' : 'gap-1.5'
          )}
        >
          {chunks.map((chunk) => {
            const isCurrent = chunk.index === currentChunkIndex
            return (
              <div
                key={chunk.index}
                ref={isCurrent ? currentChunkRef : undefined}
              >
                <ChunkIndicator
                  chunk={chunk}
                  isCurrent={isCurrent}
                  isCompact={isCompact}
                />
              </div>
            )
          })}
        </div>
      )}

      {/* Legend for chunk states */}
      {!isCollapsed && chunks.length <= 50 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm bg-muted/50 border border-border/30" />
            <span>Pending</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm bg-primary/30 border border-primary" />
            <span>Uploading</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm bg-primary/10 border border-primary/50" />
            <span>Complete</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm bg-destructive/20 border border-destructive" />
            <span>Failed</span>
          </div>
        </div>
      )}
    </div>
  )
}
