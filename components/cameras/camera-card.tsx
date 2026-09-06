import Link from 'next/link'
import { ArrowUpRight, Camera } from 'lucide-react'
import type { CameraWithPhotoCount } from '@/lib/services/cameras'

export function CameraCard({
  camera,
}: {
  camera: CameraWithPhotoCount
}): React.JSX.Element {
  const makeModel = [camera.make, camera.model].filter(Boolean).join(' ')
  return (
    <Link
      href={`/photos?triageView=all&cameraId=${encodeURIComponent(camera.id)}`}
      className="group rounded-xl border border-forest-light bg-forest/20 p-5 transition-colors hover:border-brass/50 sm:p-6"
    >
      <div className="flex items-start gap-4">
        <Camera
          className="mt-1 size-5 shrink-0 text-brass"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h2 className="break-words font-display text-2xl">{camera.name}</h2>
          <p className="mt-2 text-sm text-weathered">
            {makeModel.length > 0 ? makeModel : 'Trail camera'}
          </p>
        </div>
        <ArrowUpRight
          className="size-5 shrink-0 text-weathered group-hover:text-brass"
          aria-hidden="true"
        />
      </div>
      <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-forest-light pt-4">
        <span className="font-mono text-xs text-brass-light">
          {camera.photo_count} {camera.photo_count === 1 ? 'photo' : 'photos'}
        </span>
        <span className="text-xs text-weathered">
          Added{' '}
          {new Date(camera.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      </div>
    </Link>
  )
}
