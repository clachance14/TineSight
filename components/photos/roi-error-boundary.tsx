"use client"

import { Component, ReactNode } from "react"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

/**
 * Error boundary component for ROI selector and control panel.
 * Catches errors and displays a user-friendly fallback message.
 */
export class ROIErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error details for debugging
    console.error("ROI Component Error:", error, errorInfo)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg bg-slate p-4 border border-cream/20">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-cream">
              Unable to Load ROI Tools
            </h3>
            <p className="text-xs text-cream/70">
              An unexpected error occurred while loading the region of interest
              selector. Please refresh the page and try again.
            </p>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <details className="text-xs text-cream/50 mt-2">
                <summary className="cursor-pointer">Error Details</summary>
                <pre className="mt-1 whitespace-pre-wrap break-words">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
