'use client'

import React from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PhotoErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface PhotoErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Error boundary component for photo-related components.
 * Catches rendering errors and provides a user-friendly fallback UI.
 *
 * @example
 * ```tsx
 * <PhotoErrorBoundary onError={(error) => console.error(error)}>
 *   <PhotoGrid photos={photos} />
 * </PhotoErrorBoundary>
 * ```
 */
export class PhotoErrorBoundary extends React.Component<
  PhotoErrorBoundaryProps,
  PhotoErrorBoundaryState
> {
  constructor(props: PhotoErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
    }
  }

  static getDerivedStateFromError(error: Error): PhotoErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error for debugging
    console.error('PhotoErrorBoundary caught an error:', error, errorInfo)

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }
  }

  handleReset = (): void => {
    // Reset error state to retry rendering
    this.setState({
      hasError: false,
      error: null,
    })
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default error UI
      return (
        <div className="flex items-center justify-center min-h-[300px] bg-slate-deep rounded-lg border border-slate">
          <div className="text-center space-y-4 p-6 max-w-md">
            <div className="flex justify-center">
              <div className="rounded-full bg-red-500/10 p-3">
                <AlertCircle className="h-8 w-8 text-red-500" />
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-cream">
                Something went wrong
              </h3>
              <p className="text-sm text-cream-dark">
                We encountered an error while loading your photos. Please try again.
              </p>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="text-left">
                <summary className="text-xs text-cream-dark cursor-pointer hover:text-cream">
                  Error details
                </summary>
                <pre className="mt-2 text-xs text-red-400 bg-slate p-3 rounded overflow-auto max-h-40">
                  {this.state.error.message}
                  {this.state.error.stack && `\n\n${this.state.error.stack}`}
                </pre>
              </details>
            )}

            <Button
              onClick={this.handleReset}
              className="bg-copper hover:bg-copper-light text-slate-deep font-medium"
            >
              Try Again
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Hook-based wrapper for functional components that need error boundary functionality.
 * Note: This is a convenience wrapper - the actual error boundary is still a class component.
 */
export function withPhotoErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<PhotoErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <PhotoErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </PhotoErrorBoundary>
  )

  WrappedComponent.displayName = `withPhotoErrorBoundary(${
    Component.displayName || Component.name || 'Component'
  })`

  return WrappedComponent
}
