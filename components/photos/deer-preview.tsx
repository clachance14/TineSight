'use client'

import { useEffect, useRef, useState, type JSX } from 'react'
import { deerPreviewFrame } from '@/lib/image/deer-preview'
import type { DetectionResponse } from '@/lib/hooks/use-detection'

/** Prefer the saved crop; fall back to framing the deer in a bounded photo variant. */
export function DeerPreview({ detection }: { detection: DetectionResponse }): JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [natural, setNatural] = useState({ src: '', width: 0, height: 0 })
  const [failed, setFailed] = useState<string[]>([])
  const crop = detection.cropUrl
  const preview = detection.previewUrl
  const src = crop != null && crop !== '' && !failed.includes(crop) ? crop
    : preview != null && preview !== '' && !failed.includes(preview) ? preview : null
  useEffect(() => {
    const el = container.current
    if (el === null) return
    const measure = (): void => setSize({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const frame = src !== null && src !== crop && natural.src === src
    ? deerPreviewFrame(detection, natural.width, natural.height, size.width, size.height) : null

  return <div ref={container} data-deer-preview className="relative min-h-36 overflow-hidden rounded-lg bg-forest sm:min-h-44">
    {src !== null ? (
      // Native image dimensions let us frame a detection without fetching an original.
      // eslint-disable-next-line @next/next/no-img-element
      <img key={src} src={src} alt="Selected deer" className={frame === null ? 'absolute inset-0 h-full w-full object-contain' : 'absolute max-w-none'}
        style={frame ?? undefined}
        onLoad={event => setNatural({ src, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
        onError={() => setFailed(previous => [...previous, src])} />
    ) : <div role="status" className="flex h-full min-h-36 items-center justify-center p-3 text-center text-xs text-weathered">Deer preview unavailable</div>}
  </div>
}
