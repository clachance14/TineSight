'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PhotoPager } from '@/components/photos/photo-pager'
import { PhotoDetailClient } from '@/components/photos/photo-detail-client'
import { PhotoInfo } from '@/components/photos/photo-info'
import { PhotoDeleteButton } from '@/components/photos/photo-delete-button'
import { DetectionEditPanel } from '@/components/photos/detection-edit-panel'
import type { PhotoViewDTO } from '@/lib/services/photo-view'

const IMG_W = 10000
const IMG_H = 10000

interface PhotoDetailViewerProps {
  initial: PhotoViewDTO
  navQueryString: string
  returnUrl: string
}

interface Window3 {
  prev: PhotoViewDTO | null
  current: PhotoViewDTO
  next: PhotoViewDTO | null
}

export function PhotoDetailViewer({ initial, navQueryString, returnUrl }: PhotoDetailViewerProps) {
  const [win, setWin] = useState<Window3>({ prev: null, current: initial, next: null })
  const cacheRef = useRef<Map<string, PhotoViewDTO>>(new Map([[initial.id, initial]]))
  const qs = navQueryString ? `?${navQueryString}` : ''
  const current = win.current

  const fetchView = useCallback(
    async (id: string, force = false): Promise<PhotoViewDTO | null> => {
      const cached = cacheRef.current.get(id)
      if (cached && !force && cached.expiresAt > Date.now()) return cached
      try {
        const res = await fetch(`/api/photos/${id}/pager${qs}`, { credentials: 'same-origin' })
        if (!res.ok) return cached ?? null
        const dto = (await res.json()) as PhotoViewDTO
        cacheRef.current.set(id, dto)
        return dto
      } catch {
        return cached ?? null
      }
    },
    [qs],
  )

  // Prefetch neighbors INTO STATE (so slides re-render) + prune cache to current ±1.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [prevDto, nextDto] = await Promise.all([
        current.prevId ? fetchView(current.prevId) : Promise.resolve(null),
        current.nextId ? fetchView(current.nextId) : Promise.resolve(null),
      ])
      if (cancelled) return
      setWin((w) => (w.current.id === current.id ? { prev: prevDto, current: w.current, next: nextDto } : w))
      const keep = new Set([current.id, current.prevId, current.nextId].filter(Boolean) as string[])
      for (const key of Array.from(cacheRef.current.keys())) {
        if (!keep.has(key)) cacheRef.current.delete(key)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [current.id, current.prevId, current.nextId, fetchView])

  const settle = useCallback(
    async (direction: 'prev' | 'next') => {
      const targetId = direction === 'next' ? current.nextId : current.prevId
      if (!targetId) return
      let dto = direction === 'next' ? win.next : win.prev
      if (!dto || dto.id !== targetId || dto.expiresAt <= Date.now()) {
        dto = await fetchView(targetId, dto != null && dto.expiresAt <= Date.now())
      }
      if (!dto) return
      cacheRef.current.set(dto.id, dto)
      setWin({ prev: null, current: dto, next: null }) // neighbors refill via effect
      window.history.replaceState(window.history.state, '', `/photos/${dto.id}${qs}`)
    },
    [current.nextId, current.prevId, win.next, win.prev, fetchView, qs],
  )

  // Force-refresh the current photo's signed URLs if the image fails (expired link).
  const refreshCurrent = useCallback(async () => {
    const dto = await fetchView(current.id, true)
    if (dto) setWin((w) => ({ ...w, current: dto }))
  }, [current.id, fetchView])

  const renderSlide = useCallback(
    (offset: -1 | 0 | 1) => {
      const dto = offset === -1 ? win.prev : offset === 1 ? win.next : win.current
      if (!dto) return <div className="aspect-video w-full rounded-lg bg-slate-deep" />
      const interactive = offset === 0
      const extra = interactive ? { onImageError: refreshCurrent } : {}
      return (
        <PhotoDetailClient
          key={dto.id}
          photo={dto}
          imageWidth={IMG_W}
          imageHeight={IMG_H}
          interactive={interactive}
          {...extra}
        />
      )
    },
    [win, refreshCurrent],
  )

  return (
    <div className="space-y-3 md:space-y-4">
      {/* Per-photo actions, driven by CURRENT so they track swipes */}
      <div className="flex items-center justify-end gap-1 md:gap-2">
        <div className="hidden items-center gap-2 md:flex">
          {current.prevId ? (
            <Button variant="outline" size="icon" asChild>
              <Link href={`/photos/${current.prevId}${qs}`}><ChevronLeft className="h-4 w-4" /></Link>
            </Button>
          ) : (
            <Button variant="outline" size="icon" disabled><ChevronLeft className="h-4 w-4" /></Button>
          )}
          {current.nextId ? (
            <Button variant="outline" size="icon" asChild>
              <Link href={`/photos/${current.nextId}${qs}`}><ChevronRight className="h-4 w-4" /></Link>
            </Button>
          ) : (
            <Button variant="outline" size="icon" disabled><ChevronRight className="h-4 w-4" /></Button>
          )}
        </div>
        <PhotoDeleteButton photoId={current.id} returnUrl={returnUrl} />
      </div>

      {/* Photo zone: pager (mobile) / static (desktop) */}
      <div className="md:hidden">
        <PhotoPager
          hasPrev={current.prevId != null}
          hasNext={current.nextId != null}
          renderSlide={renderSlide}
          onSettle={settle}
        />
      </div>
      <div className="hidden md:block">
        <PhotoDetailClient
          key={current.id}
          photo={current}
          imageWidth={IMG_W}
          imageHeight={IMG_H}
          interactive
          onImageError={refreshCurrent}
        />
      </div>

      {/* Info zone: stays put, swaps content */}
      <PhotoInfo photo={current} />

      {/* Single global edit panel (driven by the detection-edit store) */}
      <DetectionEditPanel />
    </div>
  )
}
