'use client'

import { Component, ErrorInfo, ReactNode, useEffect, useState } from 'react'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Debug error boundary that displays errors on-screen.
 * Useful for debugging crashes on iOS Safari where console isn't accessible.
 */
export class DebugErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })
    // Also log to console for desktop debugging
    console.error('DebugErrorBoundary caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[9999] overflow-auto bg-red-950 p-4 text-white">
          <div className="max-w-full">
            <h1 className="text-xl font-bold text-red-300 mb-4">
              ⚠️ React Error Caught
            </h1>

            <div className="mb-4 p-3 bg-red-900/50 rounded overflow-x-auto">
              <p className="font-mono text-sm break-all">
                <strong>Error:</strong> {this.state.error?.message || 'Unknown error'}
              </p>
            </div>

            {this.state.error?.stack && (
              <div className="mb-4">
                <p className="font-semibold text-red-300 mb-2">Stack Trace:</p>
                <pre className="p-3 bg-black/30 rounded text-xs overflow-x-auto whitespace-pre-wrap break-all">
                  {this.state.error.stack}
                </pre>
              </div>
            )}

            {this.state.errorInfo?.componentStack && (
              <div className="mb-4">
                <p className="font-semibold text-red-300 mb-2">Component Stack:</p>
                <pre className="p-3 bg-black/30 rounded text-xs overflow-x-auto whitespace-pre-wrap break-all">
                  {this.state.errorInfo.componentStack}
                </pre>
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-500 rounded font-medium"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Hook component to catch global errors and unhandled rejections.
 * Place this at the app level to catch errors outside React's tree.
 */
export function GlobalErrorDisplay() {
  const [globalErrors, setGlobalErrors] = useState<string[]>([])

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const errorMsg = `[window.onerror] ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`
      setGlobalErrors(prev => [...prev, errorMsg])
      console.error('Global error caught:', event)
    }

    const handleRejection = (event: PromiseRejectionEvent) => {
      const errorMsg = `[unhandledrejection] ${event.reason?.message || event.reason || 'Unknown promise rejection'}`
      setGlobalErrors(prev => [...prev, errorMsg])
      console.error('Unhandled rejection caught:', event)
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  if (globalErrors.length === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9999] max-h-[50vh] overflow-auto bg-orange-950 p-4 text-white border-t-4 border-orange-500">
      <div className="flex justify-between items-start mb-2">
        <h2 className="font-bold text-orange-300">
          ⚠️ Global Errors ({globalErrors.length})
        </h2>
        <button
          onClick={() => setGlobalErrors([])}
          className="px-2 py-1 bg-orange-700 hover:bg-orange-600 rounded text-sm"
        >
          Clear
        </button>
      </div>
      <div className="space-y-2">
        {globalErrors.map((err, i) => (
          <pre key={i} className="p-2 bg-black/30 rounded text-xs whitespace-pre-wrap break-all">
            {err}
          </pre>
        ))}
      </div>
    </div>
  )
}
