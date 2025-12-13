'use client'

import { cn } from '@/lib/utils'
import { CheckCircle2, XCircle, Loader2, Camera } from 'lucide-react'

interface PhotoCardProps {
  photo: {
    id: string
    thumbnailUrl: string | null
    detectionStatus: string
    classification: string | null
    detectionCount?: number
    qualityStatus?: string | null
  }
  onClick?: () => void
  isSelected?: boolean
  isLoading?: boolean
}

export function PhotoCard({ photo, onClick, isSelected, isLoading }: PhotoCardProps) {
  const { thumbnailUrl, detectionStatus, classification, detectionCount, qualityStatus } = photo

  // Status badge configuration
  const statusConfig = {
    processing: {
      icon: Loader2,
      label: 'Processing',
      className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      iconClassName: 'animate-spin',
    },
    completed: {
      icon: CheckCircle2,
      label: 'Completed',
      className: 'bg-green-500/20 text-green-400 border-green-500/30',
      iconClassName: '',
    },
    failed: {
      icon: XCircle,
      label: 'Failed',
      className: 'bg-red-500/20 text-red-400 border-red-500/30',
      iconClassName: '',
    },
  }

  const currentStatus = statusConfig[detectionStatus as keyof typeof statusConfig] || statusConfig.processing

  // Classification badge
  const hasDeer = classification === 'has_deer'
  const isEmpty = classification === 'empty'

  return (
    <div
      data-testid="photo-card"
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-lg cursor-pointer transition-all duration-200',
        'bg-slate border border-slate-light',
        'hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20',
        isSelected && 'ring-2 ring-copper scale-[1.02] shadow-lg shadow-copper/20',
        isLoading && 'opacity-50 pointer-events-none'
      )}
    >
      {/* Image container with aspect ratio */}
      <div className="relative aspect-square w-full overflow-hidden bg-slate-deep">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt="Photo thumbnail"
            className={cn(
              'h-full w-full object-cover transition-all duration-200',
              'group-hover:scale-105'
            )}
          />
        ) : (
          // Placeholder when no thumbnail
          <div className="flex h-full w-full items-center justify-center">
            <Camera className="h-12 w-12 text-slate-light" />
          </div>
        )}

        {/* Gradient overlay for better badge visibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-deep/80 via-transparent to-slate-deep/40" />

        {/* Status badge - top left */}
        <div className="absolute top-2 left-2">
          <div
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-md border backdrop-blur-sm',
              'text-xs font-medium',
              currentStatus.className
            )}
          >
            <currentStatus.icon className={cn('h-3 w-3', currentStatus.iconClassName)} />
            <span>{currentStatus.label}</span>
          </div>
        </div>

        {/* Detection count badge - top right */}
        {detectionCount !== undefined && detectionCount > 0 && (
          <div className="absolute top-2 right-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-copper/20 border border-copper/30 backdrop-blur-sm">
              <Camera className="h-3 w-3 text-copper" />
              <span className="text-xs font-medium text-copper">{detectionCount}</span>
            </div>
          </div>
        )}

        {/* Classification badge - bottom left */}
        {(hasDeer || isEmpty) && (
          <div className="absolute bottom-2 left-2">
            <div
              className={cn(
                'px-2 py-1 rounded-md border backdrop-blur-sm text-xs font-medium',
                hasDeer && 'bg-green-500/20 text-green-400 border-green-500/30',
                isEmpty && 'bg-gray-500/20 text-gray-400 border-gray-500/30'
              )}
            >
              {hasDeer ? 'Has Deer' : 'Empty'}
            </div>
          </div>
        )}

        {/* Quality status badge - bottom right */}
        {qualityStatus && qualityStatus !== 'pending' && (
          <div className="absolute bottom-2 right-2">
            <div
              className={cn(
                'px-2 py-1 rounded-md border backdrop-blur-sm text-xs font-medium',
                qualityStatus === 'high_quality' && 'bg-green-500/20 text-green-400 border-green-500/30',
                qualityStatus === 'low_quality' && 'bg-red-500/20 text-red-400 border-red-500/30',
                qualityStatus === 'manual_review' && 'bg-amber-500/20 text-amber-400 border-amber-500/30'
              )}
            >
              {qualityStatus === 'high_quality' ? 'High' :
               qualityStatus === 'low_quality' ? 'Low' : 'Review'}
            </div>
          </div>
        )}

        {/* Selection indicator overlay */}
        {isSelected && (
          <div className="absolute inset-0 bg-copper/10 border-2 border-copper rounded-lg" />
        )}

        {/* Loading skeleton overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-deep/80 backdrop-blur-sm">
            <Loader2 className="h-8 w-8 text-copper animate-spin" />
          </div>
        )}
      </div>
    </div>
  )
}
