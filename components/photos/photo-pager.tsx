'use client'

import { useCallback, useRef, useState, type ReactNode } from 'react'
import { resolveSwipe } from '@/lib/photo-pager/swipe'

interface PhotoPagerProps {
  hasPrev: boolean
  hasNext: boolean
  /** Render a slide given a relative offset: -1 prev, 0 current, +1 next. */
  renderSlide: (offset: -1 | 0 | 1) => ReactNode
  /** Called after the commit animation finishes; parent advances `current`. */
  onSettle: (direction: 'prev' | 'next') => void
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'dragging'; dx: number }
  | { kind: 'settling'; toPercent: -200 | -100 | 0 }

export function PhotoPager({ hasPrev, hasNext, renderSlide, onSettle }: PhotoPagerProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const lastRef = useRef<{ x: number; t: number } | null>(null)
  const axisRef = useRef<'h' | 'v' | null>(null)
  const widthRef = useRef(0)
  const commitRef = useRef<'prev' | 'next' | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // Ignore new touches while a settle animation is in flight.
    if (phase.kind === 'settling') return
    const t = e.touches[0]
    if (!t) return
    widthRef.current = containerRef.current?.clientWidth ?? window.innerWidth
    startRef.current = { x: t.clientX, y: t.clientY }
    lastRef.current = { x: t.clientX, t: e.timeStamp }
    axisRef.current = null
    setPhase({ kind: 'dragging', dx: 0 })
  }, [phase.kind])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const s = startRef.current
    const t = e.touches[0]
    if (!s || !t) return
    const rawDx = t.clientX - s.x
    const rawDy = t.clientY - s.y
    // Lock axis on first significant movement; vertical → let the page scroll.
    if (axisRef.current === null && (Math.abs(rawDx) > 8 || Math.abs(rawDy) > 8)) {
      axisRef.current = Math.abs(rawDx) > Math.abs(rawDy) ? 'h' : 'v'
    }
    if (axisRef.current !== 'h') return
    let d = rawDx
    if ((d > 0 && !hasPrev) || (d < 0 && !hasNext)) d = d * 0.25 // rubber-band at an edge
    lastRef.current = { x: t.clientX, t: e.timeStamp }
    setPhase({ kind: 'dragging', dx: d })
  }, [hasPrev, hasNext])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const s = startRef.current
    const last = lastRef.current
    startRef.current = null
    if (!s || axisRef.current !== 'h') {
      setPhase({ kind: 'idle' })
      return
    }
    const end = e.changedTouches[0]
    const endX = end?.clientX ?? s.x
    const moved = endX - s.x
    const dt = Math.max(1, last ? e.timeStamp - last.t : 16)
    const vx = last ? (endX - last.x) / dt : 0
    const result = resolveSwipe({ width: widthRef.current, dx: moved, vx, hasPrev, hasNext })
    // No movement and no commit → nothing to animate; go straight to idle so we
    // don't wait on a transitionend that will never fire.
    if (result === 'current' && Math.abs(moved) < 0.5) {
      setPhase({ kind: 'idle' })
      return
    }
    commitRef.current = result === 'current' ? null : result
    setPhase({ kind: 'settling', toPercent: result === 'next' ? -200 : result === 'prev' ? 0 : -100 })
  }, [hasPrev, hasNext])

  const onTransitionEnd = useCallback((e: React.TransitionEvent<HTMLDivElement>) => {
    // transitionend BUBBLES — only react to the track's own transform finishing,
    // not a descendant's (detection-overlay boxes use transition-all, control
    // buttons use transition-colors). Without this guard a child transition
    // completing mid-settle would commit the swipe early / to the wrong photo.
    if (e.target !== e.currentTarget || e.propertyName !== 'transform') return
    if (phase.kind !== 'settling') return
    const commit = commitRef.current
    commitRef.current = null
    // Reset to centered WITHOUT transition AND (if committed) advance the parent.
    // React batches both updates into one paint: the neighbor slide that just
    // animated to center is re-keyed into the middle slot and stays put — no flash.
    setPhase({ kind: 'idle' })
    if (commit !== null) onSettle(commit)
  }, [phase.kind, onSettle])

  const transform =
    phase.kind === 'dragging'
      ? `translateX(calc(-100% + ${phase.dx}px))`
      : `translateX(${phase.kind === 'settling' ? phase.toPercent : -100}%)`
  const transition =
    phase.kind === 'settling' ? 'transform 220ms cubic-bezier(0.22,0.61,0.36,1)' : 'none'

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden touch-pan-y"
      onTouchStartCapture={(event) => {
        // A second finger hands the gesture to inline zoom, cancelling any swipe.
        if (event.touches.length > 1) {
          startRef.current = null
          lastRef.current = null
          axisRef.current = null
          commitRef.current = null
          setPhase({ kind: 'idle' })
        }
      }}
      onTouchCancel={() => { startRef.current = null; axisRef.current = null; setPhase({ kind: 'idle' }) }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="flex w-full"
        style={{ transform, transition }}
        onTransitionEnd={onTransitionEnd}
      >
        <div className="w-full shrink-0" inert aria-hidden="true">{renderSlide(-1)}</div>
        <div className="w-full shrink-0">{renderSlide(0)}</div>
        <div className="w-full shrink-0" inert aria-hidden="true">{renderSlide(1)}</div>
      </div>
    </div>
  )
}
