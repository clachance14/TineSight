'use client'

import { useCallback, useEffect, useRef, useState, type HTMLAttributes, type RefObject, type PointerEvent, type TouchEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { clampPhotoZoom, fitPhoto, zoomPhotoAt, type PhotoZoom, type PhotoZoomBounds } from '@/lib/photos/zoom'
import type { ObjectContainBounds } from '@/lib/hooks/use-object-contain-bounds'

export function usePhotoZoom(container: RefObject<HTMLDivElement | null>, image: ObjectContainBounds, enabled: boolean): { view: PhotoZoom; handlers: HTMLAttributes<HTMLDivElement> } {
  const [view, setView] = useState<PhotoZoom>(fitPhoto)
  const current = useRef(view)
  const mouse = useRef<{ x: number; y: number } | null>(null)
  const touch = useRef<{ x: number; y: number; distance: number } | null>(null)
  const moved = useRef(false)
  const lastTap = useRef({ time: 0, x: 0, y: 0 })
  const bounds = useRef<PhotoZoomBounds>({ width: 0, height: 0, imageWidth: 0, imageHeight: 0 })
  const update = useCallback((next: PhotoZoom): void => {
    current.current = clampPhotoZoom(next, bounds.current)
    setView(current.current)
  }, [])
  const anchor = (x: number, y: number): { x: number; y: number } => {
    const rect = container.current?.getBoundingClientRect()
    return { x: x - (rect?.left ?? 0) - (rect?.width ?? 0) / 2, y: y - (rect?.top ?? 0) - (rect?.height ?? 0) / 2 }
  }
  const zoom = (scale: number, x: number, y: number): void => {
    update(zoomPhotoAt(current.current, scale, anchor(x, y), bounds.current))
  }
  const isControl = (target: EventTarget | null): boolean => target instanceof Element && target.closest('button, a, input, [data-photo-control]') !== null

  useEffect(() => {
    const el = container.current
    if (!enabled || el === null) return
    const wheel = (event: WheelEvent): void => {
      if (isControl(event.target)) return
      event.preventDefault()
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1)
      const rect = el.getBoundingClientRect()
      update(zoomPhotoAt(current.current, current.current.scale * Math.exp(-delta * 0.003), { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }, bounds.current))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [container, enabled, update])

  useEffect(() => {
  bounds.current = { width: container.current?.clientWidth ?? 0, height: container.current?.clientHeight ?? 0, imageWidth: image.width, imageHeight: image.height }
    update(current.current)
  }, [container, image.width, image.height, update])

  return {
    view,
    handlers: {
      onDoubleClick(event: MouseEvent<HTMLDivElement>): void {
        if (!enabled || isControl(event.target)) return
        event.preventDefault()
        zoom(current.current.scale > 1 ? 1 : 2.5, event.clientX, event.clientY)
      },
      onPointerDown(event: PointerEvent<HTMLDivElement>): void {
        if (!enabled || event.pointerType === 'touch' || event.button !== 0 || current.current.scale <= 1 || isControl(event.target)) return
        mouse.current = { x: event.clientX, y: event.clientY }
        moved.current = false
        event.currentTarget.setPointerCapture(event.pointerId)
        event.preventDefault()
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>): void {
        const start = mouse.current
        if (start === null) return
        const dx = event.clientX - start.x, dy = event.clientY - start.y
        if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true
        update({ ...current.current, x: current.current.x + dx, y: current.current.y + dy })
        mouse.current = { x: event.clientX, y: event.clientY }
      },
      onPointerUp(): void { mouse.current = null },
      onPointerCancel(): void { mouse.current = null },
      onLostPointerCapture(): void { mouse.current = null },
      onClickCapture(event: MouseEvent<HTMLDivElement>): void {
        if (moved.current) { event.preventDefault(); event.stopPropagation(); moved.current = false }
      },
      onTouchStart(event: TouchEvent<HTMLDivElement>): void {
        if (!enabled || isControl(event.target)) return
        const a = event.touches[0], b = event.touches[1]
        if (!a) return
        moved.current = false
        touch.current = b ? { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2, distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) } : { x: a.clientX, y: a.clientY, distance: 0 }
        if (b || current.current.scale > 1) event.stopPropagation()
      },
      onTouchMove(event: TouchEvent<HTMLDivElement>): void {
        const start = touch.current, a = event.touches[0], b = event.touches[1]
        if (!enabled || start === null || !a) return
        if (b) {
          event.stopPropagation(); moved.current = true
          const x = (a.clientX + b.clientX) / 2, y = (a.clientY + b.clientY) / 2
          const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
          if (start.distance > 0) {
            const next = zoomPhotoAt(current.current, current.current.scale * distance / start.distance, anchor(start.x, start.y), bounds.current)
            update({ ...next, x: next.x + x - start.x, y: next.y + y - start.y })
          }
          touch.current = { x, y, distance }
        } else if (current.current.scale > 1) {
          event.stopPropagation(); moved.current = true
          if (start.distance === 0) update({ ...current.current, x: current.current.x + a.clientX - start.x, y: current.current.y + a.clientY - start.y })
          touch.current = { x: a.clientX, y: a.clientY, distance: 0 }
        } else if (Math.abs(a.clientX - start.x) + Math.abs(a.clientY - start.y) > 8) moved.current = true
      },
      onTouchEnd(event: TouchEvent<HTMLDivElement>): void {
        const start = touch.current
        if (!enabled || start === null) return
        if (start.distance > 0 || current.current.scale > 1) event.stopPropagation()
        const remaining = event.touches[0]
        if (remaining) { touch.current = { x: remaining.clientX, y: remaining.clientY, distance: 0 }; return }
        touch.current = null
        const end = event.changedTouches[0]
        if (moved.current || !end) { lastTap.current.time = 0; return }
        const now = Date.now(), last = lastTap.current
        if (now - last.time < 300 && Math.hypot(end.clientX - last.x, end.clientY - last.y) < 25) {
          event.stopPropagation(); zoom(current.current.scale > 1 ? 1 : 2.5, end.clientX, end.clientY); lastTap.current.time = 0
        } else lastTap.current = { time: now, x: end.clientX, y: end.clientY }
      },
      onTouchCancel(): void { touch.current = null; lastTap.current.time = 0 },
      onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
        if (!enabled || event.target !== event.currentTarget) return
        if (event.key === '+' || event.key === '=') update(zoomPhotoAt(current.current, current.current.scale * 1.25, { x: 0, y: 0 }, bounds.current))
        else if (event.key === '-') update(zoomPhotoAt(current.current, current.current.scale / 1.25, { x: 0, y: 0 }, bounds.current))
        else if (event.key === 'Escape' || event.key === '0') update(fitPhoto)
        else if (current.current.scale > 1 && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
          update({ ...current.current, x: current.current.x + (event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0), y: current.current.y + (event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0) })
        } else return
        event.preventDefault(); event.stopPropagation()
      },
    },
  }
}
