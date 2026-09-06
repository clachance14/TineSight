'use client'

import Link from 'next/link'
import { useCameras } from '@/lib/hooks/use-cameras'
import { CameraCard } from './camera-card'
import { PageState } from '@/components/layout/page-state'
import { Button } from '@/components/ui/button'

export function CameraList(): React.JSX.Element {
  const { data, isLoading, isError, refetch } = useCameras()
  if (isLoading)
    return (
      <p role="status" className="py-12 text-sm text-weathered">
        Loading your cameras…
      </p>
    )
  if (isError)
    return (
      <PageState
        error
        title="Your cameras couldn’t load."
        description="Try again to reconnect to your camera records."
      >
        <Button
          onClick={() => {
            void refetch()
          }}
        >
          Try again
        </Button>
      </PageState>
    )
  if ((data?.cameras.length ?? 0) === 0)
    return (
      <PageState
        title="Your cameras start here."
        description="Upload original trail camera photos. When camera information is included, we’ll organize the photos by camera for you."
      >
        <Button asChild className="min-h-12">
          <Link href="/upload">Upload photos</Link>
        </Button>
      </PageState>
    )
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {data?.cameras.map((camera) => (
        <CameraCard key={camera.id} camera={camera} />
      ))}
    </div>
  )
}
