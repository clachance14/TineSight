'use client'

import { useState, useEffect } from 'react'
import { useAdaptiveThrottle } from '@/lib/hooks/use-adaptive-throttle'
import type { ThrottleMetrics } from '@/lib/throttle'

export function ThrottleMetricsPanel() {
  // Track if component has mounted (prevents hydration mismatch)
  const [mounted, setMounted] = useState(false)

  // Get both throttler instances
  const uploadThrottle = useAdaptiveThrottle('upload')
  const exifThrottle = useAdaptiveThrottle('exif')

  // State for metrics (enables re-renders)
  const [uploadMetrics, setUploadMetrics] = useState<ThrottleMetrics | null>(null)
  const [exifMetrics, setExifMetrics] = useState<ThrottleMetrics | null>(null)
  const [activeTab, setActiveTab] = useState<'exif' | 'upload'>('exif')

  // Initialize after mount and poll metrics every 500ms
  useEffect(() => {
    setMounted(true)
    setUploadMetrics(uploadThrottle.getMetrics())
    setExifMetrics(exifThrottle.getMetrics())

    const interval = setInterval(() => {
      setUploadMetrics(uploadThrottle.getMetrics())
      setExifMetrics(exifThrottle.getMetrics())
    }, 500)
    return () => clearInterval(interval)
  }, [uploadThrottle, exifThrottle])

  // Only render in development mode and after mount
  if (process.env.NODE_ENV !== 'development' || !mounted || !uploadMetrics || !exifMetrics) {
    return null
  }

  const metrics = activeTab === 'upload' ? uploadMetrics : exifMetrics

  // Color-code circuit state
  const getCircuitColor = (state: string) => {
    switch (state) {
      case 'CLOSED':
        return 'text-green-400'
      case 'OPEN':
        return 'text-red-400'
      case 'HALF_OPEN':
        return 'text-yellow-400'
      default:
        return 'text-cream-dark'
    }
  }

  // Format elapsed time as mm:ss
  const formatElapsedTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed top-20 right-4 z-50 min-w-[280px] rounded-lg border border-copper/30 bg-slate/90 p-4 font-mono text-xs shadow-lg backdrop-blur-sm">
      <div className="mb-2 font-sans text-sm font-semibold text-copper">
        Throttle Metrics
      </div>

      {/* Tab selector */}
      <div className="mb-3 flex gap-1">
        <button
          onClick={() => setActiveTab('exif')}
          className={`rounded px-2 py-1 text-xs transition-colors ${
            activeTab === 'exif'
              ? 'bg-copper text-slate-deep'
              : 'bg-slate-deep/50 text-cream-dark hover:bg-slate-deep'
          }`}
        >
          EXIF
        </button>
        <button
          onClick={() => setActiveTab('upload')}
          className={`rounded px-2 py-1 text-xs transition-colors ${
            activeTab === 'upload'
              ? 'bg-copper text-slate-deep'
              : 'bg-slate-deep/50 text-cream-dark hover:bg-slate-deep'
          }`}
        >
          Upload
        </button>
      </div>

      {/* Timing section */}
      {metrics.sessionStartTime && (
        <div className={`mb-3 rounded p-2 ${metrics.isRunning ? 'bg-copper/20 border border-copper/30' : 'bg-slate-deep/50'}`}>
          <div className="flex justify-between items-center mb-1">
            <div className="flex items-center gap-2">
              <span className="text-copper font-semibold">Session Timer</span>
              {metrics.isRunning ? (
                <span className="inline-flex items-center gap-1 text-xs text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Running
                </span>
              ) : (
                <span className="text-xs text-cream-dark">Complete</span>
              )}
            </div>
            <span className="text-cream text-lg font-bold">
              {formatElapsedTime(metrics.elapsedMs)}
            </span>
          </div>
          <div className="flex justify-between text-cream-dark">
            <span>{metrics.itemsProcessed} items</span>
            <span className="text-copper font-semibold">
              {metrics.itemsPerSecond.toFixed(1)}/sec
            </span>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <MetricRow
          label="Concurrency"
          value={metrics.currentConcurrency.toString()}
        />
        <MetricRow
          label="Chunk Size"
          value={metrics.currentChunkSize.toString()}
        />
        <MetricRow
          label="Success Rate"
          value={`${(metrics.successRate * 100).toFixed(1)}%`}
        />
        <MetricRow
          label="P95 Latency"
          value={`${metrics.p95Latency.toFixed(0)}ms`}
        />
        <MetricRow
          label="Circuit State"
          value={metrics.circuitState}
          valueClassName={getCircuitColor(metrics.circuitState)}
        />
        <MetricRow
          label="Phase"
          value={metrics.inSlowStart ? 'Slow Start' : 'AIMD'}
        />
        <MetricRow
          label="Discovered Limit"
          value={metrics.discoveredLimit?.toString() ?? 'N/A'}
        />
        <MetricRow
          label="Rate Limit Errors"
          value={metrics.rateLimitErrors.toString()}
          valueClassName={metrics.rateLimitErrors > 0 ? 'text-red-400' : ''}
        />
        <MetricRow
          label="Total Requests"
          value={metrics.totalRequests.toString()}
        />
      </div>
    </div>
  )
}

interface MetricRowProps {
  label: string
  value: string
  valueClassName?: string
}

function MetricRow({ label, value, valueClassName }: MetricRowProps) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-cream-dark">{label}:</span>
      <span className={valueClassName || 'text-cream font-semibold'}>
        {value}
      </span>
    </div>
  )
}
