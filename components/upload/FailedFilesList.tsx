'use client'

import React, { useState, useMemo, memo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { FileStatusInfo } from '@/lib/upload/types'
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  RotateCcw,
  FileWarning,
} from 'lucide-react'

interface FailedFilesListProps {
  /** Array of files that failed to upload */
  failedFiles: FileStatusInfo[]
  /** Callback to retry a specific file */
  onRetry: (fileId: string) => void
  /** Callback to retry all failed files */
  onRetryAll: () => void
  /** Whether retry is currently in progress */
  isRetrying?: boolean
  /** Maximum number of files to show before "and X more" */
  maxVisible?: number
}

/**
 * Formats file size to human-readable string
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Single failed file row component
 */
const FailedFileRow = memo(function FailedFileRow({
  file,
  onRetry,
  isRetrying,
}: {
  file: FileStatusInfo
  onRetry: (fileId: string) => void
  isRetrying: boolean
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 px-3 rounded-md bg-destructive/5 border border-destructive/20 hover:border-destructive/30 transition-colors">
      <FileWarning className="h-4 w-4 text-destructive shrink-0 mt-0.5" />

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-medium text-foreground truncate"
            title={file.filename}
          >
            {file.filename}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatFileSize(file.size)}
          </span>
        </div>

        {file.errorMessage && (
          <p className="text-xs text-destructive/80 line-clamp-2">
            {file.errorMessage}
          </p>
        )}

        {file.retryCount > 0 && (
          <span className="inline-block text-xs text-muted-foreground">
            {file.retryCount} retry attempt{file.retryCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRetry(file.clientId)}
        disabled={isRetrying}
        className="shrink-0 h-7 px-2 text-xs hover:bg-destructive/10 hover:text-destructive"
      >
        <RefreshCw className={cn(
          "h-3.5 w-3.5 mr-1",
          isRetrying && "animate-spin"
        )} />
        Retry
      </Button>
    </div>
  )
})

/**
 * Lists files that failed to upload with retry functionality.
 * - Shows filename and error reason
 * - Retry individual or retry all button
 * - Collapsible list (collapsed if 0 failures)
 */
export function FailedFilesList({
  failedFiles,
  onRetry,
  onRetryAll,
  isRetrying = false,
  maxVisible = 10,
}: FailedFilesListProps): React.JSX.Element | null {
  const [isOpen, setIsOpen] = useState(failedFiles.length > 0 && failedFiles.length <= 5)

  // Files to display
  const { visibleFiles, overflowCount } = useMemo(() => {
    if (failedFiles.length <= maxVisible) {
      return { visibleFiles: failedFiles, overflowCount: 0 }
    }
    return {
      visibleFiles: failedFiles.slice(0, maxVisible),
      overflowCount: failedFiles.length - maxVisible,
    }
  }, [failedFiles, maxVisible])

  // Categorize errors for summary
  const errorSummary = useMemo(() => {
    const categories: Record<string, number> = {}

    failedFiles.forEach(file => {
      const error = file.errorMessage || 'Unknown error'
      // Simplify error message for categorization
      const category = error.includes('timeout') ? 'Timeout'
        : error.includes('network') ? 'Network error'
        : error.includes('size') ? 'File too large'
        : error.includes('type') ? 'Invalid type'
        : error.includes('expired') ? 'URL expired'
        : 'Upload failed'

      categories[category] = (categories[category] || 0) + 1
    })

    return categories
  }, [failedFiles])

  // Don't render if no failed files
  if (failedFiles.length === 0) {
    return null
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="space-y-3">
        {/* Header with retry all button */}
        <div className="flex items-center justify-between">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-sm font-medium text-destructive hover:text-destructive/80 transition-colors group">
              {isOpen ? (
                <ChevronDown className="h-4 w-4 transition-transform" />
              ) : (
                <ChevronRight className="h-4 w-4 transition-transform" />
              )}
              <AlertCircle className="h-4 w-4" />
              <span>
                {failedFiles.length} file{failedFiles.length > 1 ? 's' : ''} failed
              </span>
            </button>
          </CollapsibleTrigger>

          <Button
            variant="outline"
            size="sm"
            onClick={onRetryAll}
            disabled={isRetrying}
            className="h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/10 hover:border-destructive/50"
          >
            <RotateCcw className={cn(
              "h-3.5 w-3.5 mr-1.5",
              isRetrying && "animate-spin"
            )} />
            Retry All
          </Button>
        </div>

        {/* Error categories summary (shown when collapsed) */}
        {!isOpen && Object.keys(errorSummary).length > 0 && (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {Object.entries(errorSummary).map(([category, count]) => (
              <span
                key={category}
                className="px-2 py-0.5 rounded-md bg-muted/50"
              >
                {category}: {count}
              </span>
            ))}
          </div>
        )}

        <CollapsibleContent className="space-y-0">
          {/* File list */}
          <div className="space-y-2 pt-1">
            {visibleFiles.map((file) => (
              <FailedFileRow
                key={file.clientId}
                file={file}
                onRetry={onRetry}
                isRetrying={isRetrying}
              />
            ))}

            {/* Overflow indicator */}
            {overflowCount > 0 && (
              <div className="flex items-center justify-center py-2 text-sm text-muted-foreground">
                <span className="px-3 py-1 rounded-md bg-muted/30">
                  and {overflowCount} more file{overflowCount > 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>

          {/* Bulk actions footer for many failures */}
          {failedFiles.length > 5 && (
            <div className="flex items-center justify-between pt-4 mt-4 border-t border-border/50">
              <span className="text-xs text-muted-foreground">
                Total failed: {failedFiles.length} files
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  className="h-7 text-xs"
                >
                  Collapse
                </Button>
              </div>
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
