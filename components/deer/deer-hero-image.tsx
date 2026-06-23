'use client'

import { useEffect, useRef, useState } from 'react'

interface ReferenceBbox {
  x: number | null
  y: number | null
  width: number | null
  height: number | null
}

interface DeerHeroImageProps {
  imageUrl: string
  bbox?: ReferenceBbox | null
  alt: string
}

const COVER_STYLE = (url: string): React.CSSProperties => ({
  backgroundImage: `url(${url})`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
})

/**
 * Hero image that frames a detection's bounding box dead-center.
 *
 * CSS percentage positioning can't center an arbitrary region (it aligns the
 * image's P% point to the container's P% point, not the region to the center),
 * so we measure the natural image + container in pixels and pan precisely.
 * The pan is clamped to the cover bounds, so the image always fully covers the
 * hero — the buck centers as far as it can without exposing empty space.
 */
export function DeerHeroImage({ imageUrl, bbox, alt }: DeerHeroImageProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<React.CSSProperties>(COVER_STYLE(imageUrl))

  useEffect(() => {
    const hasBbox =
      bbox != null &&
      bbox.x !== null &&
      bbox.y !== null &&
      bbox.width !== null &&
      bbox.height !== null

    if (!hasBbox) {
      setStyle(COVER_STYLE(imageUrl))
      return
    }

    // YOLO normalized coordinates (0-10000 scale, center-based)
    const SCALE = 10000
    const cx = (bbox.x as number) / SCALE
    const cy = (bbox.y as number) / SCALE
    const bw = (bbox.width as number) / SCALE
    const bh = (bbox.height as number) / SCALE

    // Breathing room kept around the detection so the antler tips never touch
    // the hero edge.
    const PAD = 0.08

    let cancelled = false

    const compute = (natW: number, natH: number): void => {
      const el = containerRef.current
      if (!el || !natW || !natH) return
      const cW = el.clientWidth
      const cH = el.clientHeight
      if (!cW || !cH) return

      // Hard ceiling: the largest scale at which the WHOLE padded bbox (rack and
      // all) still fits inside the hero. Never exceed this — that is what was
      // clipping the antlers.
      const fitScale = Math.min(
        (cW * (1 - 2 * PAD)) / (bw * natW),
        (cH * (1 - 2 * PAD)) / (bh * natH)
      )

      // Prefer to fill the hero (cover) and, where there is vertical/horizontal
      // slack, zoom enough to pull the bbox toward dead-center. fx/fy are the
      // bbox's distance to the nearest image edge.
      const coverScale = Math.max(cW / natW, cH / natH)
      const fx = Math.min(cx, 1 - cx)
      const fy = Math.min(cy, 1 - cy)
      const centerScaleX = fx > 0.02 ? cW / (2 * fx * natW) : coverScale
      const centerScaleY = fy > 0.02 ? cH / (2 * fy * natH) : coverScale

      // Zoom toward centering/cover, but the fit ceiling always wins so the
      // full rack stays visible.
      const scale = Math.min(Math.max(coverScale, centerScaleX, centerScaleY), fitScale)

      const imgW = natW * scale
      const imgH = natH * scale

      // Pan so the bbox center lands at the hero center. When the image covers
      // the axis, clamp to its edges (no gaps); when the fit ceiling left the
      // image smaller than the hero, center the image instead.
      const left =
        imgW >= cW ? Math.min(0, Math.max(cW - imgW, cW / 2 - cx * imgW)) : (cW - imgW) / 2
      const top =
        imgH >= cH ? Math.min(0, Math.max(cH - imgH, cH / 2 - cy * imgH)) : (cH - imgH) / 2

      setStyle({
        backgroundImage: `url(${imageUrl})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${imgW}px ${imgH}px`,
        backgroundPosition: `${left}px ${top}px`,
      })
    }

    const img = new Image()
    img.onload = () => {
      if (!cancelled) compute(img.naturalWidth, img.naturalHeight)
    }
    img.src = imageUrl

    // Recompute on hero resize (orientation change, breakpoint shifts).
    const ro = new ResizeObserver(() => {
      if (img.naturalWidth) compute(img.naturalWidth, img.naturalHeight)
    })
    if (containerRef.current) ro.observe(containerRef.current)

    return () => {
      cancelled = true
      ro.disconnect()
    }
  }, [imageUrl, bbox])

  return <div ref={containerRef} className="absolute inset-0" style={style} role="img" aria-label={alt} />
}
