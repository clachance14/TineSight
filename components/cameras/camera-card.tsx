'use client'

import { cn } from '@/lib/utils'
import { Camera, ImageIcon } from 'lucide-react'
import type { CameraWithPhotoCount } from '@/lib/services/cameras'

interface CameraCardProps {
  camera: CameraWithPhotoCount
  onClick?: () => void
}

export function CameraCard({ camera, onClick }: CameraCardProps) {
  const { name, make, model, photo_count, created_at } = camera

  // Format created date
  const createdDate = new Date(created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  // Build make/model display
  const makeModel = [make, model].filter(Boolean).join(' ')

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-lg transition-all duration-200',
        'bg-slate border border-slate-light p-4',
        'hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20',
        onClick && 'cursor-pointer'
      )}
    >
      {/* Camera icon and name */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-copper/20 border border-copper/30">
          <Camera className="h-5 w-5 text-copper" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-cream truncate">{name}</h3>
          {makeModel && (
            <p className="text-sm text-cream-dark truncate">{makeModel}</p>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-4 flex items-center justify-between text-sm">
        {/* Photo count */}
        <div className="flex items-center gap-1.5 text-cream-dark">
          <ImageIcon className="h-4 w-4" />
          <span>
            {photo_count} {photo_count === 1 ? 'photo' : 'photos'}
          </span>
        </div>

        {/* Created date */}
        <span className="text-cream-dark/60">{createdDate}</span>
      </div>
    </div>
  )
}
