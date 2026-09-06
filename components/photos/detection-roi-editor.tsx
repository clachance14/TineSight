'use client'

import { useMemo, useState, type JSX } from 'react'
import { Button } from '@/components/ui/button'
import { apiRoiToCoordinates, useROI, useSaveROI } from '@/lib/hooks/use-roi'
import { ROISelector, type ROICoordinates } from './roi-selector'

interface Props {
  detection: {
    id: string
    imageUrl: string | null
    bboxX: number | null
    bboxY: number | null
    bboxWidth: number | null
    bboxHeight: number | null
  }
  onBack: () => void
}

export function DetectionROIEditor({ detection, onBack }: Props): JSX.Element {
  const { data, isLoading, isError, refetch } = useROI(detection.id)
  const save = useSaveROI()
  const [draft, setDraft] = useState<ROICoordinates | null>(null)
  const [imageReady, setImageReady] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const existingROI = useMemo(() => apiRoiToCoordinates(data?.roi ?? null), [data?.roi])
  const bbox = detection.bboxX !== null && detection.bboxY !== null && detection.bboxWidth !== null && detection.bboxHeight !== null
    ? { x: detection.bboxX, y: detection.bboxY, width: detection.bboxWidth, height: detection.bboxHeight }
    : null

  return (
    <div className="space-y-4">
      <Button variant="outline" onClick={onBack} disabled={save.isPending}>Back to details</Button>
      {isLoading ? <p role="status" className="text-cream-dark">Loading ROI…</p> : isError ? (
        <div role="alert" className="space-y-2 text-cream"><p>Unable to load the saved ROI.</p><Button onClick={() => void refetch()}>Retry</Button></div>
      ) : (detection.imageUrl === null || detection.imageUrl === '') || imageFailed ? <p role="alert" className="text-cream-dark">The photo is unavailable for ROI editing.</p> : (
        <>
          <p className="text-sm text-cream-dark">Drag a rectangle around this deer’s head and antlers, then save.</p>
          <div className="relative touch-none overflow-hidden rounded-md">
            {/* Natural image height keeps ROI coordinates aligned with the full photo. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={detection.imageUrl} alt="Photo for selecting the deer’s head and antlers" className="block h-auto w-full" draggable={false} onLoad={() => setImageReady(true)} onError={() => setImageFailed(true)} />
            {imageReady && <ROISelector existingROI={draft ?? existingROI} detectionBbox={bbox} isReference={data?.roi?.is_reference ?? false} enabled={!save.isPending} onROIChange={setDraft} />}
          </div>
          {save.isError && <p role="alert" className="text-red-400">{save.error.message}</p>}
          <Button disabled={!draft || !imageReady || save.isPending} onClick={() => {
            void (async () => {
              if (!draft) return
              try {
                await save.mutateAsync({ detectionId: detection.id, roi: draft })
                onBack()
              } catch {
                // Keep the selection available so the user can retry.
              }
            })()
          }}>{save.isPending ? 'Saving…' : 'Save ROI'}</Button>
        </>
      )}
    </div>
  )
}
