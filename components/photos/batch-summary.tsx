'use client'

import { useBatchStatus } from '@/lib/hooks/use-photos'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Loader2 } from 'lucide-react'

interface BatchSummaryProps {
  batchId: string
  variant?: 'compact' | 'expanded'
}

export function BatchSummary({ batchId, variant = 'compact' }: BatchSummaryProps) {
  const { data, isLoading, error } = useBatchStatus(batchId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-sm text-destructive">
          Failed to load batch status: {error.message}
        </p>
      </div>
    )
  }

  if (!data?.batch) {
    return null
  }

  const { batch } = data
  const progressValue = batch.total_images > 0
    ? (batch.processed_images / batch.total_images) * 100
    : 0

  // Determine badge variant based on status
  const getBadgeVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success'
      case 'processing':
      case 'uploading':
        return 'processing'
      case 'failed':
      case 'partial_error':
        return 'destructive'
      case 'pending':
        return 'secondary'
      default:
        return 'default'
    }
  }

  // Format status text
  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed'
      case 'processing':
        return 'Processing'
      case 'uploading':
        return 'Uploading'
      case 'failed':
        return 'Failed'
      case 'partial_error':
        return 'Partial Error'
      case 'pending':
        return 'Pending'
      default:
        return status
    }
  }

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                Batch Progress
              </span>
              <Badge variant={getBadgeVariant(batch.status)}>
                {getStatusText(batch.status)}
              </Badge>
            </div>
            <span className="text-sm text-muted-foreground">
              {batch.processed_images} / {batch.total_images}
            </span>
          </div>
          <Progress value={progressValue} className="h-2" />
        </div>
        {(batch.status === 'processing' || batch.status === 'uploading') && (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        )}
      </div>
    )
  }

  // Expanded view
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Batch Status</CardTitle>
          <Badge variant={getBadgeVariant(batch.status)}>
            {getStatusText(batch.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Overall Progress</span>
            <span className="font-medium text-foreground">
              {Math.round(progressValue)}%
            </span>
          </div>
          <Progress value={progressValue} className="h-3" />
        </div>

        {/* Counts Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-semibold text-foreground">
              {batch.total_images}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Uploaded</p>
            <p className="text-2xl font-semibold text-foreground">
              {batch.uploaded_images}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Processing</p>
            <p className="text-2xl font-semibold text-blue-500">
              {batch.uploaded_images - batch.processed_images}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Completed</p>
            <p className="text-2xl font-semibold text-green-500">
              {batch.successful_images}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Failed</p>
            <p className="text-2xl font-semibold text-red-500">
              {batch.failed_images}
            </p>
          </div>
        </div>

        {/* Error Message */}
        {batch.error_message && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
            <p className="text-sm font-medium text-destructive">Error Details</p>
            <p className="mt-1 text-xs text-destructive/90">
              {batch.error_message}
            </p>
          </div>
        )}

        {/* Metadata */}
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <div>
            <span className="font-medium">Created:</span>{' '}
            {new Date(batch.created_at).toLocaleString()}
          </div>
          {batch.completed_at && (
            <div>
              <span className="font-medium">Completed:</span>{' '}
              {new Date(batch.completed_at).toLocaleString()}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
