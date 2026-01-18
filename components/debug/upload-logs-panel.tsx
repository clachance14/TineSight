'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronDown, ChevronUp, Copy, Download, Trash2, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getUploadLogger,
  getUploadMetrics,
  type LogEntry,
  type UploadMetricsSummary,
} from '@/lib/upload'

interface UploadLogsPanelProps {
  /** Session ID to display logs for */
  sessionId: string | null
  /** Whether to show the panel (controlled externally) */
  visible?: boolean
}

/**
 * Debug panel showing upload logs and metrics.
 * Only renders in development mode.
 */
export function UploadLogsPanel({ sessionId, visible = true }: UploadLogsPanelProps) {
  const [mounted, setMounted] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [metrics, setMetrics] = useState<UploadMetricsSummary | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Initialize after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  // Poll for new entries
  useEffect(() => {
    if (!sessionId) return

    const updateData = () => {
      const logger = getUploadLogger(sessionId)
      const metricsCollector = getUploadMetrics(sessionId)

      if (logger) {
        setEntries(logger.getEntries())
      }
      if (metricsCollector) {
        setMetrics(metricsCollector.getSummary())
      }
    }

    updateData()
    const interval = setInterval(updateData, 500)

    return () => clearInterval(interval)
  }, [sessionId])

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [entries.length, expanded])

  const handleCopy = useCallback(async () => {
    if (!sessionId) return

    const logger = getUploadLogger(sessionId)
    if (!logger) return

    try {
      await navigator.clipboard.writeText(logger.export())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy logs:', err)
    }
  }, [sessionId])

  const handleDownload = useCallback(() => {
    if (!sessionId) return

    const logger = getUploadLogger(sessionId)
    if (!logger) return

    const content = logger.exportJSON()
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `upload-log-${sessionId}-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [sessionId])

  const handleClear = useCallback(() => {
    if (!sessionId) return

    const logger = getUploadLogger(sessionId)
    if (logger) {
      logger.clear()
      setEntries([])
    }
  }, [sessionId])

  // Only render in development mode and after mount
  if (process.env.NODE_ENV !== 'development' || !mounted || !visible || !sessionId) {
    return null
  }

  const getEntryColor = (entry: LogEntry): string => {
    switch (entry.type) {
      case 'ERROR':
        return 'text-red-400'
      case 'PHASE':
        return 'text-green-400'
      case 'METRIC':
        return 'text-copper'
      default:
        return 'text-cream-dark'
    }
  }

  const formatThroughput = (bps: number): string => {
    if (bps < 1024) return `${bps.toFixed(0)} B/s`
    if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`
    return `${(bps / (1024 * 1024)).toFixed(2)} MB/s`
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 min-w-[320px] max-w-[480px] rounded-lg border border-copper/30 bg-slate/95 font-mono text-xs shadow-lg backdrop-blur-sm">
      {/* Header */}
      <div
        className="flex cursor-pointer items-center justify-between border-b border-copper/20 px-3 py-2"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="font-sans text-sm font-semibold text-copper">
            Upload Logs
          </span>
          <span className="rounded bg-slate-deep/50 px-1.5 py-0.5 text-cream-dark">
            {entries.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-cream-dark" />
          ) : (
            <ChevronUp className="h-4 w-4 text-cream-dark" />
          )}
        </div>
      </div>

      {/* Collapsed metrics summary */}
      {!expanded && metrics && (
        <div className="flex items-center gap-4 px-3 py-2 text-cream-dark">
          <span>
            {metrics.successfulFiles}/{metrics.totalFiles} files
          </span>
          <span>{formatThroughput(metrics.averageThroughputBps)}</span>
          {metrics.failedFiles > 0 && (
            <span className="text-red-400">{metrics.failedFiles} failed</span>
          )}
        </div>
      )}

      {/* Expanded view */}
      {expanded && (
        <>
          {/* Actions bar */}
          <div className="flex items-center gap-1 border-b border-copper/20 px-2 py-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-6 gap-1 px-2 text-xs"
            >
              {copied ? (
                <>
                  <CheckCircle className="h-3 w-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownload}
              className="h-6 gap-1 px-2 text-xs"
            >
              <Download className="h-3 w-3" />
              Export
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-6 gap-1 px-2 text-xs text-red-400 hover:text-red-300"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </Button>
          </div>

          {/* Metrics summary */}
          {metrics && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-copper/20 px-3 py-2">
              <MetricRow label="Files" value={`${metrics.successfulFiles}/${metrics.totalFiles}`} />
              <MetricRow label="Failed" value={metrics.failedFiles.toString()} error={metrics.failedFiles > 0} />
              <MetricRow label="Avg Throughput" value={formatThroughput(metrics.averageThroughputBps)} />
              <MetricRow label="Peak Throughput" value={formatThroughput(metrics.peakThroughputBps)} />
              {metrics.peakMemoryMB !== null && (
                <MetricRow label="Peak Memory" value={`${metrics.peakMemoryMB.toFixed(1)} MB`} />
              )}
              <MetricRow label="Files/sec" value={metrics.filesPerSecond.toFixed(2)} />
            </div>
          )}

          {/* Log entries */}
          <div
            ref={scrollRef}
            className="max-h-[300px] overflow-y-auto px-2 py-2"
          >
            {entries.length === 0 ? (
              <div className="py-4 text-center text-cream-dark">
                No log entries yet
              </div>
            ) : (
              <div className="space-y-0.5">
                {entries.slice(-100).map((entry, index) => (
                  <div key={index} className="leading-relaxed">
                    <span className="text-cream-dark/60">
                      {entry.timestamp.slice(11, 23)}
                    </span>{' '}
                    <span className={getEntryColor(entry)}>
                      [{entry.type}
                      {entry.phase ? `:${entry.phase}` : ''}]
                    </span>{' '}
                    <span className="text-cream">{entry.message}</span>
                    {entry.data && (
                      <span className="text-cream-dark/80">
                        {' '}
                        {JSON.stringify(entry.data)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

interface MetricRowProps {
  label: string
  value: string
  error?: boolean
}

function MetricRow({ label, value, error }: MetricRowProps) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-cream-dark">{label}:</span>
      <span className={error ? 'text-red-400 font-semibold' : 'text-cream font-semibold'}>
        {value}
      </span>
    </div>
  )
}
